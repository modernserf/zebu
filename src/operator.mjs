import { grammar } from './visibly-pushdown'
import { lit, seq, alt, repeat, wrappedWith, padded, token } from './parse-utils'
import { createTTS } from './compiler-utils'

const list = (...xs) => xs

export const op = grammar`
  Program   = (Rule ** line) RootRule?  : ${compile}
  Rule      = Fixity AltExpr            : ${(fixity, operators) => [fixity, operators]}
  Fixity    = "left" | "right" | "pre" | "post"
  AltExpr   = Expr ++ line
  Expr      = Pattern ":" value         : ${(pattern, _, mapFn) => ({ ...pattern, mapFn })}
  Pattern   = value+                    : ${processPattern}
  RootRule  = line? "root" value
`

function processPattern (strs) {
  return ({
    length: strs.length,
    pattern: padded(seq(list, ...strs.map(lit))),
  })
}

const applyLeft = (first, rest) => rest.reduce((l, fn) => fn(l), first)
const applyRight = (most, last) => most.reduceRight((r, fn) => fn(r), last)

const longestFirst = (operatorDefs) => [...operatorDefs].sort((l, r) => r.length - l.length)
const repeatOps = (operatorDefs, fn) => repeat(alt(...longestFirst(operatorDefs).map(fn)))
const seqLeft = (base, operatorDefs, fn) => seq(applyLeft, base, repeatOps(operatorDefs, fn))
const seqRight = (operatorDefs, fn, base) => seq(applyRight, repeatOps(operatorDefs, fn), base)

function compile (rules, rootParser = token('value')) {
  // apply rules bottom-to-top
  const expr = rules.reduceRight((base, [fixity, operatorDefs]) => {
    switch (fixity) {
      case 'left':
        return seqLeft(base, operatorDefs, ({ pattern, mapFn }) =>
          seq((_, r) => (l) => mapFn(l, r), pattern, base)
        )
      case 'right':
        return seqRight(operatorDefs, ({ pattern, mapFn }) =>
          seq((l) => (r) => mapFn(l, r), base, pattern),
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
    wrappedWith('(', () => expr, ')'),
    rootParser
  ))
  return createTTS(expr)
}

export function test_operator_parser (expect) {
  const math = op`
    left  "+"   : ${(l, r) => l + r}
          "-"   : ${(l, r) => l - r}
    left  "*"   : ${(l, r) => l * r}
          "/"   : ${(l, r) => l / r}
          "%"   : ${(l, r) => l % r}
    right "**"  : ${(l, r) => l ** r}
    pre   "-"   : ${x => -x}
    post  "++"  : ${x => x + 1}
          "--"  : ${x => x - 1}
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

export function test_operator_parser_include (expect) {
  const expr = grammar`
    Expr = include ${parent => op`
      left "++" : ${(xs, ys) => xs.concat(ys)}
      root ${parent.RootExpr}
    `}
    RootExpr  = #[ Expr ** "," ]
              | value
  `
  expect(expr`["foo", "bar"] ++ ["baz"]`)
    .toEqual(['foo', 'bar', 'baz'])
}

export function test_try_longest_match_first (expect) {
  const eq = op`
    left  "is"        : ${(l, r) => l === r}
          "is" "not"  : ${(l, r) => l !== r}
    pre   "not"       : ${(l) => !l}
  `
  expect(eq`4 is 4`).toEqual(true)
  expect(eq`4 is not 3`).toEqual(true)
  expect(eq`4 is (not 3)`).toEqual(false)
}
