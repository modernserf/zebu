/**
 * @typedef {(p: ParseSubject) => ParserOutput | ParserError} parseFn
 */

/**
 * TODO: is this sufficent for packrat?
 *
 * @param {parseFn} parseFn
 * @returns {parseFn}
 */
const memoParse = (parseFn) => {
  const memo = new Map()
  return (subject) => {
    const { tokens, index, context } = subject
    const tokenMemo = memo.get(tokens) || new Map()
    const contextMemo = tokenMemo.get(context) || {}
    if (!contextMemo[index]) {
      contextMemo[index] = parseFn(subject)
      tokenMemo.set(context, contextMemo)
      memo.set(tokens, tokenMemo)
    }
    return contextMemo[index]
  }
}

/**
 * mock interface for token (see tokenizer.js)
 * @typedef {{type: string, value: any, meta: object}} Token
 */
const $t = (type, value = null, meta = {}) => ({ type, value, meta })

export class ParseSubject {
  /**
   * @param {Token[]} tokens
   * @param {number} index
   * @param {any} context
   */
  constructor (tokens, index, context) {
    this.tokens = tokens
    this.index = index
    this.context = context
  }
  update (output) {
    return new ParseSubject(this.tokens, output.index, output.context)
  }
  output (node, index = this.index, context = this.context) {
    return new ParserOutput(node, index, context)
  }
  error (error, index = this.index, context = this.context) {
    return new ParserError(error, index, context)
  }
  atIndex () {
    return this.tokens[this.index]
  }
}

export class Parser {
  /**
   * make a parser that evaluates lazily (e.g. for recursive definitions).
   * @param {() => parseFn} parserThunk
   */
  static lazy (parserThunk) {
    let memo
    return new Parser((subject) => {
      if (!memo) { memo = parserThunk() }
      return memo.parse(subject)
    })
  }

  /**
   * Make a dictionary of mutually recurisve parsers. Example:
   ```js
    Parser.language({
      Expr: r => alt(
        seq((_, x) => x, lit("("), r.Expr, lit(")")),
        token("number")
      )
    })```
   * @param {{[x: string]: (o: {}) => Parser}} inMap
   * @returns {{[x: string]: Parser}}
   */
  static language (inMap) {
    let outMap = {}
    for (const key in inMap) {
      outMap[key] = Parser.lazy(() => inMap[key](outMap))
      outMap[key]._name = key
    }
    return outMap
  }
  /**
   * @param {parseFn} parseFn
   */
  constructor (parseFn) {
    this.parse = parseFn
  }
}

export function test_Parser_lazy (expect) {
  const Expr = Parser.lazy(() =>
    alt(
      seq((_, x) => x, lit('('), Expr, lit(')')),
      seq((_, x) => -x, lit('-'), Expr),
      seq(({ value }) => value, token('number'))
    ))
  // -(-(123))
  const tokens = [
    $t('token', '-'),
    $t('token', '('),
    $t('token', '-'),
    $t('token', '('),
    $t('number', 123),
    $t('token', ')'),
    $t('token', ')'),
  ]
  expect(parse(Expr, tokens)).toEqual(123)
}

export class MemoParser extends Parser {
  /**
   * @param {parseFn} parseFn
   */
  constructor (parseFn) {
    super(memoParse(parseFn))
  }
}

export class ParserOutput {
  /**
   * @param {any} node
   * @param {number} index
   * @param {any} context
   */
  constructor (node, index, context) {
    this.ok = true
    this.node = node
    this.index = index
    this.context = context
  }
}

export class ParserError {
  constructor (error, index, context) {
    this.ok = false
    this.error = error
    this.index = index
    this.context = context
  }
}

/**
 * consumes no input, always succeeds
 */
export const nil = new Parser(({ index }) => new ParserOutput(null, index))

export function test_nil_matches_an_empty_sequence (expect) {
  expect(parse(nil, [])).toEqual(null)
  expect(() => {
    parse(nil, [$t('foo')])
  }).toThrow()
}

/**
 * matches the start of input.
 */
export const start = new Parser((subject) =>
  subject.index === 0 ? subject.output(null) : subject.error('not at start'))

/**
 * matches the end of input.
 */
export const end = new Parser((subject) =>
  subject.index === subject.tokens.length ? subject.output(null) : subject.error('not at end'))

/**
 * matches if matchFn(token) returns true.
 * @param {(t: Token) => boolean} matchFn
 * @param {any} error
 */
export const matchToken = (matchFn, error = 'did not match') => new Parser((subject) => {
  const token = subject.atIndex()
  if (!token) { return subject.error('unexpected end of input') }
  return matchFn(token)
    ? subject.output(subject.atIndex(), subject.index + 1)
    : subject.error(error)
})

/**
 * matches if token.type === type.
 * @param {string} type
 */
export const token = (type) => matchToken(
  tok => tok.type === type,
  ['did not match type', type])

export function test_token_matches_a_type (expect) {
  expect(parse(token('foo'), [{ type: 'foo' }])).toEqual({ type: 'foo' })
  expect(() => { parse(token('foo'), [{ type: 'bar' }]) }).toThrow()
}

/**
 * matches if token.value === string, and token is not itself a literal.
 * @param {string} string
 */
export const lit = (string) => matchToken(
  tok => tok.value === string && !tok.meta.literal,
  ['did not match value', lit])

