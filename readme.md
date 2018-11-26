# Little Language Lab

## What is this?

This is a library for building [tagged template strings](http://2ality.com/2016/11/computing-tag-functions.html)
with a [parsing expression grammar](https://en.m.wikipedia.org/wiki/Parsing_expression_grammar).

## What does that look like?

```js
import { lang } from "@modernserf/tts";

const math = lang`
      AddExpr = MulExpr "+" AddExpr ${(left, _, right) => left + right}
              | MulExpr "-" AddExpr ${(left, _, right) => left - right}
              | MulExpr
      MulExpr = Expr "*" MulExpr ${(left, _, right) => left * right}
              | Expr "/" MulExpr ${(left, _, right) => left + right}
              | Expr
      Expr    = "(" AddExpr ")" ${(_, value) => value}
              | "-" Expr ${(value) => -value}
              | number    ${({ value }) => value}
    `
math`(-3.5 + 4) * 200`) // => 100

// RPN calculator
function interpreter (tokens) {
  const stack = []
  for (const t of tokens) {
    t(stack)
  }
  return stack[0]
}

const op = fn => stack => {
  const r = stack.pop()
  const l = stack.pop()
  stack.push(fn(l, r))
}

// TODO: use RPN as example of why you'd do your own tokenizing (to capture difference between `-1` and `- 1`)
// TODO: should this be built-in?

const rpn = lang`
  Program = Expr * ${interpreter}
  Expr    = Number | Fn
  Number  = "_"? number ${(neg, { value }) => stack => stack.push(neg ? -value : value)}
  Fn      = "+" ${op((l, r) => l + r)}
          | "-" ${op((l, r) => l - r)}
          | "*" ${op((l, r) => l * r)}
          | "/" ${op((l, r) => l / r)}
`
rpn`_3.5 4 + 200 *` // => 100
```

## Why would I want to do that?

Tagged template strings are a really powerful tool for building domain-specific languages,
but the tools for building languages in javascript tend to be built around the assumption that
your language is being defined at compile time, and few are designed to take advantage
of tagged template strings' interpolation abilities.

## References

[Programming Pearls: Little Languages](http://staff.um.edu.mt/afra1/seminar/little-languages.pdf)
