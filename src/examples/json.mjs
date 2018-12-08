import { lang } from '../index'

const value = ({ value }) => value
const fromPairs = (pairs = []) =>
  pairs.reduce((obj, [key, value]) => Object.assign(obj, { [key]: value }), {})

export const json = lang`
  Expr = ~"[" (Expr % ",")? "]" ${(xs = []) => xs}
        | ~"{" (Pair % ",")? "}" ${fromPairs}
        | %%number  ${value}
        | %%string  ${value}
        | "true"  ${() => true}
        | "false" ${() => false}
        | "null"  ${() => null}
  Pair = %%string ~":" Expr ${({ value }, expr) => [value, expr]} 
`

export function test_json (expect) {
  expect(json`null`).toEqual(null)
  expect(json` false `).toEqual(false)
  expect(json` 123.45 `).toEqual(123.45)
  expect(json`["foo", "bar"]`).toEqual(['foo', 'bar'])
  expect(json`{"x": {"y": {}}}`).toEqual({ x: { y: {} } })
}
