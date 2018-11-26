// bootstrap parser
// TODO: packrat parser?
const next = (tokens, index) => ({ node: tokens[index], index: index + 1 })

const matchToken = matcher => ({ tokens, index }) =>
  tokens.length > index && matcher(tokens[index]) ? next(tokens, index) : null

export const token = type => matchToken(tok => tok.type === type)
export const lit = value =>
  matchToken(
    tok => tok.value === value && ['identifier', 'token'].includes(tok.type)
  )
export const regex = re => matchToken(tok => re.test(tok.value))

export const seq = (mapFn, ...parsers) => ({ tokens, index }) => {
  const out = []
  for (const p1 of parsers) {
    const res = p1({ tokens, index })
    if (!res) {
      return null
    }
    out.push(res.node)
    index = res.index
  }
  return { node: mapFn(...out), index }
}

export const alt = (...parsers) => subject => {
  for (const p2 of parsers) {
    const res = p2(subject)
    if (res) {
      return res
    }
  }
  return null
}

const any = parser => ({ tokens, index }) => {
  const out = []
  while (index < tokens.length) {
    const res = parser({ tokens, index })
    if (!res) {
      break
    }
    out.push(res.node)
    index = res.index
  }
  return { node: out, index }
}

const cons = (first, rest) => [first, ...rest]
const id = x => x
const _2 = (_1, _2) => _2

const some = parser => seq(cons, parser, any(parser))

const maybe = (parser, defaultNode = null) => subject => {
  const res = parser(subject)
  if (res) {
    return res
  }
  return { node: defaultNode, index: subject.index }
}

const sepBy = (valueParser, sepParser) =>
  seq(cons, valueParser, any(seq(_2, sepParser, valueParser)))

export const lazy = fn => {
  let memo = null
  return (...args) => {
    if (!memo) {
      memo = fn()
    }
    return memo(...args)
  }
}

export function lazyTree (inMap) {
  let outMap = {}
  for (const key in inMap) {
    outMap[key] = lazy(() => inMap[key](outMap))
  }
  return outMap
}

const mergeRegexes = (regexes, flags) => new RegExp(
  regexes.map(re => '(' + re.toString().slice(1, -1) + ')').join('|'),
  flags
)

function * runSticky (regexBase, text) {
  const re = new RegExp(regexBase, 'y')
  let match
  // eslint-disable-next-line no-cond-assign
  while ((match = re.exec(text))) {
    yield match
  }
}

function capturedIndex (match) {
  for (let i = 1; i < match.length; i++) {
    if (match[i] !== undefined) {
      return { index: i - 1, captured: match[i] }
    }
  }
  throw new Error('Matched with no capture')
}
export function createTokenizer (regexMap) {
  const byIndex = Object.entries(regexMap).map(
    ([key, { type = key, format = id, ignore = false }]) => ({
      type,
      format,
      ignore
    })
  )

  const regexBase = mergeRegexes(Object.values(regexMap).map(x => x.pattern))
  return function * (text) {
    for (const match of runSticky(regexBase, text)) {
      const { index, captured } = capturedIndex(match)
      const { type, format, ignore } = byIndex[index]
      if (!ignore) {
        yield { type, value: format(captured) }
      }
    }
  }
}

function smartTypeOf (value) {
  if (typeof value === 'object') {
    if (!value) {
      return 'null'
    }
    return value.constructor.name
  }
  return typeof value
}

const mapInterpolations = value => ({
  type: smartTypeOf(value),
  value,
  interpolated: true
})

function * _tokenize (tokenizer, strs, interpolations) {
  for (const str of strs) {
    yield * tokenizer(str)
    if (interpolations.length) {
      yield mapInterpolations(interpolations.shift())
    }
  }
}

export function parse (parser, tokens) {
  const res = parser({ tokens, index: 0 })
  if (!res) {
    throw new Error('No match for parsing')
  }
  if (res.index !== tokens.length) {
    throw new Error('Leftover tokens')
  }
  return res.node
}

