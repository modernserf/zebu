import { lang } from '../root-language'

const _2 = (_, x) => x
const value = ({ value }) => value
const fromPairs = (pairs) =>
  pairs.reduce((obj, [key, value]) => Object.assign(obj, { [key]: value }), {})

export const json = lang`
    Expr = "[" Expr ("," Expr ${_2})* "]" ${(h, t) => [h, ...t]}
         | "{" Pair ("," Pair ${_2})* "}" ${(h, t) => fromPairs([h, ...t])}
         | number  ${value}
         | string  ${value}
         | "true"  ${() => true}
         | "false" ${() => false}
         | "null"  ${() => null}
    Pair = string ":" Expr ${({ value }, _, expr) => [value, expr]} 
`
