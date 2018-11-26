import {
  createTokenizer,
  token,
  lit,
  alt,
  seq,
  lazyTree,
  parse,
  tokenize,
  defaultTokens,
  rootParser,
  lang
} from './index'
const tape = require('tape')

let test = tape
let expect

function describe (desc, fn) {
  test(desc, (t) => {
    const outerTest = test
    test = t.test
    fn(t)
    test = outerTest
    t.end()
  })
}

describe.skip = () => {}

function it (desc, fn) {
  test(desc, (t) => {
    expect = (value) => ({ toEqual: (compare) => t.deepEquals(value, compare) })
    fn(t)
    t.end()
  })
}

it.skip = () => {}

it('smoke tests', () => {
  expect(true).toEqual(true)
})

describe('tokenizer', () => {
  it('tokenizes a text', () => {
    const tokenize = createTokenizer({
      number: { pattern: /[0-9]+(?:\.[0-9]+)?/, format: Number },
      whitespace: { pattern: /\n|\s/, ignore: true },
      token: { pattern: /[-+*/()]/ }
    })
    const text = '(-3.1 + 4) * 200'
    const tokens = [...tokenize(text)]
    expect(tokens).toEqual([
      { type: 'token', value: '(' },
      { type: 'token', value: '-' },
      { type: 'number', value: 3.1 },
      { type: 'token', value: '+' },
      { type: 'number', value: 4 },
      { type: 'token', value: ')' },
      { type: 'token', value: '*' },
      { type: 'number', value: 200 }
    ])
  })
})

describe('parser', () => {
  it('parses a seq', () => {
    const _2 = (_, value) => value
    const grammar = seq(_2, lit('('), token('number'), lit(')'))
    const tokens = [
      { type: 'token', value: '(' },
      { type: 'number', value: 3.1 },
      { type: 'token', value: ')' }
    ]
    expect(parse(grammar, tokens)).toEqual({
      type: 'number',
      value: 3.1
    })
  })

  it('parses an alt', () => {
    const _2 = (_, value) => value
    const prefix = type => (_, value) => ({ type, value })
    const grammar = alt(
      seq(_2, lit('('), token('number'), lit(')')),
      seq(prefix('Neg'), lit('-'), token('number')),
      token('number')
    )
    const t1 = [
      { type: 'token', value: '(' },
      { type: 'number', value: 3.1 },
      { type: 'token', value: ')' }
    ]
    expect(parse(grammar, t1)).toEqual({
      type: 'number',
      value: 3.1
    })

    const t2 = [{ type: 'token', value: '-' }, { type: 'number', value: 4 }]
    expect(parse(grammar, t2)).toEqual({
      type: 'Neg',
      value: { type: 'number', value: 4 }
    })

    const t3 = [{ type: 'number', value: 5 }]
    expect(parse(grammar, t3)).toEqual({ type: 'number', value: 5 })
  })

  it('parses a recursive grammar', () => {
    const _2 = (_, value) => value
    const prefix = type => (_, value) => ({ type, value })
    const grammar = lazyTree({
      Expr: p =>
        alt(
          seq(_2, lit('('), p.Expr, lit(')')),
          seq(prefix('Neg'), lit('-'), p.Expr),
          token('number')
        )
    })
    // -(-(123))
    const tokens = [
      { type: 'token', value: '-' },
      { type: 'token', value: '(' },
      { type: 'token', value: '-' },
      { type: 'token', value: '(' },
      { type: 'number', value: 123 },
      { type: 'token', value: ')' },
      { type: 'token', value: ')' }
    ]
    expect(parse(grammar.Expr, tokens)).toEqual({
      type: 'Neg',
      value: {
        type: 'Neg',
        value: { type: 'number', value: 123 }
      }
    })
  })

  it('parses a stream of tokens', () => {
    const op = type => (left, _, right) => ({ type, left, right })
    const prefix = type => (_, value) => ({ type, value })
    const _2 = (_, value) => value
    const grammar = lazyTree({
      AddExpr: p =>
        alt(
          seq(op('Add'), p.MultExpr, lit('+'), p.AddExpr),
          seq(op('Sub'), p.MultExpr, lit('-'), p.AddExpr),
          p.MultExpr
        ),
      MultExpr: p =>
        alt(
          seq(op('Mul'), p.Expr, lit('*'), p.MultExpr),
          seq(op('Div'), p.Expr, lit('/'), p.MultExpr),
          p.Expr
        ),
      Expr: p =>
        alt(
          seq(_2, lit('('), p.AddExpr, lit(')')),
          seq(prefix('Neg'), lit('-'), p.Expr),
          token('number')
        )
    })
    const tokens = [
      { type: 'token', value: '(' },
      { type: 'token', value: '-' },
      { type: 'number', value: 3.1 },
      { type: 'token', value: '+' },
      { type: 'number', value: 4 },
      { type: 'token', value: ')' },
      { type: 'token', value: '*' },
      { type: 'number', value: 200 }
    ]
    // (-3.1 + 4) * 200
    expect(parse(grammar.AddExpr, tokens)).toEqual({
      type: 'Mul',
      left: {
        type: 'Add',
        left: {
          type: 'Neg',
          value: { type: 'number', value: 3.1 }
        },
        right: { type: 'number', value: 4 }
      },
      right: { type: 'number', value: 200 }
    })
  })
})