export function test_lit_matches_values (expect) {
  const parser = lit('(')
  const tokens = [$t('structure', '(')]
  expect(parse(parser, tokens)).toEqual($t('structure', '('))
}

/**
 * matches if token.value has props with these names.
 * @param  {...string} methods
 */
export const hasProps = (...methods) =>
  matchToken((tok) => tok.value && methods.every((m) => tok.value[m]))

/**
 * Object with a test method (e.g. a regular expression).
 * @typedef {{ test: (value: any) => boolean }} Tester
 */

/**
 * matches if tester.test(token.value) returns true.
 * @param {Tester} tester
 */
export const testValue = (tester) =>
  matchToken((tok) => tester.test(tok.value))

/**
 * matches if each in a sequence of parsers matches.
 * outputs mapFn(subject, ...outputs).
 * @param {(...t : any[]) => any} mapFn
 * @param  {...Parser} parsers
 */
export const seq = (mapFn, ...parsers) => new MemoParser((subject) => {
  const out = []
  for (const p of parsers) {
    if (!p.parse) { console.warn('parser:', p, subject) }
    const res = p.parse(subject)
    if (!res.ok) { return res }
    out.push(res.node)
    subject = subject.update(res)
  }
  return subject.output(mapFn(...out))
})

export function test_seq_matches_a_sequence (expect) {
  const parser = seq((_, value) => value, lit('('), token('foo'), lit(')'))
  const tokens = [
    $t('structure', '('),
    $t('foo'),
    $t('structure', ')'),
  ]
  expect(parse(parser, tokens)).toEqual($t('foo'))
}

/**
 * matches if any of the parsers match.
 * outputs the output of the first parser that matches.
 * @param  {...Parser} parsers
 */
export const alt = (...parsers) => new MemoParser((subject) => {
  let errors = []
  for (const p of parsers) {
    const res = p.parse(subject)
    if (res.ok) { return res }
    errors.push(res.error)
  }
  return subject.error(['alts failed:', errors])
})

export function test_alt_matches_one_of_options (expect) {
  const parser = alt(token('foo'), token('bar'))
  expect(parse(parser, [$t('foo')])).toEqual($t('foo'))
  expect(parse(parser, [$t('bar')])).toEqual($t('bar'))
}

/**
 * matches parser repeatedly until it fails, runs out of input,
 * or it reaches its maximum number of matches.
 * outputs an array of each iteration's output.
 * @param {Parser} parser
 * @param {number} min minimum number of matches required
 * @param {number} max maximum number of matches before giving up
 */
export const repeat = (parser, min = 0, max = Infinity) => new MemoParser((subject) => {
  const out = []
  while (subject.index < subject.tokens.length && out.length < max) {
    const res = parser.parse(subject)
    if (!res.ok) { break }
    out.push(res.node)
    subject = subject.update(res)
  }
  if (out.length < min) {
    return subject.error(['not enough items', parser, min])
  }
  return subject.output(out)
})

export function test_repeat (expect) {
  const tokens = [
    $t('identifier', 'x'),
    $t('identifier', 'y'),
    $t('identifier', 'z'),
    $t('foo'),
  ]
  const parser = seq(x => x, repeat(seq(({ value }) => value, token('identifier'))), token('foo'))
  expect(parse(parser, tokens)).toEqual(['x', 'y', 'z'])
}

export const maybe = (parser) => seq(([x]) => x, repeat(parser, 0, 1))

/**
 * match a sequence of valueParser, separated by separatorParser,
 * e.g. a comma-separated list.
 * outputs an array of each valueParser's output.
 * @param {Parser} valueParser
 * @param {Parser} separatorParser
 * @param {number} min number of repetitions
 * @param {number} max
 */
export const sepBy = (valueParser, separatorParser, min, max) =>
  seq(
    (head, tail) => [head, ...tail],
    valueParser, repeat(seq(
      (_, value) => value,
      separatorParser, valueParser
    ), min, max))

export function test_sepBy (expect) {
  const tokens = [
    $t('identifier', 'x'),
    $t('bar'),
    $t('identifier', 'y'),
    $t('bar'),
    $t('identifier', 'z'),
  ]
  const parser = sepBy(
    seq(({ value }) => value, token('identifier')),
    token('bar')
  )
  expect(parse(parser, tokens)).toEqual(['x', 'y', 'z'])
}

/**
 * match if the parser fails; fail if it matches. Consumes no input.
 * @param {Parser} parser
 */
export const not = (parser) => new Parser((subject) =>
  parser.parse(subject).ok
    ? subject.error(['unexpected', parser])
    : subject.output(null))

/**
 * match if the parser succeeds, but do not consume input.
 * @param {Parser} parser
 */
export const peek = (parser) => new Parser((subject) =>
  parser.parse(subject).ok
    ? subject.output(null)
    : subject.error(['expected', parser]))

/**
 * get the current parser context without consuming input.
 */
export const readContext = new Parser((subject) =>
  subject.output(subject.context))

/**
 * Parse a stream of tokens, and return the output.
 * @param {Parser} parser
 * @param {Token[]} tokens
 * @param {*} context
 */
export function parse (parser, tokens, context) {
  const subject = new ParseSubject(tokens, 0, context)
  const res = parser.parse(subject)
  if (!res.ok) {
    throw new Error(res.error)
  }
  if (res.index !== tokens.length) {
    throw new Error('Leftover tokens')
  }
  return res.node
}
