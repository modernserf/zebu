# Zebu

## What is this?

Zebu is a JavaScript library for building [little languages](http://staff.um.edu.mt/afra1/seminar/little-languages.pdf) with [tagged template literals](http://2ality.com/2016/11/computing-tag-functions.html).

## Why would I want to do that?

When we work with code, we don't just care about performance; we also care about human-centric concerns like convenience, elegance, and readability. In most cases, the human-centric concerns take priority: any time you have chosen to use a framework over "vanilla JS", or a high-level language over a low-level one, you have implicitly chosen developer experience over performance. Everyone has different thresholds for when to make this trade-off, but in general we recognize that the programer's time is more valuable than the computer's.

While most programmers are comfortable writing code for other programmers to use, whether that's via the open source ecosystem or just in your project's `utils.js` file, very few are comfortable designing or contributing to a programming language itself. Most programmers have opinions about programming languages, and may even have ideas for features they'd like in a programming language, but few even consider that they could make these ideas a reality. Implementing a programming language seems like it belongs to the category of software that's beyond the reach of ordinary programmers, alongside databases and operating systems.

Implementing a general-purpose, high-performance programming language is, indeed, a lot of work. But there is a huge spectrum of possibility between "library that is pleasant to use" and "industrial strengtth programming language". Many interesting and useful languages are (relatively) simple and are more like _features_ of a language than a language in and of themselves -- examples include regular expressions, DOM selectors and date format strings. (You may have invented a "little language" like this without even realizing it -- any function that takes a string and does something based on the contents of that string is, in some sense, an interpreter for a programming language.) These languages don't need to implement many of the features we take for granted in programming languages -- variables, functions, etc -- because all of that is already implemented by the "host" language; they can focus on doing a single specialized task using an appropriately specialized syntax.

Zebu is a toolkit for building these little languages that handles the boring and error-prone parts (ie. turning a string into structured data) so you can focus on providing a great developer experience.

## Can you go into more detail?

Zebu is a parser generator that broadly resembles tools like Yacc, Bison or ANTLR. It works with LL(k) grammars, though like ANTLR it can also handle direct left recursion. Like the aforementioned tools, but unlike PEG and parser combinator libraries, Zebu has separate lexing and parsing phases.

The major difference between Zebu and other parser generators is that Zebu uses the same lexer for all grammars:

- whitespace (including newlines) and JavaScript-styled comments (`//` and `/* */`) are ignored
- numbers, strings, and identifiers are tokenized with the same syntactic rules as JavaScript

In practice, this means that languages created with Zebu will necessarily have a strong family resemblance to JavaScript, and feel more like custom operators or macros than they feel like discrete languages. This means that Zebu is best for creating new languages, not implementing an already existing language.

## How do I use Zebu?

Zebu is a tool for building little languages with tagged template strings, and it is itself a little language used with tagged template strings. Here's an example grammar:

```javascript
import { lang } from 'zebu';

const jsonish = lang`
  Expr = #{ Pair ** "," : ${fromPairs} }
       | #[ Expr ** "," ]
       | "true"   : ${() => true}
       | "false"  : ${() => false}
       | "null"   : ${() => null}
       | value;
  Pair = value ":" Expr : ${(k, _, v) => ({ [k]: v })}; 
`;

assert.deepEqual(jsonish`{"foo": [123, "bar", true, false, null] }`, {
  foo: [123, 'bar', true, false, null],
});
```

Zebu grammars are composed from a list of rules, separated by semicolons.
