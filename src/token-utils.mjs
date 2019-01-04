import moo from 'moo'

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

export const TOKENS_MACRO = Symbol('TOKENS_MACRO')

/**
 *
 * @param {Object} lexer
 * @param {[String]} strs
 * @param {[Object]} interpolations
 */
export function * tokenize (lexer, strs, interpolations) {
  for (const str of strs) {
    yield * lexer.reset(str)
    if (interpolations.length) {
      let interp = interpolations.shift()
      if (interp[TOKENS_MACRO]) {
        yield * interp[TOKENS_MACRO]
      } else {
        yield mapInterpolations(interp)
      }
    }
  }
}

const trimQuotes = str => str.slice(1, -1)
const toNumber = (str) => Number(str.replace(/_/g, ''))

const basePatterns = {
  line: { type: () => 'line', match: /\n+/, lineBreaks: true },
  whitespace: { type: () => 'ignore', match: /(?: |\t)+/ },
  lineComment: { type: () => 'ignore', match: /\/\/[^\n]*/ },
  blockComment: { type: () => 'ignore', match: /\/\*[^]*?\*\//, lineBreaks: true },
  dqstring: { type: () => 'string', match: /"(?:\\"|[^"])*"/, lineBreaks: true, value: trimQuotes },
  sqstring: { type: () => 'string', match: /'(?:\\'|[^'])*'/, lineBreaks: true, value: trimQuotes },
  decNumber: { type: () => 'number', match: /-?[0-9_]+(?:\.[0-9_]*)?(?:[eE]-?[0-9_])?/, value: toNumber },
  hexNumber: { type: () => 'number', match: /0x[0-9A-Fa-f_]+/, value: toNumber },
  octalNumber: { type: () => 'number', match: /0o[0-7_]+/, value: toNumber },
  binaryNumber: { type: () => 'number', match: /0b[0-1_]+/, value: toNumber },
  identifier: { match: /[$_A-Za-z][$_A-Za-z0-9]*/ },
}

function partition (xs, fn) {
  const trues = []
  const falses = []
  for (const x of xs) {
    if (fn(x)) { trues.push(x) } else { falses.push(x) }
  }
  return [trues, falses]
}

export function createBasicTokenizer (literals) {
  const [keyword, token] = partition(literals, (x) => /^[$_A-Za-z]/.test(x))
  const lexer = moo.compile({
    ...basePatterns,
    identifier: { ...basePatterns.identifier, keywords: moo.keywords({ keyword }) },
    token,
  })

  let consolidatingLines = false
  lexer.next = filterIter(lexer.next.bind(lexer), (tok) => {
    if (tok.type === 'ignore') { return false }
    if (tok.type === 'line') {
      if (consolidatingLines) { return false }
      consolidatingLines = true
      return true
    } else {
      consolidatingLines = false
      return true
    }
  })
  return lexer
}

function filterIter (next, filterFn) {
  return () => {
    let tok
    while ((tok = next())) {
      if (filterFn(tok)) { break }
    }
    return tok
  }
}
