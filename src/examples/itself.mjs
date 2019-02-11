import { grammar, createCompiler, createTTS } from '../index.mjs'

const list = (...xs) => xs
const last = (...xs) => xs.pop()
const seq = (mapFn, ...exprs) => {
  const merged = exprs.reduceRight(
    (rExpr, lExpr) => grammar`${lExpr} ${rExpr} : ${(first, rest) => ({ first, rest })}`,
    grammar`nil : ${() => null}`
  )
  return grammar`${merged} : ${(list) => {
    const result = []
    while (list) {
      result.push(list.first)
      list = list.rest
    }
    return mapFn(...result)
  }}`
}

const grammarContent = list`
  Grammar = Rule ++ line                  : ${(rules) => compile(['grammar', rules])}
          | AltExpr                       : ${(expr) => compile(['rootExpr', expr])}
  Rule    = identifier "=" AltExpr        : ${(name, _, expr) => ['rule', name, expr]}
  AltExpr = SeqExpr ++ "|"                : ${(exprs) => ['alt', exprs]}
  SeqExpr = SepExpr+ (line? ":" value)?   : ${(exprs, fn) => ['seq', exprs, fn]}
  SepExpr = RepExpr "++" RepExpr          : ${(expr, _, sep) => ['sepBy', expr, sep]}
          | RepExpr "**" RepExpr          : ${(expr, _, sep) => ['sepByMaybe', expr, sep]}
          | RepExpr
  RepExpr = Expr "*"                      : ${(expr) => ['repeat0', expr]}
          | Expr "+"                      : ${(expr) => ['repeat1', expr]}
          | Expr "?"                      : ${(expr) => ['maybe', expr]}
          | Expr
  Expr    = #( AltExpr )
          | "#" #( AltExpr )              : ${(_, expr) => ['wrappedParen', expr]}
          | "#" #[ AltExpr ]              : ${(_, expr) => ['wrappedSquare', expr]}
          | "#" #{ AltExpr }              : ${(_, expr) => ['wrappedCurly', expr]}
          | "include" value               : ${(_, fn) => ['include', fn]}
          | identifier                    : ${(name) => ['identifier', name]}
          | value                         : ${(value) => ['literal', value]}
`

const baseScope = {
  line: grammar`line`,
  value: grammar`value`,
  identifier: grammar`identifier`,
  operator: grammar`operator`,
  nil: grammar`nil`,
}

const compile = createCompiler({
  grammar: (rules, ctx) => {
    const firstRuleID = rules[0][1]
    ctx.scope = { ...baseScope }
    // iterate through rules bottom-to-top
    for (let i = rules.length - 1; i >= 0; i--) {
      ctx.eval(rules[i])
    }
    return createTTS(ctx.scope[firstRuleID])
  },
  rootExpr: (expr, ctx) => {
    ctx.scope = { ...baseScope }
    return createTTS(ctx.eval(expr))
  },
  nil: () => createTTS(baseScope.nil),
  rule: (name, rule, ctx) => {
    ctx.scope[name] = ctx.eval(rule)
  },
  alt: (xs, ctx) => xs.map(ctx.eval).reduce((l, r) => grammar`${l} | ${r}`),
  seq: (exprs, fn = last, ctx) =>
    seq(fn, ...exprs.map(ctx.eval)),
  sepByMaybe: (expr, sep, ctx) =>
    grammar`${ctx.eval(expr)} ** ${ctx.eval(sep)}`,
  sepBy: (expr, sep, ctx) =>
    grammar`${ctx.eval(expr)} ++ ${ctx.eval(sep)}`,
  repeat0: (expr, ctx) => grammar`${ctx.eval(expr)}*`,
  repeat1: (expr, ctx) => grammar`${ctx.eval(expr)}+`,
  maybe: (expr, ctx) => grammar`${ctx.eval(expr)}?`,

  wrappedParen: (content, ctx) =>
    grammar`#( include ${() => ctx.eval(content)} )`,
  wrappedSquare: (content, ctx) =>
    grammar`#[ include ${() => ctx.eval(content)} ]`,
  wrappedCurly: (content, ctx) =>
    grammar`#{ include ${() => ctx.eval(content)} }`,
  identifier: (name, ctx) => ctx.scope[name],
  include: (getParser, ctx) => getParser(ctx.scope),
  literal: (value) => {
    if (value && value.parse) { return value }
    return grammar`${value}`
  },
})

// yo dawg
const g2 = grammar(...grammarContent)
const g3 = g2(...grammarContent)

export function test_g3_single_expression (expect) {
  const num = g3`"return" value : ${(_, x) => x}`
  expect(num`return 123`).toEqual(123)
}

export function test_g3_recursive_rules (expect) {
  const math = g3`
    Neg   = "-" Expr      : ${(_, value) => -value}
          | Expr
    Expr  = #( Neg )
          | value
  `
  expect(math`123`).toEqual(123)
  expect(math`-123`).toEqual(-123)
  expect(math`(123)`).toEqual(123)
  expect(math`-(-(123))`).toEqual(123)
}

export function test_lang_recursive_rule_errors (expect) {
  expect(() => {
    g3`
      Value = "("
    `
  }).toThrow()
}

export function test_lang_repeaters (expect) {
  const list = g3`
    Expr  = #( Expr* )
          | identifier
  `
  expect(list`(foo bar (baz quux) xyzzy)`)
    .toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])

  const nonEmptyList = g3`
    Expr  = #( Expr+ )
          | identifier
  `
  expect(nonEmptyList`(foo bar (baz quux) xyzzy)`)
    .toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])
  expect(() => nonEmptyList`()`).toThrow()
}

export function test_lang_maybe (expect) {
  const trailingCommas = g3`value "," value ","? : ${(a, _, b) => [a, b]}`
  expect(trailingCommas`1, 2`).toEqual([1, 2])
  expect(trailingCommas`1, 2,`).toEqual([1, 2])
}

export function test_lang_with_line_separators (expect) {
  const lines = g3`value+ ++ line`
  const text = lines`
    1 2

    3 4
  `
  expect(text).toEqual([[1, 2], [3, 4]])
}

export function test_interpolated_parser (expect) {
  const num = g3`value`
  const list = g3`${num}+`
  expect(list`1 2 3`).toEqual([1, 2, 3])
}
