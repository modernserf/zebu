import {
  Parser, seq, repeat, alt, end, token, lit, sepBy,
  matchToken, not, peek, nil, testValue, hasProps, maybe, ParseSubject,
} from './parse-utils'
import { createTokenizer, tokenize, jsNumber, string, whitespace, lineComment, jsIdentifier, groupings, TokenPattern } from './token-utils'
import { createLanguage } from './language-utils'

class Quote {
  constructor (values, withContext) {
    this.values = values
    this.withContext = withContext
  }
  compile (ctx) {
    const [fn, ...args] = this.values
    if (this.withContext) { args.unshift(ctx) }
    return fn(...args.map(arg => arg instanceof Quote ? arg.compile(ctx) : arg))
  }
}

const q = (...values) => new Quote(values)
q.withContext = (...values) => new Quote(values, true)

const plainFunction = matchToken((tok) =>
  tok.type === 'function' && !tok.value.parse)

const lookup = (ctx, value) => {
  const rule = ctx.ruleMap[value]
  if (!rule) { return token(value) }
  if (rule instanceof Quote) {
    ctx.ruleMap[value] = Parser.lazy(() => rule.compile(ctx))
  }
  return ctx.ruleMap[value]
}

const rootParser = Parser.language({
  Program: (p) => alt(
    seq((rules) => {
      const ruleMap = {}
      for (const { name, rule } of rules) {
        ruleMap[name] = rule
      }
      const ast = ruleMap[rules[0].name]
      const parser = ast.compile({ ruleMap })
      // force evaluation of parser (otherwise parser won't even build until its used!)
      // this also proactively finds parse errors
      parser.parse(new ParseSubject([], 0))
      return parser
    }, repeat(p.Rule, 1)),
    seq((expr) => expr.compile({ ruleMap: {} }), p.AltExpr),
    seq(() => end, end),
  ),
  Rule: (p) => alt(
    // FooExpr = BarExpr number
    seq(({ value: name }, _, rule) => ({ name, rule }), token('identifier'), lit('='), p.AltExpr),
    // TODO: handle interpolation of rules
  ),
  AltExpr: (p) => seq(
    // FooExpr | BarExpr
    (alts) => q(alt, ...alts),
    sepBy(p.SeqExpr, lit('|'))
  ),
  SeqExpr: (p) => alt(
    // `FooExpr BarExpr ${mapFn}`
    seq(
      (exprs, { value: mapFn }) => q(seq, mapFn, ...exprs),
      repeat(p.OpExpr, 1), plainFunction
    ),
    // `FooExpr BarExpr` => [foo, bar]
    // seq(
    //   (exprs) => seq((x) => x, exprs),
    //   repeat(p.OpExpr, 2),
    // ),
    p.OpExpr
  ),
  OpExpr: (p) => alt(
    // FooExpr *
    seq((parser) => q(repeat, parser, 0), p.Expr, lit('*')),
    // BarExpr +
    seq((parser) => q(repeat, parser, 1), p.Expr, lit('*')),
    // QuuxExpr ?
    seq((parser) => q(maybe, parser), p.Expr, lit('*')),
    p.Expr
  ),
  Expr: (p) => alt(
    // !FooExpr
    seq((_, expr) => q(not, expr), lit('!'), p.Expr),
    // &BarExpr
    seq((_, expr) => q(peek, expr), lit('!'), p.Expr),
    // nil
    seq(() => q(nil), lit('nil')),
    // ( FooExpr )
    seq((_, value) => value, lit('('), p.AltExpr, lit(')')),
    // "("
    seq(({ value }) => q(lit, value), token('string')),
    // ${/foo+/}
    seq(({ value }) => q(testValue, value), hasProps('test')),
    // named values
    seq(({ value }) => q.withContext(lookup, value), token('identifier')),
    // TODO: interpolate lang`...` expressions, parsers, etc.
  ),
})

export const defaultTokenizer = createTokenizer({
  number: jsNumber,
  dqstring: string(`"`).asType('string'),
  sqstring: string(`'`).asType('string'),
  whitespace: whitespace.ignored(),
  comment: lineComment('#').ignored(),
  identifier: jsIdentifier,
  groupings: groupings.asType('token'),
  token: new TokenPattern(/[^A-Za-z0-9(){}[\]_\s\n]+/),
})

