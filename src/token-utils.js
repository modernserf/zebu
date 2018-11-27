class Token {
  constructor (type, value, meta = {}) {
    this.type = type
    this.value = value
    this.meta = meta
  }
}

const $t = (type, value, meta) => new Token(type, value, meta)

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

const id = (x) => x
export class TokenPattern {
  constructor (pattern, { format = id, type, meta = {}, ignore = false } = {}) {
    this.pattern = pattern
    this.format = format
    this.type = type
    this.meta = meta
    this.ignore = ignore
  }
  asType (type) {
    const next = new TokenPattern(this.pattern, this)
    next.type = type
    return next
  }
  ignored () {
    const next = new TokenPattern(this.pattern, this)
    next.ignore = true
    return next
  }
  * tokens (value) {
    if (this.ignore) { return }
    yield new Token(this.type, this.format(value), this.meta)
  }
}

/**
 * @typedef {(text: string) => IterableIterator<Token>} Tokenizer
 * @param {{[x: string]: TokenPattern}} patternMap
 * @returns {Tokenizer}
 */
export function createTokenizer (patternMap) {
  const byIndex = Object.entries(patternMap).map(
    ([key, pattern]) => {
      if (pattern instanceof RegExp) {
        pattern = new TokenPattern(pattern)
      } else if (!pattern.asType) {
        pattern = new TokenPattern(pattern.pattern, pattern)
      }
      return pattern.type ? pattern : pattern.asType(key)
    })

  const regexBase = mergeRegexes(Object.values(patternMap).map(x => x.pattern))
  return function * (text) {
    for (const match of runSticky(regexBase, text)) {
      const { index, captured } = capturedIndex(match)
      const pattern = byIndex[index]
      yield * pattern.tokens(captured)
    }
  }
}

export function test_createTokenizer (expect) {
  const tokenize = createTokenizer({
    number: { pattern: /[0-9]+(?:\.[0-9]+)?/, format: Number },
    whitespace: { pattern: /\n|\s/, ignore: true },
    token: { pattern: /[-+*/()]/ },
  })
  const text = '(-3.1 + 4) * 200'
  const tokens = [...tokenize(text)]
  expect(tokens).toEqual([
    $t('token', '('),
    $t('token', '-'),
    $t('number', 3.1),
    $t('token', '+'),
    $t('number', 4),
    $t('token', ')'),
    $t('token', '*'),
    $t('number', 200),
  ])
}

function smartTypeOf (value) {
  if (typeof value === 'object' && !value) {
    return 'null'
  }
  return typeof value
}

const isLiteral = (value) => ['string', 'number'].includes(typeof value)

const mapInterpolations = value =>
  new Token(
    smartTypeOf(value),
    value,
    { interpolated: true, literal: isLiteral(value) }
  )

/**
 * @param {Tokenizer} tokenizer
 * @param {string[]} strs
 * @param {Token[]} interpolations
 */
export function * tokenize (tokenizer, strs, interpolations) {
  for (const str of strs) {
    yield * tokenizer(str)
    if (interpolations.length) {
      yield mapInterpolations(interpolations.shift())
    }
  }
}

const trimQuotes = str => str.slice(1, -1)

export const jsNumber = new TokenPattern(
  /-?[0-9]+(?:\.[0-9]+)?/,
  { format: Number, meta: { literal: true } }
)

export const string = (q) => new TokenPattern(
  new RegExp(String.raw`${q}(?:\\${q}|[^${q}])*${q}`),
  { format: trimQuotes, meta: { literal: true } }
)

export const whitespace = new TokenPattern(/(?:\n|\s)+/)

export const lineComment = (delimiter) =>
  new TokenPattern(new RegExp(String.raw`${delimiter}[^\n]+`))

export const jsIdentifier = new TokenPattern(/[_$A-Za-z][_$A-Za-z0-9]*/)

export const groupings = new TokenPattern(/[(){}[\]]/)

const escapeRegex = (str) =>
  str.replace(/[.$*+?()!{^[\\\]]/g, (ch) => '\\' + ch)

export const keywords = (...kws) => new TokenPattern(
  new RegExp(kws.map(escapeRegex).join('|'))
)
