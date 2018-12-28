/**
 * @typedef {(p: ParseSubject) => ParserOutput | ParserError} parseFn
 */

/**
 * mock interface for token (see tokenizer.js)
 * @typedef {{type: string, value: any, meta: object}} Token
 */
const $t = (type, value = null, meta = {}) => ({ type, value, meta })

export class ParseSubject {
  /**
   * @param {Token[]} tokens
   * @param {number} index
   */
  constructor (tokens, index) {
    this.tokens = tokens
    this.index = index
  }
}

const output = (node, index) => new ParserOutput(node, index)
const error = (err, index) => new ParserError(err, index)
const update = (subject, output) => new ParseSubject(subject.tokens, output.index)
const atIndex = (subject) => subject.tokens[subject.index]

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

export class ParserOutput {
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

export class ParserError {
  constructor (error, index) {
    this.ok = false
    this.error = error
    this.index = index
  }
}

/**
 * consumes no input, always succeeds
 */
export const nil = new Parser(({ index }) => output(null, index))

export function test_nil_matches_an_empty_sequence (expect) {
  expect(parse(nil, [])).toEqual(null)
  expect(() => {
    parse(nil, [$t('foo')])
  }).toThrow()
}

/**
 * matches the end of input.
 */
export const end = new Parser((subject) =>
  subject.index === subject.tokens.length ? output(null, subject.index) : error('not at end', subject.index))

/**
 * matches if matchFn(token) returns true.
 * @param {(t: Token) => boolean} matchFn
 * @param {any} error
 */
export const matchToken = (matchFn, err = 'did not match') => new Parser((subject) => {
  const token = atIndex(subject)
  if (!token) { return error('unexpected end of input', subject.index) }
  return matchFn(token)
    ? output(atIndex(subject), subject.index + 1)
    : error(err, subject.index)
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
 * matches if token.value === string, and token is not itself a string.
 * @param {string} string
 */
export const lit = (string) => matchToken(
  tok => tok.value === string && tok.type !== 'string',
  ['did not match value', lit])

export function test_lit_matches_values (expect) {
  const parser = lit('(')
  const tokens = [$t('structure', '(')]
  expect(parse(parser, tokens)).toEqual($t('structure', '('))
}

/**
 * matches if token.value has truthy-valued props with these names.
 * @param  {...string} methods
 */
export const hasProps = (...methods) =>
  matchToken((tok) => tok.value && methods.every((m) => tok.value[m]))

export function test_hasProps_matches_objects (expect) {
  const parser = hasProps('foo')
  const tokens = [$t('structure', { foo: 1 })]
  expect(parse(parser, tokens)).toEqual($t('structure', { foo: 1 }))
}

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

const QUOTE = Symbol('QUOTE')
const quote = (fn, values) => ({ [QUOTE]: () => unquote(fn)(...values.map(unquote)) })
const unquote = (x) => x && x[QUOTE] ? x[QUOTE]() : x

export const CUT = Symbol('CUT')

const DROP = Symbol('DROP')
/**
 * matches if each in a sequence of parsers matches.
 * outputs mapFn(subject, ...outputs).
 * @param {(...t : any[]) => any} mapFn
 * @param  {...Parser} parsers
 */
export const seq = (mapFn, ...parsers) => new Parser((subject) => {
  const out = []
  let didCut = false
  for (const p of parsers) {
    if (p === CUT) {
      didCut = true
      continue
    }
    if (!p.parse) { console.warn('not a parser:', p, subject) }
    const res = p.parse(subject)
    if (!res.ok) {
      if (didCut) { throw new Error(res.error) }
      return res
    }
    if (res.node !== DROP) {
      out.push(res.node)
    }
    subject = update(subject, res)
  }
  return output(quote(mapFn, out), subject.index)
})

export const drop = (parser) => new Parser((subject) => {
  const res = parser.parse(subject)
  if (!res.ok) { return res }
  subject = update(subject, res)
  return output(DROP, subject.index)
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
export const alt = (...parsers) => new Parser((subject) => {
  let errors = []
  for (const p of parsers) {
    const res = p.parse(subject)
    if (res.ok) { return res }
    errors.push(res.error)
  }
  return error(['alts failed:', errors], subject.index)
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
export const repeat = (parser, min = 0, max = Infinity) => new Parser((subject) => {
  const out = []
  while (subject.index < subject.tokens.length && out.length < max) {
    const res = parser.parse(subject)
    if (!res.ok) { break }
    out.push(res.node)
    subject = update(subject, res)
  }
  if (out.length < min) {
    return error(['not enough items', parser, min], subject.index)
  }
  return output(quote((...xs) => xs, out), subject.index)
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

export const wrappedWith = (left, content, right) => alt(
  seq((x) => x, drop(left), content, CUT, drop(right)),
  // seq((x) => x, peek(right), CUT, not(right)),
)

export function test_wrappedWith (expect) {
  const tokens = [
    $t('token', '('),
    $t('identifier', 'foo'),
    $t('token', ')'),
  ]
  const parser = seq(
    ({ value }) => value,
    wrappedWith(
      lit('('),
      token('identifier'),
      lit(')')
    )
  )
  expect(parse(parser, tokens)).toEqual('foo')
}

/**
 * match if the parser fails; fail if it matches. Consumes no input.
 * @param {Parser} parser
 */
export const not = (parser) => new Parser((subject) =>
  parser.parse(subject).ok
    ? error(['unexpected', parser], subject.index)
    : output(DROP, subject.index))

/**
 * match if the parser succeeds, but do not consume input.
 * @param {Parser} parser
 */
export const peek = (parser) => new Parser((subject) =>
  parser.parse(subject).ok
    ? output(DROP, subject.index)
    : error(['expected', parser], subject.index))

// A = A B | C -> A = C B*
const list = (...xs) => xs
export const left = (mapFn, baseCase, ...iterCases) =>
  seq(
    (base, iters) => iters.reduce((acc, xs) => mapFn(acc, ...xs), base),
    baseCase, repeat(seq(list, ...iterCases))
  )

export const right = (getParser) => {
  const p = Parser.lazy(() => getParser(p))
  return p
}

export function test_left_recursion (expect) {
  const tokens = [
    $t('number', 1),
    $t('identifier', '/'),
    $t('number', 2),
    $t('identifier', '/'),
    $t('number', 3),
  ]
  const num = seq(({ value }) => value, token('number'))
  const parser = left(
    (left, _, right) => left / right,
    num, lit('/'), num,
  )
  expect(parse(parser, tokens)).toEqual(1 / 2 / 3)
}

/**
 * Parse a stream of tokens, and return the output.
 * @param {Parser} parser
 * @param {Token[]} tokens
 */
export function parse (parser, tokens) {
  const subject = new ParseSubject(tokens, 0)
  const res = parser.parse(subject)
  if (!res.ok) {
    throw new Error(res.error)
  }
  if (res.index !== tokens.length) {
    throw new LeftoverTokensError(tokens.slice(res.index))
  }
  return unquote(res.node)
}

class LeftoverTokensError extends Error {}
