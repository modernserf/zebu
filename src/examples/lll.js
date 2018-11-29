import { lang } from '../root-language'

const _2 = (_, x) => x

export const lang2 = lang`
  Program = Rule*
          | AltExpr
  Rule    = identifier "=" AltExpr
  AltExpr = SeqExpr % "|"
  SeqExpr = OpExpr+ PlainFn
          | OpExpr OpExpr+
          | OpExpr
  OpExpr  = RepExpr <% ("<%" | "%" | "%>")
          | RepExpr 
  RepExpr = Expr ("*" | "+" | "?" | nil)
  Expr    = ("!" | "&") Expr
          | "(" Expr ")" ${_2}
          | "{" (number | string)+ "}" 
          | { test }
          | { ast }
          | { parse }
          | string
          | identifier
          | "nil"
  PlainFn = !{ parse } function
`
