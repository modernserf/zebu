import { nil, alt, seq, repeat, token, lit, wrappedWith, sepBy } from './parse-utils.mjs'
import { drop, tag, createCompiler, createTTS } from './compiler-utils'

class UnknownRuleError extends Error {
  constructor (ruleName) {
    super(`Unknown rule: "${ruleName}"`)
  }
}
class InvalidBracketLiteralError extends Error {
  constructor (bracket) {
    super(`"${bracket}" is reserved for brackets, and cannot be used as a keyword or operator`)
  }
}
class RuleError extends Error {
  constructor (rule, err) {
    super(`In "${rule}": ${err.message}`)
  }
}
class DuplicateRuleError extends Error {
  constructor (rule) {
    super(`Multiple definitions for rule "${rule}"`)
  }
}

const id = (x) => x
const _2 = (_, x) => x
const last = (...xs) => xs.pop()

const dlit = (x) => drop(lit(x))

const line = token('line')
const optLine = alt(line, nil)
const wrapIgnoreLines = (parser) => seq(_2, optLine, parser, optLine)
const sepByWithLines = (expr, sep) => alt(sepBy(
  expr,
  seq(id, alt(sep, seq(_2, optLine, sep)), optLine)
))

const mapFn = seq(_2, dlit(':'), token('value'))

const baseExpr = alt(
  wrappedWith('(', () => expr, ')'),
  seq(tag('wrappedParen'),
    dlit('#'),
    wrappedWith('(', () => expr, ')')
  ),
  seq(tag('wrappedSquare'),
    dlit('#'),
    wrappedWith('[', () => expr, ']')
  ),
  seq(tag('wrappedCurly'),
    dlit('#'),
    wrappedWith('{', () => expr, '}')
  ),
  seq(tag('include'), dlit('include'), token('value')),
  seq(tag('identifier'), token('identifier')),
  seq(tag('literal'), token('value'))
)

// prefix and postfix operators, mutually exclusive
const postExpr = alt(
  seq(tag('repeat0'), baseExpr, dlit('*')),
  seq(tag('repeat1'), baseExpr, dlit('+')),
  seq(tag('maybe'), baseExpr, dlit('?')),
  baseExpr
)

// Expr ** "," -> Expr, Expr, Expr ...
const sepExpr = alt(
  seq(tag('sepByMaybe'), postExpr, dlit('**'), postExpr),
  seq(tag('sepBy'), postExpr, dlit('++'), postExpr),
  postExpr
)
const seqExpr = seq(
  tag('seq'),
  repeat(sepExpr, 1), alt(seq(_2, optLine, mapFn), nil)
)

const expr = seq(tag('alt'), sepBy(seqExpr, wrapIgnoreLines(dlit('|'))))
const rule = seq(tag('rule'), token('identifier'), dlit('='), expr)

const program = alt(
  seq(tag('program'), wrapIgnoreLines(sepBy(rule, line))),
  seq(tag('rootExpr'), wrapIgnoreLines(expr)),
  seq(tag('nil'), wrapIgnoreLines(nil))
)

const baseScope = {
  line: token('line'),
  value: token('value'),
  identifier: token('identifier'),
  operator: token('operator'),
  nil: nil,
}

const compiler = createCompiler({
  program: (rules, ctx) => {
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
  nil: () => createTTS(nil),
  rule: (name, rule, ctx) => {
    if (name in ctx.scope) {
      throw new DuplicateRuleError(name)
    }
    try {
      ctx.scope[name] = ctx.eval(rule)
    } catch (e) {
      throw new RuleError(name, e)
    }
  },
  alt: (xs, ctx) => alt(...xs.map(ctx.eval)),
  seq: (exprs, fn = last, ctx) => seq(fn, ...exprs.map(ctx.eval)),
  sepByMaybe: (expr, sep, ctx) =>
    alt(
      sepByWithLines(ctx.eval(expr), ctx.eval(sep)),
      seq(() => [], nil)
    ),
  sepBy: (expr, sep, ctx) =>
    sepByWithLines(ctx.eval(expr), ctx.eval(sep)),
  repeat0: (expr, ctx) => repeat(ctx.eval(expr), 0),
  repeat1: (expr, ctx) => repeat(ctx.eval(expr), 1),
  maybe: (expr, ctx) => alt(ctx.eval(expr), nil),
  wrappedParen: (content, ctx) => wrappedWith(
    '(', () => wrapIgnoreLines(ctx.eval(content)), ')'
  ),
  wrappedSquare: (content, ctx) => wrappedWith(
    '[', () => wrapIgnoreLines(ctx.eval(content)), ']'
  ),
  wrappedCurly: (content, ctx) => wrappedWith(
    '{', () => wrapIgnoreLines(ctx.eval(content)), '}'
  ),
  identifier: (name, ctx) => {
    const rule = ctx.scope[name]
    if (!rule) {
      throw new UnknownRuleError(name)
    }
    return rule
  },
  include: (getParser, ctx) => getParser(ctx.scope),
  literal: (value) => {
    if (value.parse) { return value }
    if (/[(){}[\]]/.test(value)) { throw new InvalidBracketLiteralError(value) }
    return lit(value)
  },
})

export const grammar = createTTS(seq(compiler, program))

export function test_lang_nil_language (expect) {
  const nil = grammar``
  expect(nil`
  `).toEqual(undefined)
}

export function test_lang_single_expression (expect) {
  const num = grammar`"return" value : ${(_, x) => x}`
  expect(num`return 123`).toEqual(123)
}

export function test_lang_recursive_rules (expect) {
  const math = grammar`
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

export function test_lang_bracket_rules (expect) {
  expect(() => {
    grammar`"("`
  }).toThrow(InvalidBracketLiteralError)
}

export function test_lang_repeaters (expect) {
  const list = grammar`
    Expr  = #( Expr* )
          | identifier
  `
  expect(list`(foo bar (baz quux) xyzzy)`)
    .toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])

  const nonEmptyList = grammar`
    Expr  = #( Expr+ )
          | identifier
  `
  expect(nonEmptyList`(foo bar (baz quux) xyzzy)`)
    .toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])
  expect(() => nonEmptyList`()`).toThrow()
}

export function test_lang_maybe (expect) {
  const trailingCommas = grammar`value "," value ","? : ${(a, _, b) => [a, b]}`
  expect(trailingCommas`1, 2`).toEqual([1, 2])
  expect(trailingCommas`1, 2,`).toEqual([1, 2])
}

export function test_lang_with_line_separators (expect) {
  const lines = grammar`value+ ++ line`
  const text = lines`
    1 2 
  
    3 4
  `
  expect(text).toEqual([[1, 2], [3, 4]])
}

export function test_interpolated_parser (expect) {
  const num = grammar`value`
  const list = grammar`(include ${() => num})+`
  expect(list`1 2 3`).toEqual([1, 2, 3])
}

export function test_duplicate_rule_error (expect) {
  expect(() => {
    grammar`
      Foo = "foo" value
      Foo = "bar" value 
    `
  }).toThrow(DuplicateRuleError)
}
