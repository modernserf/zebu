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

export function * tokenize (tokenizer, strs, interpolations) {
  for (const str of strs) {
    yield * tokenizer.reset(str)
    if (interpolations.length) {
      yield mapInterpolations(interpolations.shift())
    }
  }
}

const trimQuotes = str => str.slice(1, -1)

const escapeRegex = (str) =>
  str.replace(/[.$*+?()!|{^[\\\]]/g, (ch) => `\\${ch}`)

const raw = String.raw

const patterns = [
  { type: 'number', pattern: raw`-?[0-9]+(?:\.[0-9]*)?(?:[eE]-?[0-9])?`, format: Number },
  { type: 'number', pattern: raw`0x[0-9A-Fa-f]+`, format: Number },
  { type: 'number', pattern: raw`0o[0-7]+`, format: Number },
  { type: 'number', pattern: raw`0b[0-1]+`, format: Number },
  { type: 'string', pattern: raw`"(?:\\"|[^"])*"`, format: trimQuotes },
  { type: 'string', pattern: raw`'(?:\\'|[^'])*'`, format: trimQuotes },
  { type: 'ignore', pattern: raw`#[^\n]*` },
  { type: 'ignore', pattern: raw`\s+` },
  { type: 'identifier', pattern: raw`[$_A-Za-z][$_A-Za-z0-9]*` },
]

// do our best guess at matching everything else
const tokensCatchAll = {
  type: 'token',
  pattern: raw`[(){}[\]]|[^$_A-Za-z0-9"'(){}[\]#\s]+`,
}

const altPatterns = (xs) => xs.map(escapeRegex).join('|')

export function createBasicTokenizer (keywords, tokenLiterals) {
  const kw = new RegExp(altPatterns(keywords))
  const allPatterns = patterns.concat([
    { type: 'token', pattern: altPatterns(tokenLiterals) },
    tokensCatchAll,
  ])
  const giantRegex = new RegExp(
    allPatterns.map((p) => '(' + p.pattern + ')').join('|'),
    'y'
  )

  return {
    text: '',
    reset (text) {
      this.text = text
      return this
    },
    * [Symbol.iterator] () {
      for (const match of runSticky(giantRegex, this.text)) {
        const { index, captured } = capturedIndex(match)
        const pattern = allPatterns[index]
        if (pattern.type === 'ignore') { continue }
        const type = pattern.type === 'identifier' && kw.test(captured)
          ? 'keyword'
          : pattern.type

        yield {
          type,
          value: pattern.format ? pattern.format(captured) : captured,
        }
      }
    },
  }
}

// usage
// lang({ withTokenizer: ({ keywords, tokens }) => tokenizer })`...`
