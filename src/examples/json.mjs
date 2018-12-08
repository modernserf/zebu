import { lang } from '../index'

const fromPairs = (pairs = []) =>
  pairs.reduce((obj, [key, value]) => Object.assign(obj, { [key]: value }), {})
const cons = (h, t) => [h].concat(t)
const list = (...xs) => xs

const sepBy = (expr, separator) => lang`
  (${expr} (~${separator} ${expr})* ${cons})
`

export const json = lang`
  Expr = ~"[" ${sepBy(lang`Expr`, ',')}? "]" ${(xs = []) => xs}
        | ~"{" ${sepBy(lang`Pair`, ',')}? "}" ${fromPairs}
        | %number
        | %string
        | "true"  ${() => true}
        | "false" ${() => false}
        | "null"  ${() => null}
  Pair = %string ~":" Expr ${list} 
`

export function test_json (expect) {
  expect(json`null`).toEqual(null)
  expect(json` false `).toEqual(false)
  expect(json` 123.45 `).toEqual(123.45)
  expect(json`["foo", "bar"]`).toEqual(['foo', 'bar'])
  expect(json`{"x": {"y": {}}}`).toEqual({ x: { y: {} } })
}
