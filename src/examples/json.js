import { lang } from '../root-language'

const value = ({ value }) => value
const fromPairs = (pairs) =>
  pairs.reduce((obj, [key, value]) => Object.assign(obj, { [key]: value }), {})

export const json = lang`
    Expr = ~"[" Expr % "," "]"
         | ~"{" Pair % "," "}" ${fromPairs}
         | number  ${value}
         | string  ${value}
         | "true"  ${() => true}
         | "false" ${() => false}
         | "null"  ${() => null}
    Pair = string ~":" Expr ${({ value }, expr) => [value, expr]} 
`
