import { grammar } from '../index'

const fromPairs = (pairs = []) =>
  pairs.reduce((obj, [key, value]) => Object.assign(obj, { [key]: value }), {})

export const json = grammar`
  Start = Expr
  Pair  = (value | identifier) (line? ":" line?) Expr 
        : ${(k, _, v) => [k, v]}

  Expr  = #[ Expr ** "," ]  : ${(xs = []) => xs}
        | #{ Pair ** "," }  : ${fromPairs}
        | value
        | "true"            : ${() => true}
        | "false"           : ${() => false}
        | "null"            : ${() => null}
`

export function test_json (expect) {
  expect(json`null`).toEqual(null)
  expect(json` false `).toEqual(false)
  expect(json` 123.45 `).toEqual(123.45)
  expect(json` "foo" `).toEqual('foo')
  expect(json`[]`).toEqual([])
  // // note: this is json5 -- allows comments, ident keys
  expect(json`[
    // a comment
    "foo",
    "bar"
  ]`).toEqual(['foo', 'bar'])
  expect(json`{"x": {y: {}}}`).toEqual({ x: { y: {} } })
}
