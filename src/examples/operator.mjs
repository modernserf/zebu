import { lang } from '../index'
import { lit, seq, alt, repeat, wrappedWith, padded } from '../parse-utils'
import { createTTS } from '../compiler-utils'

const list = (...xs) => xs

export const op = lang`
  Program   = (Rule ** line) RootRule?  : ${compile}
  Rule      = Fixity AltExpr            : ${(fixity, operators) => [fixity, operators]}
  Fixity    = "left" | "right" | "pre" | "post"
  AltExpr   = Expr ++ line
  Expr      = Pattern ":" value         : ${(pattern, _, mapFn) => ({ pattern, mapFn })}
  Pattern   = value+                    : ${(strs) => padded(seq(list, ...strs.map(lit)))}
  RootRule  = (line? "root") value      : ${(_, value) => value}
`

const applyLeft = (first, rest) => rest.reduce((l, fn) => fn(l), first)
const applyRight = (most, last) => most.reduceRight((r, fn) => fn(r), last)

const repeatOps = (operatorDefs, fn) => repeat(alt(...operatorDefs.map(fn)))
const seqLeft = (base, operatorDefs, fn) => seq(applyLeft, base, repeatOps(operatorDefs, fn))
const seqRight = (operatorDefs, fn, base) => seq(applyRight, repeatOps(operatorDefs, fn), base)

function compile (rules, rootParser = lang`value`) {
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
    wrappedWith(lit('('), () => expr, lit(')')),
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
  const expr = lang`
    Expr = include ${parent => op`
      left "++" : ${(xs, ys) => xs.concat(ys)}
      root ${parent.RootExpr}
    `}
    RootExpr  = ["[" Expr ** "," "]"]
              | value
  `
  expect(expr`["foo", "bar"] ++ ["baz"]`)
    .toEqual(['foo', 'bar', 'baz'])
}
