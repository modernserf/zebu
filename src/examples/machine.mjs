import { grammar } from '../index'

const eq = (l, r) => {
  if (l === r) { return true }
  if (!l || !r) { return false }
  if (typeof l !== 'object' || typeof r !== 'object') { return false }
  const lKeys = Object.keys(l)
  if (lKeys.length !== Object.keys(r).length) { return false }
  for (const key of lKeys) {
    if (l[key] !== r[key]) { return false }
  }
  return true
}

const inCollection = (x, xs) => {
  if (Array.isArray(xs)) {
    return xs.includes(x)
  }
  if (typeof xs === 'string') {
    return !!xs.match(x)
  }
  return x in xs
}

const opMap = {
  '+': (l, r) => l + r,
  '-': (l, r) => l - r,
  '*': (l, r) => l * r,
  '/': (l, r) => l / r,
  '%': (l, r) => l % r,
  '|': (l, r) => l || r,
  '&': (l, r) => l && r,
  '==': eq,
  '!=': (l, r) => !eq(l, r),
  '>': (l, r) => l > r,
  '>=': (l, r) => l >= r,
  '<': (l, r) => l < r,
  '<=': (l, r) => l <= r,
  in: (x, xs) => inCollection(x, xs),
  not_in: (x, xs) => !inCollection(x, xs),
  is: (l, r) => l === r,
  is_not: (l, r) => l !== r,
}
const ops = (l, op, r) => (scope) => opMap[op](l(scope), r(scope))

const toObj = (scope) => (obj, [k, f]) => { obj[k] = f(scope); return obj }

const joinThunks = (xs, scope) => (store) => xs.forEach((x) => x(scope)(store))

const ok = (value) => ({ type: 'ok', value })
const none = { type: 'none' }

const fmap = (fn, x) => x === none ? none : ok(fn(x.value))

const foldM = (fn, init, xs) =>
  xs.reduce((l, rM, i) => fmap((r) => fn(l, r, i), rM), ok(init))

const foldEvents = (params, xs) =>
  foldM((scope, x) => x({ ...params, scope }), ok(params.scope), xs)
const okEvent = ({ scope }) => ok({ scope })

const firstM = (xs) => {
  for (const x of xs) {
    if (x === none) { continue }
    return x
  }
  return none
}

function runGenerator (store, gen) {
}

const tagBind = (type, xs) => (initSc, value) => {
  if (value.type !== type) { return none }
  return foldM((sc, [key, f]) => f(sc, value[key]), initSc, xs)
}

function getAllStates (machine) {
  const states = [machine.state]
  for (const extend of machine.extends) {
    const added = []
    for (const state of states) {
      let res = extend(state)
      if (res !== none) {
        added.push(res.value)
      }
    }
    states.push(...added)
  }
}

function runMachine (event, machine, store) {
  const states = getAllStates(machine)
  for (const rule of machine.rule) {
    for (const state of states) {
      const matchedScope = rule.event({ state, event, scope: {} })
      if (matchedScope === none) { continue }

      const result = rule.effect(matchedScope.value)
      if (result === none) { continue }

      const [nextState, effectThunk] = result.value
      machine.state = nextState
      effectThunk(store)
      return
    }
  }
}

function compile (ds) {
  const machine = {
    extends: [],
    rule: [],
    start: [],
    subs: [],
  }
  for (const [type, value] of ds) {
    machine[type].push(value)
  }
  if (machine.start.length !== 1) { throw new Error('Machine must have one start value') }
  machine.state = machine.start[0]
  const store = {
    dispatch: (event) => {
      runMachine(event, machine, store)
      machine.subs.forEach((sub) => sub())
    },
    subscribe: (fn) => {
      machine.subs.push(fn)
      return () => {
        machine.subs = machine.subs.filter((x) => x !== fn)
      }
    },
    getState: () => machine.state,
  }
  return store
}

