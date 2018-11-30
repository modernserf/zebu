import { lang } from '../root-language'
import { createTokenizer, string, TokenPattern, lineComment, groupings, jsNumber, keywords } from '../token-utils'

const tokenizer = createTokenizer({
  number: jsNumber,
  string: string(`"`).asType(),
  whitespace: new TokenPattern(/(?:\s\t)+/),
  newline: new TokenPattern(/\n+/),
  comment: lineComment(';'),
  token: keywords('.', '::', ':=', '|', '#'),
  identifier: new TokenPattern(/[A-Za-z_][^(){}[\]_\s\t\n"'#:.]*/),
  operator: new TokenPattern(/[^A-Za-z0-9(){}[\]_\s\t\n"'#:.]+/),
  groupings: groupings,
})

export const critter = lang.withConfig({ tokenizer })`
    Program    = _? Block _?
    Block      = (Statement % NL)? Expression?
    Statement  = Keyword _ Assignment _ ":=" _ Expression
               | Keyword _ Expression
    Keyword    = "@" identifier
    Expression = DotExpr <% (_ operator _)
    DotExpr    = FnExpr <% (_? ".")
    FnExpr     = Expr (_? "::" Key | FnCall)*
    FnCall     = "(" _? (FnArg % _) _? ")" 
    FnArg      = (Key ":" _)? Expression
    Expr       = "(" _? Expression _? ")" # parenthetical
               | "[" _? ((Key ":")? Expression)* _? "]" # record
               | "{" _? (FnParms _)? Block _? "}" # fn def
               | "#" identifier         # keyword
               | "(" _? operator _? ")" # quoted operator
               | number
               | string
               | identifier
    Assignment = "[" _? Param % _ _? "]"
               | "(" _? operator _? ")"
               | identifier
    FnParams   = "|:" _? Param % _  _? ":|"
    Param      = Key (":" _ identifier)? (_ "=" _ Expression)?
    Key        = identifier | number

    NL         = (whitespace | comment)* newline _?
    _          = (whitespace | comment | newline)+
`
