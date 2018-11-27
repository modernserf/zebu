import { lang } from './index'

const _2 = (_, x) => x
const value = ({ value }) => value
const fromPairs = (pairs) =>
  pairs.reduce((obj, [key, value]) => Object.assign(obj, { [key]: value }), {})

export const json = lang`
    Expr = "[" Expr ("," Expr ${_2})* "]" ${(h, t) => [h, ...t]}
         | "{" Pair ("," Pair ${_2})* "}" ${(h, t) => fromPairs([h, ...t])}
         | number  ${value}
         | string  ${value}
         | "true"  ${() => true}
         | "false" ${() => false}
         | "null"  ${() => null}
    Pair = string ":" Expr ${({ value }, _, expr) => [value, expr]} 
`

const _eval = (ctx, { type, value }) => ({
  value: () => value,
  expr: () => _apply(ctx, value.map((t) => _eval(ctx, t))),
  identifier: () => ctx[value],
})[type]()

// note: "functions" return { ctx, value }
const _apply = (ctx, [fn, ...args]) => fn(ctx, ...args)

const asValue = ({ value }) => ({ type: 'value', value })

let baseCtx

const lispInterpreter = (exprs) => (initCtx = baseCtx) =>
  exprs.reduce(({ ctx }, expr) => _eval(ctx, expr), initCtx)

export const lisp = lang.withConfig({ tokenizer: lispTokenizer })`
    Prog = Expr * ${lispInterpreter}
    Expr = "'" Expr ${(_, value) => asValue(value)}
         | "(" Expr* ")" ${(_, value) => ({ type: 'expr', value })}
         | string   ${asValue}
         | number   ${asValue}
         | function ${asValue} # interpolate JS fns as macros
         | identifier
`

const fn = (f) => (ctx, ...args) => ({ ctx, value: f(...args) })
const def = (ctx, name, value) => {
  ctx[name] = value // NOTE: mutates current scope
  return { ctx }
}

baseCtx = lisp`
    (${(ctx) => def(ctx, 'def', def)}) ; def "def"
    (def car ${fn(([x]) => x)})
    (def cdr ${fn(([_, ...xs]) => xs)})
    (def cons ${fn((l, r) => [l, ...r])})
`({}).ctx
