import { lang } from '../root-language'

const op2 = (op) => (left, right) => ({ left, op, right })

export const sql = lang`
  Query = ~"SELECT" (Selector % ",")
          ~"FROM (Source % ",")
          (~"WHERE" Where)?
            ${(select, from, where) => ({ select, from, where })}

  Selector    = DotSelector ~"AS" Ident 
                  ${({ table, column }, as) => ({ table, column, as })}
              | DotSelector
  DotSelector = Ident ~"." Ident 
                  ${(table, column) => ({ table, column })}
              | Ident ${(column) => ({ column })}

  Source = Ident ~"AS" Ident ${(table, as) => ({ table, as })}
         | Ident ${(table) => ({ table })}

  Where     = WhereAnd <% ("OR" ${op2('OR')})
  WhereAnd  = WhereComp <% ("AND" ${op2('AND')})
  WhereComp = WhereExpr <% CompOp
  WhereExpr = ~"(" Where ")"
            | Ident ~"." Ident ${(table, column) => ({ table, column })}
            | Ident ${(column) => ({ column })}
            | number
            | string

  CompOp = (">" | ">=" | "<" | "<=" | "=") ${({ value: op }) => op2(op)}

  Ident = identifier ${({ value }) => value}
`
