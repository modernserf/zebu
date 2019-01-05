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

const trimQuotes = str => str.slice(1, -1)
const toNumber = (str) => Number(str.replace(/_/g, ''))

const baseTokenizer = moo.compile({
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
  punctuation: { match: /[,;(){}[\]]/ },
  operator: { match: /[!@#%^&*\-+=|/:<>.?/~]+/ },
})

function withProcessedStream (tokenizer) {
  let consolidatingLines = false
  tokenizer.next = filterIter(tokenizer.next.bind(tokenizer), (tok) => {
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
  return tokenizer
}

const tokenizer = withProcessedStream(baseTokenizer)

/**
 * @param {[String]} strs
 * @param {[Object]} interpolations
 */
export function * tokenize (strs, interpolations) {
  for (const str of strs) {
    yield * tokenizer.reset(str)
    if (interpolations.length) {
      let interp = interpolations.shift()
      yield mapInterpolations(interp)
    }
  }
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
