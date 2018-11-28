import { lang } from '../root-language'
import { createTokenizer, jsNumber, string, whitespace, lineComment, keywords, TokenPattern } from '../token-utils'

const _eval = (ctx, { type, value }) => ({
  value: () => value,
  expr: () => _eval(ctx, value[0])(ctx, value.slice(1)),
  identifier: () => ctx[value],
})[type]()

const lispInterpreter = (exprs) => (initCtx = baseCtx) =>
  exprs.reduce(({ ctx }, expr) => _eval(ctx, expr), initCtx)

const lispTokenizer = createTokenizer({
  number: jsNumber,
  string: string(`"`),
  whitespace: whitespace.ignored(),
  comment: lineComment(';').ignored(),
  token: keywords(`'`, `(`, `)`),
  identifier: new TokenPattern(/[^\s\n"';()]+/),
})

const asValue = ({ value }) => ({ type: 'value', value })

export const sicp = lang.withConfig({ tokenizer: lispTokenizer })`
    Prog = Expr * ${lispInterpreter}
    Expr = "'" Expr ${(_, value) => asValue(value)}
         | "(" Expr* ")" ${(_, value) => ({ type: 'expr', value })}
         | string   ${asValue}
         | number   ${asValue}
         | function ${asValue} # interpolate JS fns as macros,
         | identifier          # returning { ctx, value }
`

const fn = (f) => (ctx, ...args) => ({ ctx, value: f(...args) })
const def = (ctx, name, value) => {
  ctx[name] = value // NOTE: mutates current scope
  return { ctx }
}

const baseCtx = sicp`
    (${(ctx) => def(ctx, 'def', def)}) ; def "def"
    (def car ${fn(([x]) => x)})
    (def cdr ${fn(([_, ...xs]) => xs)})
    (def cons ${fn((l, r) => [l, ...r])})
`({}).ctx
