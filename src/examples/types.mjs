import { lang, leftOp } from '../index'

const t = lang`
  Expression = StringExpr
             | AddExpr

  StringExpr = %string ~"++" StringExpr ${(l, r) => l + r}
             | ~"(" StringExpr ")"
             | %string

  AddExpr = ${leftOp(lang`MulExpr`, { '+': (l, r) => l + r, '-': (l, r) => l - r })}
  MulExpr = ${leftOp(lang`Expr`, { '*': (l, r) => l * r, '/': (l, r) => l / r })}
  Expr    = ~"(" AddExpr ")"
          | ~"-" Expr  ${(value) => -value}
          | %number
`

export function test_strings_can_concatenate (expect) {
  expect(t`"foo" ++ "bar"`).toEqual('foobar')
}

export function test_numbers_can_math (expect) {
  expect(t`10 * 20`).toEqual(200)
}

export function test_operations_dont_work_on_wrong_types (expect) {
  expect(() => { t`10 ++ 20` }).toThrow()
  expect(() => { t`"foo" * "bar"` }).toThrow()
}
