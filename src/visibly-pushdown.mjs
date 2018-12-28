import { end, alt, seq, repeat, token as tok, lit, drop, not, maybe, wrappedWith, peek, sepBy, left, right, Parser, parse } from './parse-utils.mjs'
import { createBasicTokenizer, tokenize, TOKENS_MACRO } from './token-utils.mjs'

class MismatchedOperatorExpressionError extends Error {}
class UnknownRuleError extends Error {}
class ScopeNotDefinedError extends Error {}

const id = (x) => x
const list = (...xs) => xs
const valueOf = (x) => x.value
const seqi = (...xs) => seq(id, ...xs)
const dlit = (x) => drop(lit(x))
const token = (type) => seq(valueOf, tok(type))
const tag = (type) => (...values) => [type, ...values]
const asLeftFn = (fn) => (...xs) => (acc) => fn(acc, ...xs)
const asRightFn = (fn) => (...xs) => (acc) => fn(...xs, acc)

const rootParser = Parser.language({
  Program: (p) => seq(
    compiler,
    alt(
      seq(tag('program'), repeat(p.Rule, 1)),
      p.Expr,
      seq(tag('nil'), end),
    ),
  ),
  Rule: (p) => seq(tag('rule'), p.RuleHead, p.Expr),
  RuleHead: (p) => seqi(token('identifier'), dlit('=')),
  Expr: (p) => alt(
    seq(
      tag('altInfix'),
      p.InfixExpr,
      repeat(seqi(dlit('|'), p.InfixExpr), 0),
      dlit('|'),
      p.AltExpr,
    ),
    p.AltExpr
  ),
  // AddExpr = < . "+" MultExpr >
  InfixExpr: (p) => alt(
    seq(tag('leftInfix'),
      dlit('<'), dlit('.'), repeat(p.SepExpr, 1), dlit('>'), token('function')),
    seq(tag('rightInfix'),
      dlit('<'), repeat(p.SepExpr, 1), dlit('.'), dlit('>'), token('function')),
  ),
  AltExpr: (p) => seq(
    tag('alt'),
    p.SeqExpr, repeat(seqi(dlit('|'), p.SeqExpr), 0)
  ),
  SeqExpr: (p) => seq(
    tag('seq'),
    repeat(seqi(not(p.RuleHead), p.SepExpr)), maybe(token('function'))
  ),
  // Expr / "," -> Expr, Expr, Expr ...
  SepExpr: (p) => alt(
    seq(tag('sepBy'), p.OpExpr, dlit('/'), p.OpExpr),
    p.OpExpr
  ),
  // prefix and postfix operators, mutually exclusive
  OpExpr: (p) => alt(
    seq(tag('peek'), dlit('&'), p.BaseExpr),
    seq(tag('not'), dlit('!'), p.BaseExpr),
    seq(tag('drop'), dlit('~'), p.BaseExpr),
    seq(tag('repeat0'), p.BaseExpr, dlit('*')),
    seq(tag('repeat1'), p.BaseExpr, dlit('+')),
    seq(tag('maybe'), p.BaseExpr, dlit('?')),
    p.BaseExpr
  ),
  BaseExpr: (p) => alt(
    wrappedWith(lit('('), p.Expr, lit(')')),
    seq(tag('wrapped'), wrappedWith(
      lit('['),
      seq(list, p.Terminal, p.SepExpr, p.Terminal),
      lit(']')
    )),
    seq(tag('identifier'), token('identifier')),
    p.Terminal,
  ),
  Terminal: () => alt(
    seq(tag('token'), dlit('%'), token('identifier')),
    seq(tag('literal'), token('string'))
  ),
})

