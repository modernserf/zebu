import { lang } from './root-language.mjs'

export { lang }

const alts = ([x, ...xs]) => xs.length ? lang`${x} | ${alts(xs)}` : lang`${x}`
const prepare = (opMap) => (op, r) => (l) => opMap[op.value](l, r)
const compile = (l, rs) => rs.reduce((value, f) => f(value), l)
export const leftOp = (operand, opMap) => lang`
  (${operand} ((${alts(Object.keys(opMap))}) ${operand} ${prepare(opMap)})* ${compile})
`
const cons = (h, t) => [h].concat(t)
export const sepBy = (expr, separator) => lang`
  (${expr} (~${separator} ${expr})* ${cons})
`
