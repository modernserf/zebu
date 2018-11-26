// bootstrap parser
// TODO: is this sufficent for packrat?
const memoParse = (fn) => {
  const memo = new Map()
  return ({ tokens, index }) => {
    const tokenMemo = memo.get(tokens) || {}
    if (!tokenMemo[index]) {
      tokenMemo[index] = fn({ tokens, index })
      memo.set(tokens, tokenMemo)
    }
    return tokenMemo[index]
  }
}

class Parser {
  constructor (parse) {
    this.parse = memoParse(parse)
  }
}

const p = (parse) => new Parser(parse)

export const nil = { parse: ({ index }) => ({ node: null, index }) }

export const eof = p(({ tokens, index }) => index === tokens.length
  ? ({ node: null, index })
  : null)

const next = (tokens, index) => ({ node: tokens[index], index: index + 1 })

const matchToken = matcher => p(({ tokens, index }) =>
  tokens.length > index && matcher(tokens[index]) ? next(tokens, index) : null)

export const token = type => matchToken(tok => tok.type === type)
export const lit = value =>
  matchToken(
    tok => tok.value === value && tok.type !== 'string'
  )
export const hasMethod = (...methods) =>
  matchToken(tok => tok.value && methods.every(m => m in tok.value))
export const runTest = re => matchToken(tok => re.test(tok.value))

export const seq = (mapFn, ...parsers) => p(({ tokens, index }) => {
  const out = []
  for (const p1 of parsers) {
    const res = p1.parse({ tokens, index })
    if (!res) { return null }
    out.push(res.node)
    index = res.index
  }
  return { node: mapFn(...out), index }
})

export const alt = (...parsers) => p((subject) => {
  for (const p2 of parsers) {
    const res = p2.parse(subject)
    if (res) { return res }
  }
  return null
})

export const any = parser => p(({ tokens, index }) => {
  const out = []
  while (index < tokens.length) {
    const res = parser.parse({ tokens, index })
    if (!res) { break }
    out.push(res.node)
    index = res.index
  }
  return { node: out, index }
})

const cons = (first, rest) => [first, ...rest]
const id = x => x

export const some = parser => seq(cons, parser, any(parser))

export const maybe = (parser, defaultNode = null) => p((subject) => {
  const res = parser.parse(subject)
  if (res) {
    return res
  }
  return { node: defaultNode, index: subject.index }
})

export const sepBy = (valueParser, sepParser) =>
  seq(cons, valueParser, any(seq((_, value) => value, sepParser, valueParser)))

export const lookahead = (parser) => p((subject) => parser.parse(subject)
  ? nil.parse(subject)
  : null)

export const notLookahead = (parser) => p((subject) => parser.parse(subject)
  ? null
  : nil.parse(subject))

export const lazy = fn => {
  let memo = null
  return new Parser((...args) => {
    if (!memo) { memo = fn() }
    return memo.parse(...args)
  })
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
      ignore,
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
  if (typeof value === 'object' && !value) {
    return 'null'
  }
  return typeof value
}

const mapInterpolations = value => ({
  type: smartTypeOf(value),
  value,
  interpolated: true,
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
  const res = parser.parse({ tokens, index: 0 })
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
    type: 'string',
  },
  sqstring: {
    pattern: /'(?:\\'|[^'])*'/,
    format: trimQuotes,
    type: 'string',
  },
  whitespace: { pattern: /\n|\s/, ignore: true },
  comment: { pattern: /#[^\n]+/, ignore: true },
  // match _foo123 as "_foo123"
  identifier: { pattern: /[_A-Za-z][_A-Za-z0-9]*/ },
  // match structure tokens individually
  structure: { pattern: /[(){}[\]]/, type: 'token' },
  // match anything else
  token: { pattern: /[^A-Za-z0-9(){}[\]_\s\n]+/ },
}

// TODO: alternate tokenizers (e.g. lisp)

const defaultTokenizer = createTokenizer(defaultTokens)

const recur = fn => expr => ctx => fn(expr(ctx))

const getInitCtx = () => ({ ruleMap: {}, currentRule: null, posInRule: 0 })

const withCtx = (fn) => ({
  withCtx: fn,
  parse: fn(getInitCtx()).parse,
})

export const rootParser = lazyTree({
  Program: p =>
    alt(
      seq(rules => withCtx((ctx) => {
        // TODO: would this be better without mutation? or is mutation essential?
        rules.forEach((rule) => rule(ctx))
        const parser = ctx.ruleMap[ctx.init]

        // force evaluation of parser (otherwise parser won't even build until its used!)
        // this also proactively finds parse errors
        parser.parse({ tokens: [], index: 0 })
        return parser
      }), some(p.Rule)),
      seq(withCtx, p.AltExpr),
      seq(() => eof, eof)
    ),
  Rule: p =>
    alt(
      seq(
        ({ value: name }, _, rule) => (ctx) => {
          ctx.ruleMap[name] = lazy(() => rule(ctx))
          if (!ctx.init) { ctx.init = name }
          return name
        },
        token('identifier'), lit('='), p.AltExpr)
      // seq(
      //   ({ withCtx }) => (ctx) => withCtx(ctx),
      //   hasMethod('withCtx')
      // )
    ),
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
        some(p.OpExpr), matchToken((tok) => tok.type === 'function' && !tok.value.parse)),
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
      seq(
        (_, expr) => ctx => lookahead(expr(ctx)),
        lit('&'), p.Expr),
      seq(
        (_, expr) => ctx => notLookahead(expr(ctx)),
        lit('!'), p.Expr),
      seq(() => () => nil, lit('nil')),
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
      // interpolated parsers
      seq(
        ({ value }) => ctx => value.withCtx(ctx),
        hasMethod('withCtx')),
      seq(
        ({ value }) => ctx => value,
        hasMethod('parse')),
      // interpolated regular expressions
      seq(
        ({ value }) => _ => matchToken(tok => value.test(tok)),
        hasMethod('test'))
    ),
})

const createLanguage = ({ tokenizer, parser }) => {
  const tts = (strs, ...interpolations) => {
    const tokens = Array.from(_tokenize(tokenizer, strs, interpolations))
    return parse(parser, tokens)
  }
  // add `parse`, `withCtx` methods for subparsing
  Object.assign(tts, parser)
  return tts
}

const compileGrammar = createLanguage({
  parser: rootParser.Program,
  tokenizer: defaultTokenizer,
})

export const tokenize = (tokenizer) => (strs, ...interpolations) =>
  _tokenize(tokenizer, strs, interpolations)

export const lang = (strs, ...interpolations) =>
  createLanguage({
    parser: compileGrammar(strs, ...interpolations),
    tokenizer: defaultTokenizer,
  })

lang.withConfig = options => (strs, ...interpolations) =>
  createLanguage({
    parser: compileGrammar(strs, ...interpolations),
    tokenizer: defaultTokenizer,
    ...options,
  })
