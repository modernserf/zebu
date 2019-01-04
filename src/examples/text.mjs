/*
A text parser, using the same basic syntax as `lang`, but for operating on arbitrary strings instead of code in tagged templates.

## Why is this better than the alternatives?

### Regexes

- **Regexes are designed to be compact, at the expense of all other features.** Character classes are typically represented with a single escaped letter (e.g. `\w`), which is quite terse but not particularly readable. Formatting with whitespace is not permitted, because whitespace matches _literal_ spaces. Regexes that match control characters (e.g. `(` or `+`) need additional escape characters. `text` requires you to quote strings and requires more explicit handling of character classes and matching, but it results in parsers that are much easier to read.

- **Regexes are not composable.** Most regexes don't have named variables, nor do they let you build regexes out of smaller regexes. Some regexes allow you to name your capture groups, but nevertheless provide no way of composing capture results. `text` is designed for composability: you can define subexpressions within a parser and interpolate parsers into other parsers. You can even interpolate regexes into `text` parsers!

- **Regexes can't match recursive structures.** While most regexes are more expressive than the language theoretical definition of [regular languages](https://en.wikipedia.org/wiki/Regular_grammar), most are still unsuited for tasks like [parsing XML](https://stackoverflow.com/questions/1732348/regex-match-open-tags-except-xhtml-self-contained-tags) or balanced brackets. The tools `text` provides do not have these restrictions.

### Parser generators

`text` grammars are modeled after the [BNF style](https://en.wikipedia.org/wiki/Backus%E2%80%93Naur_form) of notation, particularly the notation used by [PEG](https://en.m.wikipedia.org/wiki/Parsing_expression_grammar).

- **Parser generators typically require a separate compile step.** This is understandable for a file-based workflow, but adds a lot of friction for parsing strings within a JavaScript program.

- **Parser generators are not composable.** Just like regular expressions, most parser generators have no way of building parsers from other parsers.

### Parser combinators

LLL includes a set of parser combinators, and is itself implemented with parser combinators. However, we feel that the `text` syntax has some significant advantages over combinators alone.

- **Parser combinators can make some simple tasks difficult to express.** Left-associative infix operators and mutually recursive parsers are rather inelegant to express with parser combinators. `text` expressions don't have to map 1:1 onto parser combinators and thus avoid some of these difficulties.

- **Parser combinators can have low information density.** Parser combinators in languages like Haskell can use operators to streamline the most common expressions (e.g. alternation and sequences) but these must be expressed as function calls in JavaScript. This means that grammars often have more "plumbing" and punctuation than content.

*/

export function test_match_a_us_phone_number (expect) {
  const phone = text`
    Root      = ~("+"? "1" _)? AreaCode ~(_ "-"? _) Exchange ~(_ "-"? _) Line
                ${(areaCode, exchange, line) => ({ areaCode, exchange, line })}
    AreaCode  = ~("(" _) ${/\d{3}/} _ ")"
              | ${/\d{3}/}
    Exchange  = ${/\d{3}/}
    Line      = ${/\d{4}/}
    _         = %whitespace*
  `
  expect(phone.match('+1 (800) 555-1234'))
    .toEqual({ ok: true, value: { areaCode: '800', exchange: '555', line: '1234' } })

  expect(phone.get('AreaCode')).match('( 800 )')
    .toEqual({ ok: true, value: '800' })

  // compare to
  const phoneRE = /^\+1\s*(?:\((\d{3})\)|(\d{3}))\s*-?\s*(\d{3})\s*-?\s*(\d{4})$/
  expect([...phoneRE.exec('+1 (800) 555-1234')])
    .toEqual(['+1 (800) 555-1234', '800', null, '555', '1234'])
}

// Like regular expressions (and unlike `lang`), `text` can find multiple matches in a string.
export function test_find_multiple_results (expect) {
  const pattern = text`... ("fo" | "ba") %letter ...`
  expect([...pattern.matches('hi foo hello bar baz')])
    .toEqual([
      { value: 'foo', start: 3, end: 6 },
      { value: 'bar', start: 13, end: 16 },
      { value: 'baz', start: 17, end: 20 },
    ])
}
