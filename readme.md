# Little Language Lab

## What is this?

This is a library for building [little languages](http://staff.um.edu.mt/afra1/seminar/little-languages.pdf)
with [tagged template strings](http://2ality.com/2016/11/computing-tag-functions.html)
using a [parsing expression grammar](https://en.m.wikipedia.org/wiki/Parsing_expression_grammar).

## What does that look like?

```js
import { lang } from "@modernserf/little-language-lab";

const leftAssociative = (l, rs) => rs.reduce((value, fn) => fn(value), l)
const math = lang`
  AddExpr = MulExpr AddOp*  ${leftAssociative}
  AddOp   = "+" MulExpr     ${(_, r) => (l) => l + r}
          | "-" MulExpr     ${(_, r) => (l) => l - r}
  MulExpr = Expr MulOp*     ${leftAssociative}
  MulOp   = "*" Expr        ${(_, r) => (l) => l * r}
          | "/" Expr        ${(_, r) => (l) => l / r}
  Expr    = "(" AddExpr ")" ${(_, value) => value}
          | "-" Expr        ${(_, value) => -value}
          | number          ${({ value }) => value}
`
math`(-3.5 + 4) * 200` // => 100
```

Another, slightly more complex example:

```js
import { lang } from "@modernserf/little-language-lab";

function interpreter (tokens) {
  const stack = []
  tokens.forEach(t => t(stack))
  return stack[0]
}

const op = (fn) => (stack) => {
  stack.push(fn(stack.pop(), stack.pop()))
}

const rpn = lang`
  Program = Expr * ${interpreter}
  Expr    = Number | Fn
  Number  = number ${({ value }) => (stack) => stack.push(value)}
  Fn      = "+" ${op((r, l) => l + r)}  # note: operands are in reverse order,
          | "-" ${op((r, l) => l - r)}  # because the right operand is popped 
          | "*" ${op((r, l) => l * r)}  # before the left one.
          | "/" ${op((r, l) => l / r)}
`
rpn`-3.5 4 + 200 *` // => 100
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

  