export const machine = grammar`
    Program = Declaration+ Rule+ ${(ds, rs) => compile([...ds, ...rs])}
    # TODO: track usage of tagged bindings as states/events
    #       to match top-level declarations
    Declaration = ~"states" ~"=" TagBind / "|"
                | ~"actions" ~"=" TagBind / "|"
                # TODO: "ensure" pattern?
                # TODO: handle sub-machine as state
                | ~"start" ~"=" TagExpr ${(value) => ['start', value]}
    Rule = OrEvent ~"->" OrEffect ${(event, effect) => ['rule', { event, effect }]}
           # ({ State, Scope }) => Maybe State
         | TagExpr ~"extends" TagBind
           ${(dest, src) => ['extends', (state) => fmap(dest, src({}, state))]}

    # effects are (scope) => Maybe [nextState?, (store) => {}]
    # TODO: [stateType?, [actionTypes], (scope) => Maybe [nextState?, (store) => {}]]
    #       for indexing / type checikng
    OrEffect    = CondEffect / "|"
                  ${(xs) => (scope) => firstM(xs.map((f) => f(scope)))}
    CondEffect  = AndEffect ~"if" Cond
                  ${(f, cond) => (scope) => cond(scope) ? ok(f(scope)) : none}
                | AndEffect ${(f) => (scope) => ok(f(scope))}
    AndEffect   = NextState (~"&" Effect)*
                  ${(f, xs) => (scope) => [f(scope), joinThunks(xs, scope)]}
                | Effect / "&"
                  ${(xs) => (scope) => [null, joinThunks(xs, scope)]}
    NextState   = TagExpr ${(getExpr) => (scope) => getExpr(scope)}
    Effect      = ["(" OrEffect ")"]
                | ~"dispatch" TagExpr 
                  ${(getExpr) => (scope) => (store) => store.dispatch(getExpr(scope))}
                | ~"await" %function 
                  ${(fn) => (scope) => (store) => Promise.resolve(fn(scope)).then(store.dispatch)}
                | ~"exec" %function
                  ${(gen) => (scope) => (store) => runGenerator(store, gen(scope))}

    # events are ({ State, Action, Scope }) => Maybe Scope
    # TODO: events as [stateType, actionType, ({state, action, scope}) => Maybe Scope]
    #       for indexing / type checking
    OrEvent   = CondEvent / "|"
                ${(xs) => (params) => firstM(xs.map(params))}
    CondEvent = ["(" OrEvent ")"]
              | State ~"@" Event (~"if" EventCond)?
                ${(s, e, c = okEvent) => (params) => foldEvents(params, [s, e, c])}

    Event     = TagBind ${(f) => ({ action, scope }) => f(scope, action)}
                # TODO: set up subscriptions on here?
              | "after" %number ("s" | "ms")
              | ("enter" | "exit") (State | Cond)
    State     = TagBind ${(f) => ({ state, scope }) => f(scope, state)}

    EventCond = Cond ${(cond) => ({ scope }) => cond(scope) ? ok(scope) : none}

    # cond are (scope) => bool
    OrCond    = < . ~"|" AndCond > ${ops}
              | AndCond
    AndCond   = < . ~"&" Cond > ${ops}
              | Cond
    Cond      = ["(" OrCond ")"]
              | %function
              | Expr CondOp Expr ${ops}
              | Expr
    # NOTE: these use _python_ semantics! 
    CondOp    = "==" | "!=" | ">=" | ">" | "<=" | "<" 
              | "in" | "not" "in" ${() => 'not_in'} 
              | "is" | "is" "not" ${() => 'is_not'}

    # bindings are (Scope, Value) => Maybe Scope
    TagBind  = ~"#" %ident BindPair* ${tagBind}
             | Binding
    BindPair = (%ident | %string) ~":" Binding ${(key, f) => [key, f]}
             | %ident ${(key) => [key, (scope, value) => ok({ ...scope, [key]: value })]}
    Binding  = ["(" TagBind ")"]
             | ["{" (BindPair / ",")? "}"]
               ${(xs) => (initSc, value) => foldM((sc, [key, f]) => f(sc, value[key]), initSc, xs)}
             | ["[" (Binding / ",")? "]"]
               ${(xs) => (initSc, value) => foldM((sc, f, i) => f(sc, value[i]), initSc, xs)}
             | "_"      ${() => (scope) => ok(scope)}
             | LitValue ${(match) => (scope, value) => match === value ? ok(scope) : none}
             | %ident   ${(key) => (scope, value) => ok({ ...scope, [key]: value })}

    # exprs are fn called with object containing current scope as arg
    TagExpr  = ~"#" %ident ExprPair*
               ${(type, xs) => (scope) => xs.reduce(toObj(scope), { type })}
             | Expr
    ExprPair = (%ident | %string) ~":" Expr ${(key, fn) => [key, fn]}
             | %ident ${(key) => [key, (scope) => scope[key]]}
    Expr     = < . ("+" | "-") MulExpr > ${ops}
             | MulExpr
    MulExpr  = < . ("*" | "/" | "%") PowExpr > ${ops}
             | PowExpr
    PowExpr  = < BaseExpr "**" . > ${ops}
             | BaseExpr
    BaseExpr = ["(" TagExpr ")"]
             | ["{" (ExprPair / ",")? "}"]
               ${(xs) => (scope) => xs.reduce(toObj(scope), {})}
             | ["[" (Expr / ",")? "]"]
               ${(xs) => (scope) => xs.map((f) => f(scope))}
             | LitValue    ${(value) => () => value}
             | %ident      ${(ident) => (scope) => scope[ident]}
             | %function

    LitValue = "true"      ${() => true}
             | "false"     ${() => false}
             | "null"      ${() => null}
             | "undefined" ${() => undefined}
             | %number | %string | %boolean 
             | %null | %undefined | %object | %symbol
`

/*
#Tag foo bar => { type: "Tag", foo, bar }

match a state called "foo"
#foo @ #event -> bar
match any state, binding it to "foo"
foo @ #event -> bar
*/
