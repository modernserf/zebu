const $t = (type, value = null) => ({ type, value })

const subject = (tokens) => ({ tokens, index: 0 })
const atEnd = (subject) => subject.tokens.length <= subject.index
const atIndex = (subject) => subject.tokens[subject.index]
const update = (subject, result) => ({ tokens: subject.tokens, index: result.index })

const output = (value, index) => ({ type: 'output', value, index })
const error = (value, index) => ({ type: 'error', value, index })

const end = {
  * parseAll (subject) {
    if (atEnd(subject)) {
      yield output(null, subject.index)
    } else {
      yield error('expected eof')
    }
  },
}

class MatchParser {
  constructor (matcher, error) {
    this.matcher = matcher
    this.error = error
  }
  * parseAll (subject) {
    if (atEnd(subject)) {
      yield error('unexpected eof', subject.index)
    }
    const token = atIndex(subject)
    if (this.matcher(token)) {
      yield output(token, subject.index + 1)
    } else {
      yield error(this.error, subject.index)
    }
  }
}
const tok = (type) =>
  new MatchParser((x) => x.type === type, `expected type "${type}"`)
const lit = (value) =>
  new MatchParser((x) => x.value === value, `expected value "${value}`)

class AltParser {
  constructor (alts) {
    this.alts = alts
  }
  * parseAll (subject) {
    const queue = this.alts.map((alt) => alt.parseAll(subject))

    while (queue.length) {
      const gen = queue.shift()
      const { value, done } = gen.next()
      if (value) { yield value }
      if (!done) { queue.push(gen) }
    }
  }
}
const alt = (...xs) => new AltParser(xs)

class SeqParser {
  constructor (mapFn, parsers) {
    this.mapFn = mapFn
    this.parsers = parsers
  }
  * parseOne (parserIndex, subject, outs) {
    const parser = this.parsers[parserIndex]
    if (!parser) {
      const mappedOutput = this.mapFn(...outs.map(o => o.value))
      yield output(mappedOutput, subject.index)
      return
    }
    for (const result of parser.parseAll(subject)) {
      if (result.type !== 'output') {
        yield result
        continue
      }
      yield * this.parseOne(
        parserIndex + 1,
        update(subject, result),
        outs.concat([result])
      )
    }
  }
  * parseAll (subject) {
    yield * this.parseOne(0, subject, [])
  }
}
const seq = (fn, ...xs) => new SeqParser(fn, xs)

class LazyParser {
  constructor (fn) {
    this.fn = fn
    this.memo = null
  }
  * parseAll (subject) {
    if (!this.memo) { this.memo = this.fn() }
    yield * this.memo.parseAll(subject)
  }
}

function parse (parser, tokens) {
  let count = 0
  const parseToEnd = seq((x) => x, parser, end)

  for (const result of parseToEnd.parseAll(subject(tokens))) {
    if (result.type === 'output') {
      return result.value
    }
    count++
    if (count > 100) { throw new Error('too many results') }
  }
  throw new Error('no match')
}

export function test_gll_left_recursion (expect) {
  const tokens = [
    $t('number', 1),
    $t('identifier', '+'),
    $t('number', 2),
    $t('identifier', '-'),
    $t('number', 3),
    $t('eof'),
  ]
  const num = seq((x) => x.value, tok('number'))

  const add = new LazyParser(() => alt(
    num,
    seq(
      (l, _, r) => l + r,
      add, lit('+'), num
    ),
    seq(
      (l, _, r) => l - r,
      add, lit('-'), num
    )
  ))

  const parser = seq(
    (x) => x, add, tok('eof')
  )
  expect(parse(parser, tokens)).toEqual(1 + 2 - 3)
}
