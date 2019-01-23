const atSubject = ({ tokens, index }) => {
  const pre = tokens.slice(index - 3, index).join(' ')
  const post = tokens.slice(index + 1, index + 4).join(' ')
  const target = String(tokens[index] || '   ')
  return [
    '\n',
    pre, target, post, '\n',
    pre.replace(/./g, ' '), target.replace(/./g, '^'), post.replace(/./g, ' '),
  ]
}

// NOTE: stack traces are basically useless here, so not a "real" error
// This makes tests run dramatically faster
class TracedParserError {
  constructor (message, subject) {
    this.ownMessage = message
    this.subject = subject
  }
  get message () {
    return `${this.ownMessage}: ${atSubject(this.subject)}`
  }
}

class LeftoverTokensError extends TracedParserError {
  constructor (subject) {
    super(`Leftover tokens`, subject)
  }
}

class UnexpectedEndOfInputError extends TracedParserError {
  constructor (subject) {
    super(`Unexpected end of input`, subject)
  }
}

class TokenTypeError extends TracedParserError {
  constructor (type, subject) {
    super(`Expected ${atIndex(subject)} to have type ${type}`, subject)
  }
}

class TokenValueError extends TracedParserError {
  constructor (value, subject) {
    super(`Expected ${atIndex(subject)} to have value "${value}"`, subject)
  }
}

class NotAStructureError extends TracedParserError {
  constructor (subject) {
    super(`Expected a structure`, subject)
  }
}

class WrongStructureType extends TracedParserError {
  constructor (start, end, subject) {
    super(`Expected a structure wrapped with "${start}" & "${end}"`, subject)
  }
}

class AltsError {
  constructor (errors) {
    this.message = ['All failed: ', ...errors.map((err) => err && err.message)].join('\n')
  }
}

class NotEnoughItemsError extends TracedParserError {
  constructor (parser, min, subject) {
    super(`Expected at least ${min} items`, subject)
  }
}
/**
 * mock interface for token
 * @typedef {{type: string, value: any}} Token
 */
const $t = (type, value = null) => ({ type, value })

class ParseSubject {
  /**
   * @param {Token[]} tokens
   * @param {number} index
   */
  constructor (tokens, index) {
    this.tokens = tokens
    this.index = index
  }
}

class ParserOutput {
  /**
   * @param {any} node
   * @param {number} index
   */
  constructor (node, index) {
    this.ok = true
    this.node = node
    this.index = index
  }
}

const output = (node, index) => new ParserOutput(node, index)
const update = (subject, output) => new ParseSubject(subject.tokens, output.index)
const atIndex = (subject) => subject.tokens[subject.index]

class LazyParser {
  constructor (thunk) {
    this.thunk = thunk
    this.memo = null
  }
  parse (subject) {
    if (!this.memo) { this.memo = this.thunk() }
    return this.memo.parse(subject)
  }
}

