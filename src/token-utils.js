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

/**
 * @typedef {{
 *   type: string,
 *   format: (s: string) => any,
 *   ignore: boolean,
 *   meta: {}
 * }} TokenRule
 * @typedef {(text: string) => IterableIterator<Token>} Tokenizer
 * @param {{[x: string]: TokenRule}} regexMap
 * @returns {Tokenizer}
 */
export function createTokenizer (regexMap) {
  const byIndex = Object.entries(regexMap).map(
    ([key, { type = key, format = (x) => x, ignore = false, meta = {} }]) => ({
      type,
      format,
      ignore,
      meta,
    })
  )

  const regexBase = mergeRegexes(Object.values(regexMap).map(x => x.pattern))
  return function * (text) {
    for (const match of runSticky(regexBase, text)) {
      const { index, captured } = capturedIndex(match)
      const { type, format, ignore, meta } = byIndex[index]
      if (!ignore) {
        yield new Token(type, format(captured), meta)
      }
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
