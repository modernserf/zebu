import {
  Parser, seq, repeat, alt, end, token, lit, sepBy,
  not, peek, nil, testValue, hasProps, maybe, ParseSubject, leftOp, drop, rightOp,
} from './parse-utils'
import { createBasicTokenizer, tokenize } from './token-utils'
import { createMetalanguage } from './language-utils'

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
  if (!rule) { return token(value) }
  if (rule instanceof Quote) {
    ctx.ruleMap[value] = Parser.lazy(() => rule.compile(ctx))
  }
  return ctx.ruleMap[value]
}

const captureLiteral = (ctx, value) => {
  if (!ctx.literals[value]) {
    ctx.literals[value] = lit(value)
  }
  return ctx.literals[value]
}

const id = (x) => x
const prefix = (op, text, Expr) => seq((expr) => q(op, expr), drop(lit(text)), Expr)
const postfix = (op, Expr, text) => seq((parser) => q(op, parser), Expr, lit(text))

const initContext = () => ({ ruleMap: {}, literals: {} })

const rootParser = Parser.language({
  Program: (p) => alt(
    seq((rules) => {
      const { ruleMap, literals } = initContext()
      for (const { name, rule } of rules) {
        ruleMap[name] = rule
      }
      const ast = ruleMap[rules[0].name]
      const parser = ast.compile({ ruleMap, literals })
      // force evaluation of parser (otherwise parser won't even build until its used!)
      // this also proactively finds parse errors
      parser.parse(new ParseSubject([], 0))
      parser.literals = Object.keys(literals)
      return parser
    }, repeat(p.Rule, 1)),
    seq(
      (expr) => Object.assign(expr.compile(initContext()), { ast: expr }),
      p.AltExpr
    ),
    seq(() => end, end),
  ),
  Rule: (p) => alt(
    // FooExpr = BarExpr number
    seq((name, rule) => ({ name, rule }), p.RuleHead, p.AltExpr),
    // TODO: handle interpolation of rules?
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
    maybe(p.PlainFn)
  ),
  OpExpr: (p) => alt(
    leftOp(
      p.RepExpr,
      alt(
        seq(() => (l, r) => q(leftOp, l, r), lit('<%')),
        seq(() => (l, r) => q(rightOp, l, r), lit('%>')),
        seq(() => (l, r) => q(sepBy, l, r), lit('%')),
      )
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
    // "("
    seq(({ value }) => q.withContext(captureLiteral, value), token('string')),
    // ${/foo+/}
    seq(({ value }) => q(testValue, value), hasProps('test')),
    // named values
    seq(({ value }) => q.withContext(lookup, value), token('identifier')),
    // interpolated expressions
    seq(({ value }) => value.ast, hasProps('ast')),
    // inlined parsers
    seq(({ value }) => q(() => value), not(hasProps('ast')), hasProps('parse'))
  ),
  PlainFn: () => seq(id, not(hasProps('parse')), token('function')),
})

// for root language
const literals = ['nil', '=', '|', '(', ')', '{', '}', '*', '+', '?', '<%', '%', '%>', '&', '!', '~', ',']

const defaultTokenizer = createBasicTokenizer(literals)

export const lang = createMetalanguage({
  parser: rootParser.Program,
  getTokenizer: createBasicTokenizer,
  literals,
})

export function test_defaultTokenizer (expect) {
  const $t = (type, value, rest = {}) => ({ type, value, ...rest })
  const $toks = (strings, ...interps) => tokenize(defaultTokenizer, strings, interps)

  const foo = () => {}
  const bar = () => {}
  const tokens = Array.from($toks`
    Expr = "(" Expr ")" ${bar}
        | "-" Expr ${foo}
        | number
    `)

  expect(tokens).toEqual([
    $t('identifier', 'Expr'),
    $t('token', '='),
    $t('string', '('),
    $t('identifier', 'Expr'),
    $t('string', ')'),
    $t('function', bar, { interpolated: true }),
    $t('token', '|'),
    $t('string', '-'),
    $t('identifier', 'Expr'),
    $t('function', foo, { interpolated: true }),
    $t('token', '|'),
    $t('identifier', 'number'),
  ])
}

export function test_lang_nil_language (expect) {
  const nil = lang``
  expect(nil``).toEqual(null)
}

export function test_lang_single_expression (expect) {
  const num = lang`~"(" number ")" ${({ value }) => value}`
  expect(num`(123)`).toEqual(123)
}

export function test_lang_single_recursive_rule (expect) {
  const math = lang`
      Expr = ~"(" Expr ")"
           | ~"-" Expr     ${(value) => -value}
           | number       ${({ value }) => value}
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
            | number     ${({ value }) => value}
  `

  expect(math`(-3.1 + 4) * 200`).toEqual((-3.1 + 4) * 200)
  expect(math`1 / 2 / 3`).toEqual((1 / 2) / 3)
}

export function test_lang_repeaters (expect) {
  const list = lang`
    Expr = ~"(" Expr* ")"
         | identifier    ${({ value }) => value}
  `
  expect(list`(foo bar (baz quux) xyzzy)`).toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])

  const nonEmptyList = lang`
    Expr = ~"(" Expr+ ")"
         | identifier    ${({ value }) => value}
  `
  expect(nonEmptyList`(foo bar (baz quux) xyzzy)`).toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])
  expect(() => nonEmptyList`()`).toThrow()
}

export function test_lang_maybe (expect) {
  const trailingCommas = lang`number ~"," number ","? ${(a, b) => [a.value, b.value]}`
  expect(trailingCommas`1, 2`).toEqual([1, 2])
  expect(trailingCommas`1, 2,`).toEqual([1, 2])
}

export function test_throw_left_recursion (expect) {
  expect(() => {
    lang`FooExpr = FooExpr "*" ${(x) => x} | number`
  }).toThrow()
}

export function test_interpolate_parser (expect) {
  const unwrap = (expr) => lang`~"(" ${expr} ")" ${(value) => value}`
  const num = token('number')
  expect(unwrap(num)`(123)`.value).toEqual(123)
}

export function test_interpolate_parser_expressions (expect) {
  const unwrap = (expr) => lang`~"(" ${expr} ")" ${(value) => value}`
  const num = lang`number ${({ value }) => value}`
  expect(unwrap(num)`( 123 )`).toEqual(123)
}

export function test_interpolate_regex (expect) {
  const range = lang`number ~${/\.+/} number ${(a, b) => [a.value, b.value]}`
  expect(range`1 .. 2`).toEqual([1, 2])
  expect(range`1 ..... 2`).toEqual([1, 2])
}

export function test_lookahead (expect) {
  const optionalSemis = lang`(!";" token ${(x) => x.value})+ ";"? ${(xs) => xs}`
  expect(optionalSemis`+ *`).toEqual(['+', '*'])
  expect(optionalSemis`+ * ;`).toEqual(['+', '*'])
}

export function test_nil (expect) {
  const foo = lang`("foo" | nil) "bar" ${(x, y) => [x && x.value, y.value]}`
  expect(foo`foo bar`).toEqual(['foo', 'bar'])
  expect(foo`bar`).toEqual([null, 'bar'])
}
