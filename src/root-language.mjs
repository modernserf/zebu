import {
  parse,
  Parser, seq, repeat, alt, end, token, lit, sepBy,
  not, peek, hasProps, maybe, ParseSubject, drop,
} from './parse-utils.mjs'
import { createBasicTokenizer, tokenize, TOKENS_MACRO } from './token-utils.mjs'

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
  // if (!rule) { throw new Error(`unkown rule "${value}"`) }
  if (rule instanceof Quote) {
    ctx.ruleMap[value] = Parser.lazy(() => rule.compile(ctx))
  }
  return ctx.ruleMap[value]
}

const id = (x) => x
const prefix = (op, text, Expr) => seq((expr) => q(op, expr), drop(lit(text)), Expr)
const postfix = (op, Expr, text) => seq((parser) => q(op, parser), Expr, lit(text))

const initContext = () => ({ ruleMap: {}, literals: {} })
const addRule = (ctx, name, rule) => ({ ...ctx, ruleMap: { ...ctx.ruleMap, [name]: rule }, ast: rule })

function checkParser (parser) {
  // force evaluation of parser (otherwise parser won't even build until its used!)
  // this also proactively finds parse errors
  parser.parse(new ParseSubject([], 0))
  return parser
}

const rootParser = Parser.language({
  Program: (p) => alt(
    seq((rules) => {
      const ctx = rules.reduceRight((ctx, rule) => rule(ctx), initContext())
      return checkParser(ctx.ast.compile(ctx))
    }, repeat(p.Rule, 1)),
    seq((expr) => expr.compile(initContext()), p.AltExpr),
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
    repeat(seq(id, not(p.RuleHead), p.RepExpr), 1),
    maybe(token('function'))
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
    // ( FooExpr )
    seq(id, drop(lit('(')), p.AltExpr, lit(')')),
    // %identifier
    seq(({ value }) => seq(({ value }) => value, token(value)), drop(lit('%')), token('identifier')),
    // "foo"
    seq(({ value }) => lit(value), token('string')),
    // named values
    seq(({ value }) => q.withContext(lookup, value), token('identifier')),
    // inlined parsers
    seq(({ value }) => value, hasProps('parse'))
  ),
})

// for root language
const literals = ['nil', '=', '|', '(', ')', '{', '}', '*', '+', '?', '%', '&', '!', '~', ',']
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
  childTTS[TOKENS_MACRO] = tokens
  return childTTS
}

export function test_lang_nil_language (expect) {
  const nil = lang``
  expect(nil``).toEqual(null)
}

export function test_lang_single_expression (expect) {
  const num = lang`~"(" %number ")"`
  expect(num`(123)`).toEqual(123)
}

export function test_lang_single_recursive_rule (expect) {
  const math = lang`
      Expr = ~"(" Expr ")"
           | ~"-" Expr ${(value) => -value}
           | %number
    `
  expect(math`123`).toEqual(123)
  expect(math`-123`).toEqual(-123)
  expect(math`(123)`).toEqual(123)
  expect(math`-(-(123))`).toEqual(123)
}

export function test_lang_multiple_mutually_recursive_rules (expect) {
  const lisp = lang`
    Expr     = ~"(" ListBody? ")"
             | %identifier
    ListBody = (Expr ListBody ${(head, tail) => [head, tail]})?
  `
  expect(lisp`foo`).toEqual('foo')
  expect(lisp`()`).toEqual(undefined)
  expect(lisp`(foo bar)`).toEqual(['foo', ['bar', undefined]])
}

export function test_lang_repeaters (expect) {
  const list = lang`
    Expr = ~"(" Expr* ")"
         | %identifier
  `
  expect(list`(foo bar (baz quux) xyzzy)`).toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])

  const nonEmptyList = lang`
    Expr = ~"(" Expr+ ")"
         | %identifier
  `
  expect(nonEmptyList`(foo bar (baz quux) xyzzy)`).toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])
  expect(() => nonEmptyList`()`).toThrow()
}

export function test_lang_maybe (expect) {
  const trailingCommas = lang`%number ~"," %number ","? ${(a, b) => [a, b]}`
  expect(trailingCommas`1, 2`).toEqual([1, 2])
  expect(trailingCommas`1, 2,`).toEqual([1, 2])
}

export function test_throw_left_recursion (expect) {
  expect(() => {
    lang`FooExpr = FooExpr "*" | %number`
  }).toThrow()
}

export function test_interpolate_parser (expect) {
  const unwrap = (expr) => lang`~"(" ${expr} ")"`
  const num = token('number')
  expect(unwrap(num)`(123)`.value).toEqual(123)
}

export function test_interpolate_parser_expressions (expect) {
  const unwrap = (expr) => lang`~"(" ${expr} ~")"`
  expect(unwrap(lang`%number`)`(123)`).toEqual(123)
}

export function test_lookahead (expect) {
  const optionalSemis = lang`(!";" ("+" | "*") ${(x) => x.value})+ ";"? ${(xs) => xs}`
  expect(optionalSemis`+ *`).toEqual(['+', '*'])
  expect(optionalSemis`+ * ;`).toEqual(['+', '*'])
}
