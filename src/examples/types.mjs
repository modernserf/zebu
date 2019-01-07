import { lang } from '../index'

const t = lang`
  Expr    = CatExpr
          | AddExpr

  CatExpr = < . ~"++" StrExpr > ${(l, r) => l + r}
          | StrExpr
  StrExpr = ["(" CatExpr ")"]
          | %string

  AddExpr = < . ~"+" MulExpr >  ${(l, r) => l + r}
          | < . ~"-" MulExpr >  ${(l, r) => l - r}
          | MulExpr
  MulExpr = < . ~"*" NegExpr >  ${(l, r) => l * r}
          | < . ~"/" NegExpr >  ${(l, r) => l / r}
          | NegExpr
  NegExpr = < ~"-" . >          ${(value) => -value}
          | NumExpr
  NumExpr = ["(" AddExpr ")"]
          | %number
`

export function test_strings_can_concatenate (expect) {
  expect(t`"foo" ++ "bar"`).toEqual('foobar')
}

export function test_numbers_can_math (expect) {
  expect(t`10 * 20`).toEqual(200)
  expect(t`- - -(10)`).toEqual(-10)
}

export function test_operations_dont_work_on_wrong_types (expect) {
  expect(() => { t`10 ++ 20` }).toThrow()
  expect(() => { t`"foo" * "bar"` }).toThrow()
}
