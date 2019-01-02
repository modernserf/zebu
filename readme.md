# Little Language Lab

## What is this?

LLL is a JavaScript library for making parsers that are as convenient to use as regular expressions but as readable and powerful as parser generators. It is particularly well-suited for building [little languages](http://staff.um.edu.mt/afra1/seminar/little-languages.pdf) and [DSLs](https://en.wikipedia.org/wiki/Domain-specific_language).

## What does that look like?

Match a US phone number:

```js
const digits = (count) => repeat(/\d/, { min: count, max: count }).map((ds) => ds.join(""))
const phone = lang`
  Root      = ("+"? "1" _)? AreaCode (_ "-"? _) Exchange (_ "-"? _) Line
              ${(_, areaCode, __,  exchange, ___, line) => ({ areaCode, exchange, line })}
  AreaCode  = "(" _ ${digits(3)} _ ")" ${(_, __, digits) => digits}
            | ${digits(3)}
  Exchange  = ${digits(3)}
  Line      = ${digits(4)}
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

- **Regexes are designed to be compact, at the expense of all other features.** Character classes are typically represented with a single escaped letter (e.g. `\w`), which is quite terse but not particularly readable. Formatting with whitespace is not permitted, because whitespace matches _literal_ spaces. Regexes that match control characters (e.g. `(` or `+`) need additional escape characters. LLL requires you to quote strings and requires more explicit handling of character classes and matching, but it results in parsers that are much easier to read. 

- **Regexes are not composable.** Most regexes don't have named variables, nor do they let you build regexes out of smaller regexes. Some regexes allow you to name your capture groups, but nevertheless provide no way of composing capture results. LLL is designed for composability: you can define subexpressions within a parser and interpolate parsers into other parsers. You can even interpolate regexes into LLL parsers!

- **Regexes can't match arbitrary structures.** While most regexes are more expressive than the language theoretical definition of [regular languages](https://en.wikipedia.org/wiki/Regular_grammar), most are still unsuited for tasks like [parsing XML](https://stackoverflow.com/questions/1732348/regex-match-open-tags-except-xhtml-self-contained-tags) or balanced brackets. The tools LLL provides do not have these restrictions.







 parsing library that uses [tagged template strings](http://2ality.com/2016/11/computing-tag-functions.html) to define grammars. 







This is a library for building [little languages]
with [tagged template strings]
using a [PEG](https://en.m.wikipedia.org/wiki/Parsing_expression_grammar)-inspired syntax.



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

  
