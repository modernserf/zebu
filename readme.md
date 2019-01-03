# Little Language Lab

## What is this?

LLL is a JavaScript library for making parsers that are as convenient to use as regular expressions but as readable and powerful as parser generators. It is particularly well-suited for building [little languages](http://staff.um.edu.mt/afra1/seminar/little-languages.pdf) and [DSLs](https://en.wikipedia.org/wiki/Domain-specific_language).

## What does that look like?

Match a US phone number:

```js
const join = (...values) => values.join("")
const phone = lang`
  Root      = ~("+"? "1" _)? AreaCode ~(_ "-"? _) Exchange ~(_ "-"? _) Line
              ${(areaCode, exchange, line) => ({ areaCode, exchange, line })}
  AreaCode  = "(" _ (D D D ${join}) _ ")" ${(_, __, digits) => digits}
            | D D D   ${join}
  Exchange  = D D D   ${join}
  Line      = D D D D ${join}
  D         = %digit
  _         = %whitespace*
`
phone.match("+1 (800) 555-1234") 
// { ok: true, value: { areaCode: "800", exchange: "555", line: "1234" } }
```

Versus with regular expressions:
```js
const phone = /^\+1\s*(?:\((\d{3})\)|(\d{3}))\s*-?\s*(\d{3})\s*-?\s*(\d{4})$/
phone.exec("+1 (800) 555-1234")
// ["+1 (800) 555-1234", "800", null, 555, 1234]
```

## Why is this better than the alternatives?

### Regexes

LLL can use regular expressions in grammars

- **Regexes are designed to be compact, at the expense of all other features.** Character classes are typically represented with a single escaped letter (e.g. `\w`), which is quite terse but not particularly readable. Formatting with whitespace is not permitted, because whitespace matches _literal_ spaces. Regexes that match control characters (e.g. `(` or `+`) need additional escape characters. LLL requires you to quote strings and requires more explicit handling of character classes and matching, but it results in parsers that are much easier to read. 

- **Regexes are not composable.** Most regexes don't have named variables, nor do they let you build regexes out of smaller regexes. Some regexes allow you to name your capture groups, but nevertheless provide no way of composing capture results. LLL is designed for composability: you can define subexpressions within a parser and interpolate parsers into other parsers. You can even interpolate regexes into LLL parsers!

- **Regexes can't match recursive structures.** While most regexes are more expressive than the language theoretical definition of [regular languages](https://en.wikipedia.org/wiki/Regular_grammar), most are still unsuited for tasks like [parsing XML](https://stackoverflow.com/questions/1732348/regex-match-open-tags-except-xhtml-self-contained-tags) or balanced brackets. The tools LLL provides do not have these restrictions.

### Parser generators

LLL grammars are modeled after the [BNF style](https://en.wikipedia.org/wiki/Backus%E2%80%93Naur_form) of notation, particularly the notation used by [PEG](https://en.m.wikipedia.org/wiki/Parsing_expression_grammar). 

- **Parser generators typically require a separate compile step.** This is understandable for a file-based workflow, but adds a lot of friction for parsing strings within a JavaScript program.

- **Parser generators are not composable.** Just like regular expressions, most parser generators have no way of building parsers from other parsers.

### Parser combinators

LLL includes a set of parser combinators, and is itself implemented with parser combinators. However, we feel that the LLL syntax has some significant advantages over combinators alone.

- **Parser combinators can make some simple tasks difficult to express.** Left-associative infix operators and mutually recursive parsers are rather inelegant to express with parser combinators. LLL expressions don't have to map 1:1 onto parser combinators and thus avoid some of these difficulties.

- **Parser combinators can have low information density.** Parser combinators in languages like Haskell can use operators to streamline the most common expressions (e.g. alternation and sequences) but these must be expressed as function calls in JavaScript. This means that grammars often have more "plumbing" and punctuation than content.

## Unusual or unique features

LLL grammars are defined with [tagged template strings](http://2ality.com/2016/11/computing-tag-functions.html), which allow you to compose grammars by interpolating strings, regular expressions, parser combinators, or other LLL grammars.

The parsers created by LLL grammars can _themselves_ be used as tagged template strings. This is particularly useful for creating domain-specific languages.

LLL always tokenizes its input before parsing it; the token rules are generated from the grammar. 


```js
import { lang } from "@modernserf/little-language-lab";

const math = lang`
  AddExpr   = < . "+" MulExpr > ${(l, _, r) => l + r}
            | < . "-" MulExpr > ${(l, _, r) => l - r}
            | MulExpr
  MulExpr   = < . "*" NegExpr > ${(l, _, r) => l * r}
            | < . "/" NegExpr > ${(l, _, r) => l / r}
            | NegExpr
  NegExpr   = "-" BaseExpr      ${(_, x) => -x}
            | BaseExpr
  BaseExpr  = ["(" AddExpr ")"]
            | %number
`
math`(-3.5 + 4) * 200` // => 100
```



## Why would I want to do that?

Tagged template strings are a really powerful tool for building domain-specific languages,
but the tools for building languages in javascript tend to be built around the assumption that
your language is being defined at compile time, and few are designed to take advantage
of tagged template strings' interpolation abilities.



goals:
- possible to completely define a lexer + parser + interepreter in a single expression
- composable -- parsers can be built out of other parsers; handling for piping output of one into another
- good defaults for common structures with built-in error handling


four phases:
- tokenize: [char] -> tag(value)
- skeletonize: [token] -> [token] | tag(skeleton)
- parse: [skeleton] -> value | tag([ast])
- compile: ast -> value

`[ Start Content End ]`
- tokenizer: 
  + creates tokens for Start & End; error if they cannot be tokenized
  + pairs them, so Start must only be used as start, End only as end, must go together; error if theyre used otherwise
- skeletonizer:
  + recursively collect tokens between start & end into a single token, e.g. `[ "{" Expr "}" ]` becomes `{ type: "structure", start: startToken end: endToken, content: [...expr tokens...] }`
  + raise errors if start/end are mismatched
- parser:
  + match if the start & end tokens match, and content tokens match recursively

  
