import { lang } from '../root-language'

export const lang2 = lang`
  Program  = Rule*
           | AltExpr
  Rule     = identifier "=" ~ AltExpr
  AltExpr  = SeqExpr % "|"
  SeqExpr  = OpExpr+ PlainFn
           | OpExpr
  OpExpr   = RepExpr <% ("<%" | "%" | "%>")
  RepExpr  = DropExpr ("*" | "+" | "?" | nil)
  DropExpr = Expr <% "~"
  Expr     = ("!" | "&") Expr
           | "(" ~ Expr ")"
           | "{" ~ (identifier | string) % "," "}" 
           | { test }
           | { ast }
           | { parse }
           | string
           | identifier
           | "nil"
  PlainFn  = !{ parse } ~ function
`
