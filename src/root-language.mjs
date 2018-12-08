import {
  parse,
  Parser, seq, repeat, alt, end, token, lit, sepBy,
  not, peek, nil, testValue, hasProps, maybe, ParseSubject, leftOp, drop, rightOp,
} from './parse-utils.mjs'
import { createBasicTokenizer, tokenize } from './token-utils.mjs'

class Quote {
  constructor (values, withContext) {
    this.values = values
    this.withContext = withContext
  }
  compile (ctx) {
    const [fn, ...args] = this.values
    if (this.withContext) { args.unshift(ctx) }
    const out = fn(...args.map(arg => arg instanceof Quote ? arg.compile(ctx) : arg))
    return out
  }
}

const q = (...values) => new Quote(values)
q.withContext = (...values) => new Quote(values, true)

const lookup = (ctx, value) => {
  const rule = ctx.ruleMap[value]
  if (!rule) { throw new Error(`unkown rule "${rule}"`) }
  if (rule instanceof Quote) {
    ctx.ruleMap[value] = Parser.lazy(() => rule.compile(ctx))
  }
  return ctx.ruleMap[value]
}

const id = (x) => x
const op2 = (op, text) => seq(() => (l, r) => q(op, l, r), lit(text))
const prefix = (op, text, Expr) => seq((expr) => q(op, expr), drop(lit(text)), Expr)
const postfix = (op, Expr, text) => seq((parser) => q(op, parser), Expr, lit(text))

const initContext = () => ({ ruleMap: {}, literals: {} })
const addRule = (ctx, name, rule) => ({ ...ctx, ruleMap: { ...ctx.ruleMap, [name]: rule }, ast: rule })

const rootParser = Parser.language({
  Program: (p) => alt(
    seq((rules) => {
      const ctx = rules.reduceRight((ctx, rule) => rule(ctx), initContext())
      const parser = ctx.ast.compile(ctx)
      // force evaluation of parser (otherwise parser won't even build until its used!)
      // this also proactively finds parse errors
      parser.parse(new ParseSubject([], 0))
      return parser
    }, repeat(p.Rule, 1)),
    seq(
      (expr) => {
        const ctx = initContext()
        const parser = expr.compile(ctx)
        parser.ast = expr
        return parser
      }, p.AltExpr
    ),
    seq(() => end, end),
  ),
  Rule: (p) => alt(
    // FooExpr = BarExpr number
    seq((name, rule) => (ctx) => addRule(ctx, name, rule), p.RuleHead, p.AltExpr),
  ),
  RuleHead: () => seq(
    ({ value }) => value, token('identifier'), lit('=')
  ),
  AltExpr: (p) => seq(
    // FooExpr | BarExpr
    (alts) => q(alt, ...alts),
    sepBy(p.SeqExpr, lit('|'))
  ),
  SeqExpr: (p) => seq(
    (exprs, mapFn = { value: id }) => q(seq, mapFn.value, ...exprs),
    repeat(seq(id, not(p.RuleHead), p.OpExpr), 1),
    maybe(token('function'))
  ),
  OpExpr: (p) => alt(
    leftOp(
      p.RepExpr,
      alt(op2(leftOp, '<%'), op2(sepBy, '%'), op2(rightOp, '%>')),
    )
  ),
  RepExpr: (p) => alt(
    postfix((x) => repeat(x, 0), p.Expr, '*'),
    postfix((x) => repeat(x, 1), p.Expr, '+'),
    postfix(maybe, p.Expr, '?'),
    p.Expr
  ),
  Expr: (p) => alt(
    prefix(not, '!', p.Expr),
    prefix(drop, '~', p.Expr),
    prefix(peek, '&', p.Expr),
    seq(() => nil, lit('nil')),
    // ( FooExpr )
    seq(id, drop(lit('(')), p.AltExpr, lit(')')),
    // { test, ast, parse }
    seq((values) => q(hasProps, ...values),
      drop(lit('{')),
      sepBy(
        seq(
          ({ value }) => q(lit, value),
          alt(token('identifier'), token('string'))
        ),
        lit(',')
      ),
      lit('}')
    ),
    // %%identifier
    seq(({ value }) => token(value), drop(lit('%%')), token('identifier')),
    // "("
    seq(({ value }) => lit(value), token('string')),
    // ${/foo+/}
    seq(({ value }) => testValue(value), hasProps('test')),
    // named values
    seq(({ value }) => q.withContext(lookup, value), token('identifier')),
    // interpolated expressions
    seq(({ value }) => value.ast, hasProps('ast')),
    // inlined parsers
    seq(({ value }) => value, not(hasProps('ast')), hasProps('parse'))
  ),
})