const trimQuotes = str => str.slice(1, -1)
export const defaultTokens = {
  number: { pattern: /-?[0-9]+(?:\.[0-9]+)?/, format: Number },
  dqstring: {
    pattern: /"(?:\\"|[^"])*"/,
    format: trimQuotes,
    type: 'string'
  },
  sqstring: {
    pattern: /'(?:\\'|[^'])*'/,
    format: trimQuotes,
    type: 'string'
  },
  whitespace: { pattern: /\n|\s/, ignore: true },
  comment: { pattern: /#[^\n]+/, ignore: true },
  // match _foo123 as "_foo123"
  identifier: { pattern: /[_A-Za-z][_A-Za-z0-9]*/ },
  // match anything else as one token per character
  token: { pattern: /./ }
}

const defaultTokenizer = createTokenizer(defaultTokens)

const recur = fn => expr => ruleMap => fn(expr(ruleMap))

const nilLanguage = ({ tokens }) => (tokens.length === 0 ? { node: null, index: 0 } : null)

// TODO: helper for processing interpolated values
// e.g. `${123.45}` is tagged as `{ type: 'number', value: 123.45, interpolated: true }`
// if you can interpolate matchers, then you can match interpolations however you like
// e.g. `EvenInterpolatedNumber  = ${match(tok => tok.interpolated && tok.type === 'number' && tok.value % 2 === 0}`
export const rootParser = lazyTree({
  Program: p =>
    seq(rules => {
      if (!rules.length) {
        return nilLanguage
      }
      const ruleMap = {}
      for (const [name, rule] of rules) {
        ruleMap[name] = lazy(() => rule({ ruleMap, currentRule: name, posInRule: 0 }))
      }
      const topRuleName = rules[0][0]
      // force evaluation of parser (otherwise parser won't even build until its used!)
      // this also proactively finds parse errors
      ruleMap[topRuleName]({ tokens: [], index: 0 })
      return ruleMap[topRuleName]
    }, any(p.Rule)),
  Rule: p =>
    seq(
      ({ value: name }, _, rule) => [name, rule],
      token('identifier'), lit('='), p.AltExpr),
  AltExpr: p =>
    seq(
      alts => ctx => alt(...alts.map(x => x(ctx))),
      sepBy(p.SeqExpr, lit('|'))),
  SeqExpr: p =>
    alt(
      seq(
        (exprs, { value: mapFn }) => ctx =>
          seq(mapFn, ...exprs.map((f, i) =>
            f({ ...ctx, posInRule: ctx.posInRule + i }))),
        some(p.OpExpr), token('function')),
      // TODO: allow seq without mapFn
      // seq((first, rest) => ruleMap =>
      //   seq((...xs) => xs, first(ruleMap), ...rest.map(x => x(ruleMap))),
      //   p.OpExpr, some(p.OpExpr)),
      p.OpExpr
    ),
  OpExpr: p =>
    alt(
      seq(recur(any), p.Expr, lit('*')),
      seq(recur(some), p.Expr, lit('+')),
      seq(recur(maybe), p.Expr, lit('?')),
      p.Expr
    ),
  Expr: p =>
    alt(
      // TODO: `nil`, & Expr, ! Expr (for full PEG compatibility)
      seq(
        (_, value) => ctx => value(ctx),
        lit('('), p.AltExpr, lit(')')),
      seq(
        ({ value }) => ({ ruleMap, currentRule, posInRule }) => {
          if (value === currentRule && posInRule === 0) {
            throw new Error(`Invalid left recursion on ${value}`)
          }
          return ruleMap[value] || token(value)
        },
        token('identifier')),
      seq(
        ({ value }) => _ => lit(value),
        token('string')),
      seq(
        ({ value }) => _ => regex(value),
        token('RegExp'))
    )
})

const createLanguage = ({ tokenizer, grammar }) => (strs, ...interpolations) => {
  const tokens = Array.from(_tokenize(tokenizer, strs, interpolations))
  return parse(grammar, tokens)
}

const compileGrammar = createLanguage({
  grammar: rootParser.Program,
  tokenizer: defaultTokenizer
})

export const tokenize = (tokenizer) => (strs, ...interpolations) =>
  _tokenize(tokenizer, strs, interpolations)

export const lang = (strs, ...interpolations) =>
  createLanguage({
    grammar: compileGrammar(strs, ...interpolations),
    tokenizer: defaultTokenizer
  })

lang.withConfig = options => (strs, ...interpolations) =>
  createLanguage({
    grammar: compileGrammar(strs, ...interpolations),
    tokenizer: defaultTokenizer,
    ...options
  })
