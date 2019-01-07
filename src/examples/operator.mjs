import { lang } from '../index'
import { MatchParser, nil, lit, seq, alt, drop, repeat, wrappedWith, parse, token } from '../parse-utils'
import { tokenize } from '../token-utils'

const isParser = new MatchParser((x) => x && x.value && x.value.parse)
const seqi = (...ps) => seq((x) => x, ...ps)
const dline = drop(alt(token('line'), nil))

const op = lang`
  Program   = (Rule / %line) %line? RootRule ${compile}
  Rule      = Fixity AltExpr ${(fixity, operators) => [fixity, operators]}
  AltExpr   = Expr / %line
  Expr      = Pattern %function ${(pattern, mapFn) => ({ pattern, mapFn })}
  Pattern   = %string+ ${(strs) => seqi(dline, ...strs.map(lit), dline)}
  Fixity    = ("left" | "right" | "pre" | "post") ${({ value }) => value}
  RootRule  = ~"root" ${isParser} ${({ value }) => value}
`

const applyLeft = (first, rest) => rest.reduce((l, fn) => fn(l), first)
const applyRight = (most, last) => most.reduceRight((r, fn) => fn(r), last)

const repeatOps = (operatorDefs, fn) => repeat(alt(...operatorDefs.map(fn)))
const seqLeft = (base, operatorDefs, fn) => seq(applyLeft, base, repeatOps(operatorDefs, fn))
const seqRight = (operatorDefs, fn, base) => seq(applyRight, repeatOps(operatorDefs, fn), base)

function compile (rules, _, rootParser) {
  // apply rules bottom-to-top
  const expr = rules.reduceRight((base, [fixity, operatorDefs]) => {
    switch (fixity) {
      case 'left':
        return seqLeft(base, operatorDefs, ({ pattern, mapFn }) =>
          seq((r) => (l) => mapFn(l, r), drop(pattern), base)
        )
      case 'right':
        return seqRight(operatorDefs, ({ pattern, mapFn }) =>
          seq((l) => (r) => mapFn(l, r), base, drop(pattern)),
        base)
      case 'post':
        return seqLeft(base, operatorDefs, ({ pattern, mapFn }) =>
          seq(() => mapFn, pattern)
        )
      case 'pre':
        return seqRight(operatorDefs, ({ pattern, mapFn }) =>
          seq(() => mapFn, pattern),
        base)
    }
  }, alt(
    wrappedWith(lit('('), () => expr, lit(')')),
    rootParser
  ))
  const wrapped = seqi(dline, expr, dline)
  const tts = (strings, ...interpolations) => {
    const tokens = Array.from(tokenize(strings, interpolations))
    return parse(wrapped, tokens)
  }
  // tts.parse = expr.parse

  return tts
}

// TODO: comments need to work across interpolations
export function test_operator_parser (expect) {
  const math = op`
    left  "+"  ${(l, r) => l + r}
          "-"  ${(l, r) => l - r}
    left  "*"  ${(l, r) => l * r}
          "/"  ${(l, r) => l / r}
          "%"  ${(l, r) => l % r}
    right "**" ${(l, r) => l ** r}
    pre   "-"  ${x => -x}
    post  "++" ${x => x + 1}
          "--" ${x => x - 1}
    root  ${seq((x) => x.value, token('number'))}
  `
  expect(math`3 * 4 / 5 * 6`).toEqual((3 * 4) / 5 * 6)
  expect(math`3 * (4 / 5) * 6`).toEqual(3 * (4 / 5) * 6)
  expect(math`
    1
    + 2
    * 3
    - 4`).toEqual(1 + (2 * 3) - 4)
  expect(math`2 ** 3 ** 2`).toEqual(2 ** (3 ** 2))
}
