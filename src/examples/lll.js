import { lang } from '../root-language'

export const lang2 = lang`
  Program  = Rule*
           | AltExpr
  Rule     = RuleHead AltExpr
  RuleHead = identifier "="
  AltExpr  = SeqExpr % "|"
  SeqExpr  = (!RuleHead OpExpr)+ PlainFn?
  OpExpr   = RepExpr <% ("<%" | "%" | "%>")
  RepExpr  = Expr ("*" | "+" | "?" | nil)
  Expr     = ("!" | "&" | "~") Expr
           | ~"(" Expr ")"
           | ~"{" (identifier | string) % "," "}" 
           | { test }
           | { ast }
           | !{ ast } { parse }
           | string
           | identifier
           | "nil"
  PlainFn  = !{ parse } function
`