const $toks = (strs, ...interpolations) =>
  tokenize(defaultTokenizer, strs, interpolations)
const $t = (type, value = null, meta = {}) => ({ type, value, meta })

export function test_defaultTokenizer (expect) {
  const neg = (_, value) => -value
  const _2 = (_, value) => value
  const tokens = $toks`
        Expr = "(" Expr ")" ${_2}
            | "-" Expr ${neg}
            | number
        `
  expect([...tokens]).toEqual([
    $t('identifier', 'Expr'),
    $t('token', '='),
    $t('string', '(', { literal: true }),
    $t('identifier', 'Expr'),
    $t('string', ')', { literal: true }),
    $t('function', _2, { interpolated: true, literal: false }),
    $t('token', '|'),
    $t('string', '-', { literal: true }),
    $t('identifier', 'Expr'),
    $t('function', neg, { interpolated: true, literal: false }),
    $t('token', '|'),
    $t('identifier', 'number'),
  ])
}

const compileGrammar = createLanguage({
  parser: rootParser.Program,
  tokenizer: defaultTokenizer,
})

export const lang = (strs, ...interpolations) =>
  createLanguage({
    parser: compileGrammar(strs, ...interpolations),
    tokenizer: defaultTokenizer,
  })

lang.withConfig = options => (strs, ...interpolations) =>
  createLanguage({
    parser: compileGrammar(strs, ...interpolations),
    tokenizer: defaultTokenizer,
    ...options,
  })

export function test_lang_nil_language (expect) {
  const nil = lang``
  expect(nil``).toEqual(null)
}

export function test_lang_single_expression (expect) {
  const num = lang`"(" number ")" ${(_, { value }) => value}`
  expect(num`(123)`).toEqual(123)
}

export function test_lang_single_recursive_rule (expect) {
  const math = lang`
      Expr = "(" Expr ")" ${(_, value) => value}
           | "-" Expr     ${(_, value) => -value}
           | number         ${({ value }) => value}
    `
  expect(math`123`).toEqual(123)
  expect(math`-123`).toEqual(-123)
  expect(math`(123)`).toEqual(123)
  expect(math`-(-(123))`).toEqual(123)
}

export function test_lang_multiple_rules (expect) {
  const leftAssociative = (l, rs) => rs.reduce((value, fn) => fn(value), l)
  const math = lang`
    AddExpr = MulExpr AddOp*  ${leftAssociative}
    AddOp   = "+" MulExpr     ${(_, r) => (l) => l + r}
            | "-" MulExpr     ${(_, r) => (l) => l - r}
    MulExpr = Expr MulOp*     ${leftAssociative}
    MulOp   = "*" Expr        ${(_, r) => (l) => l * r}
            | "/" Expr        ${(_, r) => (l) => l / r}
    Expr    = "(" AddExpr ")" ${(_, value) => value}
            | "-" Expr        ${(_, value) => -value}
            | number          ${({ value }) => value}
  `

  expect(math`(-3.1 + 4) * 200`).toEqual((-3.1 + 4) * 200)
  expect(math`1 / 2 / 3`).toEqual(1 / 2 / 3)
}

export function test_throw_left_recursion (expect) {
  expect(() => {
    lang`FooExpr = FooExpr "*" ${(x) => x} | number`
  }).toThrow()
}

export function skip_test_interpolate_parser (expect) {
  const num = {
    parse: ({ tokens, index }) => {
      if (tokens[index].type === 'number') {
        return { node: tokens[index].value, index: index + 1 }
      }
      return null
    },
  }
  const numWithParens = lang`"(" ${num} ")" ${(_, value) => value}`
  expect(numWithParens`( 123 )`).toEqual(123)
}

export function skip_test_interpolate_parser_expressions (expect) {
  const num = lang`number ${({ value }) => value}`
  expect(num`123`).toEqual(123)
  expect(num.parse({
    tokens: [{ type: 'number', value: 123 }],
    index: 0,
  })).toEqual({ node: 123, index: 1 })
}