// for root language
const literals = ['nil', '=', '|', '(', ')', '{', '}', '*', '+', '?', '<%', '%', '%>', '&', '!', '~', ',', '%%']
const rootTokenizer = createBasicTokenizer(literals)

export function lang (strings, ...interpolations) {
  const tokens = Array.from(tokenize(rootTokenizer, strings, interpolations))
  const childParser = parse(rootParser.Program, tokens)
  const childLiterals = tokens.filter((t) => t.type === 'string').map((t) => t.value)
  const childTokenizer = createBasicTokenizer(childLiterals)
  const childTTS = (strings, ...interpolations) => {
    const tokens = Array.from(tokenize(childTokenizer, strings, interpolations))
    return parse(childParser, tokens)
  }
  return childTTS
}

export function test_lang_nil_language (expect) {
  const nil = lang``
  expect(nil``).toEqual(null)
}

export function test_lang_single_expression (expect) {
  const num = lang`~"(" %%number ")" ${({ value }) => value}`
  expect(num`(123)`).toEqual(123)
}

export function test_lang_single_recursive_rule (expect) {
  const math = lang`
      Expr = ~"(" Expr ")"
           | ~"-" Expr     ${(value) => -value}
           | %%number       ${({ value }) => value}
    `
  expect(math`123`).toEqual(123)
  expect(math`-123`).toEqual(-123)
  expect(math`(123)`).toEqual(123)
  expect(math`-(-(123))`).toEqual(123)
}

export function test_lang_multiple_rules (expect) {
  const math = lang`
    AddExpr = MulExpr <% AddOp
    AddOp   = "+" ${() => (l, r) => l + r}
            | "-" ${() => (l, r) => l - r}
    MulExpr = Expr <% MulOp
    MulOp   = "*" ${() => (l, r) => l * r}
            | "/" ${() => (l, r) => l / r}
    Expr    = ~"(" AddExpr ")"
            | ~"-" Expr  ${(value) => -value}
            | %%number     ${({ value }) => value}
  `

  expect(math`(-3.1 + 4) * 200`).toEqual((-3.1 + 4) * 200)
  expect(math`1 / 2 / 3`).toEqual((1 / 2) / 3)
}

export function test_lang_repeaters (expect) {
  const list = lang`
    Expr = ~"(" Expr* ")"
         | %%identifier    ${({ value }) => value}
  `
  expect(list`(foo bar (baz quux) xyzzy)`).toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])

  const nonEmptyList = lang`
    Expr = ~"(" Expr+ ")"
         | %%identifier    ${({ value }) => value}
  `
  expect(nonEmptyList`(foo bar (baz quux) xyzzy)`).toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])
  expect(() => nonEmptyList`()`).toThrow()
}

export function test_lang_maybe (expect) {
  const trailingCommas = lang`%%number ~"," %%number ","? ${(a, b) => [a.value, b.value]}`
  expect(trailingCommas`1, 2`).toEqual([1, 2])
  expect(trailingCommas`1, 2,`).toEqual([1, 2])
}

export function test_throw_left_recursion (expect) {
  expect(() => {
    lang`FooExpr = FooExpr "*" ${(x) => x} | %%number`
  }).toThrow()
}

export function test_interpolate_parser (expect) {
  const unwrap = (expr) => lang`~"(" ${expr} ")" ${(value) => value}`
  const num = token('number')
  expect(unwrap(num)`(123)`.value).toEqual(123)
}

export function skip_test_interpolate_parser_expressions (expect) {
  const unwrap = (expr) => lang`"(" ${expr} ")" ${(value) => value}`
  const num = lang`%%number ${({ value }) => value}`
  expect(unwrap(num)`( 123 )`).toEqual(123)
}

export function test_lookahead (expect) {
  const optionalSemis = lang`(!";" ("+" | "*") ${(x) => x.value})+ ";"? ${(xs) => xs}`
  expect(optionalSemis`+ *`).toEqual(['+', '*'])
  expect(optionalSemis`+ * ;`).toEqual(['+', '*'])
}

export function test_nil (expect) {
  const foo = lang`("foo" | nil) "bar" ${(x, y) => [x && x.value, y.value]}`
  expect(foo`foo bar`).toEqual(['foo', 'bar'])
  expect(foo`bar`).toEqual([null, 'bar'])
}
