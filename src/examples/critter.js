import { lang } from '../root-language'

export const critter = lang`
    Block      = Statement* Expression?
    Statement  = Keyword Assignment ~"=" Expression
               | Keyword Expression
    Keyword    = ~"@" identifier
    Expression = DotExpr <% operator
    DotExpr    = FnExpr (~"." DotExpr FnCall?)?
    FnExpr     = Expr (~"::" Key | FnCall)*
    FnCall     = ~"(" FnArg* ")" 
    FnArg      = (Key ":") Expression
    Expr       = ~"(" Expression ")"
               | ~"[" ((Key ":")? Expression)* "]"
               | ~"{" ("|" Param* "|")? Block "}"
               | ~"#" identifier
               | number
               | string
               | identifier
    Assignment = "[" Param* "]"
               | identifier
    Param      = Key (~":" identifier)? (~"=" Expression)?
    Key        = identifier | number
`