const compiler = createCompiler({
  program: (rules, ctx) => {
    ctx.scope = {}
    // iterate through rules bottom-to-top
    for (let i = rules.length - 1; i >= 0; i--) {
      ctx.eval(rules[i])
    }
    const firstRuleID = rules[0][1]
    return ctx.scope[firstRuleID]
  },
  nil: () => end,
  rule: (name, rule, ctx) => {
    ctx.scope[name] = ctx.eval(rule)
  },
  altInfix: ([hTag, hSeq, hFn], ts, base, ctx) => {
    base = ctx.eval(base)
    const asInfixFn = hTag === 'leftInfix' ? asLeftFn : asRightFn

    const seqs = [seq(asInfixFn(hFn), ...hSeq.map(ctx.eval))]
    for (const [tTag, tSeq, tFn] of ts) {
      if (tTag !== hTag) { throw new MismatchedOperatorExpressionError(tag) }
      seqs.push(seq(asInfixFn(tFn), ...tSeq.map(ctx.eval)))
    }
    if (hTag === 'leftInfix') {
      return seq(
        (init, fns) => fns.reduce((acc, fn) => fn(acc), init),
        base, repeat(alt(...seqs), 0)
      )
    } else {
      return seq(
        (fns, init) => fns.reduceRight((acc, fn) => fn(acc), init),
        repeat(alt(...seqs), 0), base
      )
    }
  },
  leftInfix: (xs, fn, ctx, base) =>
    left(fn, ctx.eval(base), ...xs.map(ctx.eval)),
  rightInfix: (xs, fn, ctx, base) =>
    right((p) => alt(seq(fn, ...xs.map(ctx.eval), p), ctx.eval(base))),
  alt: (h, t, ctx) => t.length
    ? alt(ctx.eval(h), ...t.map(ctx.eval))
    : ctx.eval(h),
  seq: (exprs, fn = id, ctx) => seq(fn, ...exprs.map(ctx.eval)),
  sepBy: (expr, sep, ctx) => maybe(sepBy(ctx.eval(expr), ctx.eval(sep))),
  peek: (expr, ctx) => peek(ctx.eval(expr)),
  not: (expr, ctx) => not(ctx.eval(expr)),
  drop: (expr, ctx) => drop(ctx.eval(expr)),
  repeat0: (expr, ctx) => repeat(ctx.eval(expr), 0),
  repeat1: (expr, ctx) => repeat(ctx.eval(expr), 1),
  maybe: (expr, ctx) => maybe(ctx.eval(expr)),
  wrapped: ([start, content, end], ctx) =>
    wrappedWith(
      ctx.eval(start),
      Parser.lazy(() => ctx.eval(content)),
      ctx.eval(end)
    ),
  identifier: (name, ctx) => {
    if (!ctx.scope) { throw new ScopeNotDefinedError(name) }
    const rule = ctx.scope[name]
    if (!rule) {
      throw new UnknownRuleError(name)
    }
    return rule
  },
  token: (type) => token(type),
  literal: (value) => lit(value),
})

function createCompiler (model) {
  return (ast) => {
    const ctx = {
      eval: ([type, ...payload]) =>
        model[type](...payload, ctx),
      evalWith: (...extra) =>
        ([type, ...payload]) =>
          model[type](...payload, ctx, ...extra),
    }
    return ctx.eval(ast)
  }
}

const literals = [
  '<', '>', '(', ')', '[', ']',
  '.', '=', '|', '/', '*', '+', '?', '&', '!', '~', '%',
]
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
  expect(nil``).toEqual(undefined)
}

export function test_lang_single_expression (expect) {
  const num = lang`~"(" %number ")"`
  expect(num`(123)`).toEqual(123)
}

export function test_lang_recursive_rules (expect) {
  const math = lang`
    Neg   = ~"-" Expr ${(value) => -value}
          | Expr
    Expr  = ["(" Neg ")"]
          | %number
  `
  expect(math`123`).toEqual(123)
  expect(math`-123`).toEqual(-123)
  expect(math`(123)`).toEqual(123)
  expect(math`-(-(123))`).toEqual(123)
}

export function test_lang_repeaters (expect) {
  const list = lang`
    Expr  = ["(" Expr* ")"]
          | %identifier
  `
  expect(list`(foo bar (baz quux) xyzzy)`)
    .toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])

  const nonEmptyList = lang`
    Expr = ["(" Expr+ ")"]
         | %identifier
  `
  expect(nonEmptyList`(foo bar (baz quux) xyzzy)`)
    .toEqual(['foo', 'bar', ['baz', 'quux'], 'xyzzy'])
  expect(() => nonEmptyList`()`).toThrow()
}

export function test_lang_operator_precedence_assoc (expect) {
  const math = lang`
    AddExpr = < . ~"+" MulExpr >  ${(l, r) => l + r}
            | < . ~"-" MulExpr >  ${(l, r) => l - r}
            | MulExpr
    MulExpr = < . ~"*" PowNeg >   ${(l, r) => l * r}
            | < . ~"/" PowNeg >   ${(l, r) => l / r}
            | PowNeg
    PowNeg  = NegExpr 
            | PowExpr
    NegExpr = ~"-" Expr           ${(x) => -x}
    PowExpr = < Expr ~"**" . >    ${(l, r) => l ** r}
            | Expr
    Expr    = ["(" AddExpr ")"]
            | %number
  `
  expect(math`3 / 4 / 5`).toEqual((3 / 4) / 5)
  expect(math`3/ (4 / 5)`).toEqual(3 / (4 / 5))
  expect(math`1 + 2 * 3 - 4`).toEqual(1 + (2 * 3) - 4)
  expect(math`2 ** 3 ** 2`).toEqual(2 ** (3 ** 2))
}

export function test_lookahead (expect) {
  const optionalSemis = lang`(!";" ("+" | "*") ${(x) => x.value})+ ";"? ${(xs) => xs}`
  expect(optionalSemis`+ *`).toEqual(['+', '*'])
  expect(optionalSemis`+ * ;`).toEqual(['+', '*'])
}

export function test_lang_maybe (expect) {
  const trailingCommas = lang`%number ~"," %number ","? ${(a, b) => [a, b]}`
  expect(trailingCommas`1, 2`).toEqual([1, 2])
  expect(trailingCommas`1, 2,`).toEqual([1, 2])
}