describe('root grammar', () => {
  it('tokenizes', () => {
    const neg = (_, value) => ({ type: 'Neg', value })
    const _2 = (_, value) => value
    const tokens = tokenize(
      createTokenizer(defaultTokens)
    )`
      Expr = "(" Expr ")" ${_2}
           | "-" Expr ${neg}
           | number`
    expect([...tokens]).toEqual([
      { type: 'identifier', value: 'Expr' },
      { type: 'token', value: '=' },
      { type: 'string', value: '(' },
      { type: 'identifier', value: 'Expr' },
      { type: 'string', value: ')' },
      { type: 'function', value: _2, interpolated: true },
      { type: 'token', value: '|' },
      { type: 'string', value: '-' },
      { type: 'identifier', value: 'Expr' },
      { type: 'function', value: neg, interpolated: true },
      { type: 'token', value: '|' },
      { type: 'identifier', value: 'number' }
    ])
  })

  it('parses', () => {
    const neg = (_, value) => ({ type: 'Neg', value })
    const _2 = (_, value) => value
    const tokens = [
      { type: 'identifier', value: 'Expr' },
      { type: 'token', value: '=' },
      { type: 'string', value: '(' },
      { type: 'identifier', value: 'Expr' },
      { type: 'string', value: ')' },
      { type: 'function', value: _2 },
      { type: 'token', value: '|' },
      { type: 'string', value: '-' },
      { type: 'identifier', value: 'Expr' },
      { type: 'function', value: neg },
      { type: 'token', value: '|' },
      { type: 'identifier', value: 'number' }
    ]
    const childGrammar = parse(rootParser.Program, tokens)
    const childTokens = [
      { type: 'token', value: '-' },
      { type: 'token', value: '(' },
      { type: 'token', value: '-' },
      { type: 'token', value: '(' },
      { type: 'number', value: 123 },
      { type: 'token', value: ')' },
      { type: 'token', value: ')' }
    ]
    expect(parse(childGrammar, childTokens)).toEqual({
      type: 'Neg',
      value: {
        type: 'Neg',
        value: { type: 'number', value: 123 }
      }
    })
  })
})

describe('createLanguage', () => {
  it('creates a tiny tts', () => {
    const math = lang`
      Expr = "(" Expr ")" ${(_, value) => value}
           | "-" Expr     ${(_, value) => -value}
           | number       ${({ value }) => value}
    `
    expect(math`-(-(123))`).toEqual(123)
  })
  it('creates a tts that compiles', () => {
    const math = lang`
      AddExpr = MulExpr "+" AddExpr ${(left, _, right) => left + right}
              | MulExpr "-" AddExpr ${(left, _, right) => left - right}
              | MulExpr
      MulExpr = Expr "*" MulExpr ${(left, _, right) => left * right}
              | Expr "/" MulExpr ${(left, _, right) => left / right}
              | Expr
      Expr    = "(" AddExpr ")" ${(_, value) => value}
              | "-" Expr        ${(_, value) => -value}
              | number          ${({ value }) => value}
    `
    expect(math`(-3.1 + 4) * 200`).toEqual((-3.1 + 4) * 200)
  })

  it('throws on left recursion', (t) => {
    t.throws(() => {
      lang`FooExpr = FooExpr "*" ${(x) => x} | number`
    })
  })

  it('does not throw on right recursion', (t) => {
    t.doesNotThrow(() => {
      lang`Expr = "-" Expr ${(x) => x} | number`
    })
  })
})
