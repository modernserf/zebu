import { lang } from '../root-language'
import { sepBy } from '../parse-utils'

const op2 = (left, op, right) => ({ left, op, right })
const _2 = (_, x) => x

export const sql = lang`
  Query = ("SELECT" Selection ${_2})
          ("FROM Sources ${_2})
          ("WHERE" Where ${_2})?
            ${(select, from, where) => ({ select, from, where })}

  Selection   = ${sepBy(lang`AsSelector`, lang`","`)}
  AsSelector  = DotSelector "AS" Ident 
                  ${({ table, column }, _, as) => ({ table, column, as })}
              | DotSelector
  DotSelector = Ident "." Ident 
                  ${(table, _, column) => ({ table, column })}
              | Ident ${(column) => ({ column })}

  Sources  = ${sepBy(lang`AsSource`, lang`","`)}
  AsSource = Ident "AS" Ident ${(table, _, as) => ({ table, as })}
           | Ident ${(table) => (table)}

  Where     = WhereAnd "OR" Where ${op2}
            | WhereAnd
  WhereAnd  = WhereComp "AND" WhereAnd ${op2}
            | WhereComp
  WhereComp = WhereExpr CompOp WhereExpr ${op2}
            | WhereExpr
  WhereExpr = "(" Where ")" ${_2}
            | Ident "." Ident ${(table, _, column) => ({ table, column })}
            | Ident ${(column) => ({ column })}
            | number
            | string

  CompOp = (">" | ">=" | "<" | "<=" | "=") ${({ value }) => value}

  Ident = identifier ${({ value }) => value}
`