export function test_LazyParser (expect) {
  const Expr = new LazyParser(() =>
    alt(
      seq((_, x) => x, lit('('), Expr, lit(')')),
      seq((_, x) => -x, lit('-'), Expr),
      token('number')
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

/**
 * consumes no input, always succeeds
 */
export const nil = { parse: ({ index }) => output(undefined, index) }

export function test_nil_matches_an_empty_sequence (expect) {
  expect(parse(nil, [])).toEqual(undefined)
  expect(() => {
    parse(nil, [$t('foo')])
  }).toThrow()
}

class TokenParser {
  constructor (type) {
    this.expected = type
  }
  parse (subject) {
    const token = atIndex(subject)
    if (!token) { return new UnexpectedEndOfInputError(subject) }
    if (token.type !== this.expected) {
      return new TokenTypeError(this.expected, subject)
    }
    return output(atIndex(subject).value, subject.index + 1)
  }
}

/**
 * matches if token.type === type.
 * @param {string} type
 */
export const token = (type) => new TokenParser(type)

export function test_token_matches_a_type (expect) {
  expect(parse(token('foo'), [{ type: 'foo', value: 1 }])).toEqual(1)
  expect(() => { parse(token('foo'), [{ type: 'bar' }]) }).toThrow()
}

class LiteralParser {
  constructor (value) {
    this.tokenValue = value
  }
  get expected () {
    return `"${this.tokenValue}"`
  }
  parse (subject) {
    const token = atIndex(subject)
    if (!token) { return new UnexpectedEndOfInputError(subject) }
    if (token.type === 'value') {
      return new TokenTypeError('line, identifier or operatror', subject)
    }
    if (token.value !== this.tokenValue) {
      return new TokenValueError(this.tokenValue, subject)
    }
    return output(atIndex(subject).value, subject.index + 1)
  }
}

/**
 * matches if token.value === string, and token is not itself a string.
 * @param {string} string
 */
export const lit = (value) => new LiteralParser(value)

export function test_lit_matches_values (expect) {
  const parser = lit('(')
  const tokens = [$t('structure', '(')]
  expect(parse(parser, tokens)).toEqual('(')
}

const QUOTE = Symbol('QUOTE')
const quote = (fn, values) => ({ [QUOTE]: () => unquote(fn)(...values.map(unquote)) })
const unquote = (x) => x && x[QUOTE] ? x[QUOTE]() : x

class SeqParser {
  constructor (mapFn, parsers) {
    this.mapFn = mapFn
    this.parsers = parsers
  }
  parse (subject) {
    const out = []
    for (const p of this.parsers) {
      if (!p.parse) { console.warn('not a parser:', p, subject) }
      const res = p.parse(subject)
      if (!res.ok) { return res }
      out.push(res.node)
      subject = update(subject, res)
    }
    return output(quote(this.mapFn, out), subject.index)
  }
}

/**
 * matches if each in a sequence of parsers matches.
 * outputs mapFn(subject, ...outputs).
 * @param {(...t : any[]) => any} mapFn
 * @param  {...Parser} parsers
 */
export const seq = (mapFn, ...parsers) => new SeqParser(mapFn, parsers)

export function test_seq_matches_a_sequence (expect) {
  const parser = seq((_, value) => value, lit('('), token('foo'), lit(')'))
  const tokens = [
    $t('structure', '('),
    $t('foo', 1),
    $t('structure', ')'),
  ]
  expect(parse(parser, tokens)).toEqual(1)
}

class AltParser {
  constructor (parsers) {
    this.parsers = parsers
  }
  parse (subject) {
    let errors = []
    for (const p of this.parsers) {
      if (!p.parse) { console.warn('not a parser', [p], 'end') }
      const res = p.parse(subject)
      if (res.ok) { return res }
      errors.push(res.error)
    }
    return new AltsError(errors)
  }
}

/**
 * matches if any of the parsers match.
 * outputs the output of the first parser that matches.
 * @param  {...Parser} parsers
 */
export const alt = (...parsers) =>
  parsers.length > 1 ? new AltParser(parsers) : parsers[0]

export function test_alt_matches_one_of_options (expect) {
  const parser = alt(token('foo'), token('bar'))
  expect(parse(parser, [$t('foo', 1)])).toEqual(1)
  expect(parse(parser, [$t('bar', 2)])).toEqual(2)
}

class RepeatParser {
  constructor (parser, min, max) {
    this.parser = parser
    this.min = min
    this.max = max
  }
  parse (subject) {
    const out = []
    while (subject.index < subject.tokens.length && out.length < this.max) {
      const res = this.parser.parse(subject)
      if (!res.ok) { break }
      out.push(res.node)
      subject = update(subject, res)
    }
    if (out.length < this.min) {
      return new NotEnoughItemsError(this.parser, this.min, subject)
    }
    return output(quote((...xs) => xs, out), subject.index)
  }
}

/**
 * matches parser repeatedly until it fails, runs out of input,
 * or it reaches its maximum number of matches.
 * outputs an array of each iteration's output.
 * @param {Parser} parser
 * @param {number} min minimum number of matches required
 * @param {number} max maximum number of matches before giving up
 */
export const repeat = (parser, min = 0, max = Infinity) => new RepeatParser(parser, min, max)

export function test_repeat (expect) {
  const tokens = [
    $t('identifier', 'x'),
    $t('identifier', 'y'),
    $t('identifier', 'z'),
    $t('foo'),
  ]
  const parser = seq(x => x, repeat(token('identifier')), token('foo'))
  expect(parse(parser, tokens)).toEqual(['x', 'y', 'z'])
}

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
      (_, x) => x,
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
    token('identifier'),
    token('bar')
  )
  expect(parse(parser, tokens)).toEqual(['x', 'y', 'z'])
}

const _2 = (_, x) => x
class WrappedWithParser {
  constructor (start, getContent, end, mapFn) {
    this.start = start
    this.content = new LazyParser(getContent)
    this.end = end
    this.mapFn = mapFn
  }
  parse (subject) {
    const token = atIndex(subject)
    if (!token) { return new UnexpectedEndOfInputError(subject) }
    if (token.type !== 'structure') { return new NotAStructureError(subject) }

    if (this.start === token.startToken && this.end === token.endToken) {
      const innerSubject = new ParseSubject(token.value, 0)
      const res = this.content.parse(innerSubject)
      if (!res.ok) { return res }
      if (res.index !== token.value.length) {
        return new LeftoverTokensError(innerSubject)
      }
      return output(res.node, subject.index + 1)
    }
    return new WrongStructureType(this.start, this.end, subject)
  }
}

export const wrappedWith = (left, getContent, right, mapFn = _2) =>
  new WrappedWithParser(left, getContent, right, mapFn)

export function test_wrappedWith (expect) {
  const tokens = [
    {
      type: 'structure',
      value: [$t('identifier', 'foo')],
      startToken: '(',
      endToken: ')',
    },
  ]
  const parser = wrappedWith(
    '(',
    () => token('identifier'),
    ')'
  )
  expect(parse(parser, tokens)).toEqual('foo')
}

const line = token('line')
export const padded = (parser) =>
  seq((_, x) => x, alt(line, nil), parser, alt(line, nil))

/**
 * Parse a stream of tokens, and return the output.
 * @param {Parser} parser
 * @param {Token[]} tokens
 */
export function parse (parser, tokens) {
  const subject = new ParseSubject(tokens, 0)
  const res = parser.parse(subject)
  if (!res.ok) {
    const err = new Error(res.message)
    err.name = res.constructor.name
    throw err
  }
  if (res.index !== tokens.length) {
    throw new LeftoverTokensError(subject)
  }
  return unquote(res.node)
}
