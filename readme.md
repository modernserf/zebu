# Zebu

## What is this?

Zebu is a JavaScript library for building [little languages](http://staff.um.edu.mt/afra1/seminar/little-languages.pdf) with [tagged template literals](http://2ality.com/2016/11/computing-tag-functions.html).

## Why would I want to do that?

When we work with code, we don't just care about performance; we also care about human-centric concerns like convenience, elegance, and readability. In most cases, the human-centric concerns take priority: any time you have chosen to use a framework over "vanilla JS", or a high-level language over a low-level one, you have implicitly chosen developer experience over performance. Everyone has different thresholds for when to make this trade-off, but in general we recognize that the programer's time is more valuable than the computer's.

While most programmers are comfortable writing code for other programmers to use, whether that's via the open source ecosystem or just in your project's `utils.js` file, very few are comfortable designing or contributing to a programming language itself. Most programmers have opinions about programming languages, and may even have ideas for features they'd like in a programming language, but few even consider that they could make these ideas a reality. Implementing a programming language seems like it belongs to the category of software that's beyond the reach of ordinary programmers, alongside databases and operating systems.

Implementing a general-purpose, high-performance programming language is, indeed, a lot of work. But there is a huge spectrum of possibility between "library that is pleasant to use" and "industrial strengtth programming language". Many interesting and useful languages are (relatively) simple and are more like _features_ of a language than a language in and of themselves -- examples include regular expressions, DOM selectors and date format strings. (You may have invented a "little language" like this without even realizing it -- any function that takes a string and does something based on the contents of that string is, in some sense, an interpreter for a programming language.) These languages don't need to implement many of the features we take for granted in programming languages -- variables, functions, etc -- because all of that is already implemented by the "host" language; they can focus on doing a single specialized task using an appropriately specialized syntax.

Zebu is a toolkit for building these little languages that handles the boring and error-prone parts (ie. turning a string into structured data) so you can focus on providing a great developer experience.

## How is Zebu different from similar tools?

Zebu is a parser generator that broadly resembles tools like Yacc, Bison or ANTLR. It works with LL(k) grammars, though like ANTLR it can also handle direct left recursion. Like the aforementioned tools, but unlike PEG and parser combinator libraries, Zebu has separate lexing and parsing phases.

The major difference between Zebu and other parser generators is that Zebu applies the principle of "convention over configuration" to parsing. Specifically, all languagees created with Zebu use these lexing rules:

- whitespace (including newlines) and JavaScript-styled comments (`//` and `/* */`) are ignored
- numbers, strings, and identifiers are tokenized with the same syntactic rules as JavaScript

In other words: Zebu is not a general-purpose parser generator; languages created with Zebu will necessarily have a strong family resemblance to JavaScript, even if they are structured very differently. However, we believe what you give up in terms of expressivity are more than made up for by improved developer and user experience -- so many irrelevant but potentially confusing differences can be avoided completely,

## How does Zebu work?

Let's walk through a simple example first, to cover the core principles, and then we can get to more useful examples. Here's how you create a language:

```js
import { lang } from 'zebu';

const add = lang`
  Expr = Expr "+" value : ${(left, _, right) => left + right}
       | value;
`;
```

And then you use the lanugage like this:

```js
const result = add`1 + ${2} + 3`;
console.log(result); // 6
```

So what is actually happening here? `lang` is a function being used as a tagged template literal.

```js
lang`
  Expr = Expr "+" value : ${(left, _, right) => left + right}
       | value;
`;
// is equivalent to
lang(
  ['\n  Expr = Expr "+" value : ', '\n       | value;\n'],
  (left, _, right) => left + right
);
`
```

Likewise:

```js
add`1 + ${2} + 3`;
// is equivalent to
add(['1 + ', ' + 3'], 2);
```

### Tokenizing

Now, what is happening inside `add`? (We'll cover what's happening in `lang` in the next section.) First, the strings and interpolations passed into `add` are turned into an array of tokens. This process interleaves the strings and interpolations back together, and strips out any whitespace or comments:

```js
[
  { type: 'value', value: 1 },
  { type: 'literal', value: '+' },
  { type: 'value', value: 2 },
  { type: 'literal', value: '+' },
  { type: 'value', value: 3 },
];
```

- `value` - Numbers (decimal, hexidecimal, octal or binary), quoted strings (single or double quote), and interpolated values (of any type) are wrapped in `value` tokens.
- `literal` - Values that are explicitly enumerated in the definition of a language will be wrapped in `literal` tokens. For example, the definition of `add` includes a `"+"`, so `+` is matched as a `literal` token. These are typically be used for keywords, operators, or other 'punctuation' in programming languages.
- `identifier` - Values that match the identifier rules for JavaScript, and which are _not_ explicitly enumerated in the language's definition, are matched as `identifier` tokens.

Any text that is not ignored as whitespace or comments and does not match any of the above token types will throw an error. For example, in `` add`1 - 2` ``, `"-"` is not in `add`'s definition and therefore is not identified as a literal, so this will throw.

### Parsing

Now that we've converted the input into tokens, let's match the tokens to the grammar in our language definition. Let's look at that again:

```js
lang`
  Expr = Expr "+" value : ${(left, _, right) => left + right}
       | value;
`;
```

In this grammar, we have a single _rule_, labelled `Expr`; more complex grammars can have many rules, separated by semicolons. The `Expr` rule has two branches, separated by the `|` operator. The first branch matches a sequence -- first, it recursively matches itself, then it matches the token `{ type: 'literal', value: '+' }`, and then it matches any token of the type `value`. The results of each of these are passed into the function to the right, the result of which becomes the overall result of the expression. The second branch matches a single `value` token, and the result is the value in that token.

When we apply this grammar to `` add`1 + ${2} + 3` ``, it parses as:

<!-- NOTE: this sorta implies that we're doing bottom-up parsing; does that matter? -->

```
1     +   2     +    3
value                       : 1
Expr  "+" value             : 1 + 2
Expr            "+"  value  : (1 + 2) + 3
```

And returns the result `6`.

Unlike in regular expressions, parsing must match the whole input; `` add`1 +` `` or `` add` + 2` `` would both fail, as would `` add`1 + + 2 3` ``.

## A more complicated example

TODO: something with a couple of rules, more language features, notes on technique (e.g. precedence climbing)

### Operator grammars

TODO

### Tag helper

## Zebu language reference

### Literals

A quoted string in a Zebu grammar matches the value of that string and returns that value.

```js
const lit = lang`Main = "foo"`;

equal(lit`foo`, 'foo');

throws(() => lit`bar`);
throws(() => lit`"foo"`);
```

### Rules

Zebu grammars are composed from a list of rules, separated by semicolons. Rules do not have to be defined in any particular order (a rule can reference rules either above or below it), but the top rule is the rule for the whole grammar.

Identifiers in a grammar will match the rule with that name. Zebu will raise an error if there is no rule by that name.

```js
const math = lang`
  Neg   = "-" Expr : ${(_, value) => -value}
        | Expr;
  Expr  = #( Neg )
        | value;
`;

equal(math`123`, 123);
equal(math`-123`, -123);
equal(math`(123)`, 123);
equal(math`-(-(123))`, 123);
```

### `value`

The `value` keyword matches a number, a quoted string, or an interpolation, and returns that value.

```js
const val = lang`Main = value`;

equal(val`"hello, world!"`, 'hello, world!');
equal(val`'string with \'escaped quotes\''`, "string with 'escaped quotes'");
equal(val`-123.45e6`, -123.45e6);
equal(val`0xDEADBEEF`, 0xdeadbeef);

equal(val`${1}`, 1);
equal(val`${'hello, world!'}`, 'hello, world!');
const object = {};
equal(val`${object}`, object);

equal(val`"foo${'bar'}baz"`, 'foobarbaz');
```

### `identifier`

The `identifier` keyword matches a JavaScript identifier which is not used as a literal in the grammar, and returns that value.

```js
const id = lang`
  Main = identifier;
  Reserved = "class" | "function" | "if" | "else";
`;

equal(id`foo`, 'foo');
equal(id`$bar`, 'bar');
equal(id`_0`, '_0');

throws(() => id`class`);
```

<!-- TODO: i'm still not entirely sure if keyword/operator are useful enough to be included -->

### `keyword`

The `keyword` keyword (!) matches a literal value that is in the format of a JavaScript identifier and returns that value.

```js
const kw = lang`
  Main = identifier "." (identifier | keyword) 
          : ${(left, _, right) => [left, right]};
  Reserved = "class" | "function" | "if" | "else";
`;

equal(id`foo.bar`, ['foo', 'bar']);
equal(id`foo.class`, ['foo', 'class']);

throws(() => id`class.foo`);
```

### `operator`

The `operator` keyword matches a literal value that is _not_ in the format of a JavaScript identifier. I have no idea why you would use this, but it is included for symmetry with `keyword`.

### `nil`

The `nil` keyword matches nothing and returns `null`.

```js
const opt = lang`Main = identifier | nil`;

equal(opt`foo`, 'foo');
equal(opt``, null);
```

### `include`

The `include` keyword allows you to embed one grammar in another. If you use this, it will probably be for embedding an operator grammar.

```js
const prog = lang`
  Program = Statement ** ";";
  Statement = "print" Expr : ${(_, expr) => console.log(expr)}
            | Expr;
  Expr = include ${op`
    left  "+"   : ${(l, r) => l + r}
          "-"   : ${(l, r) => l - r}
    left  "*"   : ${(l, r) => l * r}
          "/"   : ${(l, r) => l / r}
          "%"   : ${(l, r) => l % r}
    right "**"  : ${(l, r) => l ** r}
    pre   "-"   : ${x => -x}
    root BaseExpr
  `};
  BaseExpr = value;
`;
```

### Sequence

A sequence of expressions followed by a colon and an interpolated function matches that sequence and passes the results of each expression into that function, returning the result.

```js
const seq = lang`identifier "=" value : ${(name, _, value) => ({
  [name]: value,
})}`;
equal(seq`foo = 1`, { foo: 1 });
equal(seq`bar = "bar"`, { bar: 'bar' });

throws(() => seq`foo`);
throws(() => seq`foo = 1 bar`);
throws(() => seq`1 = foo`);
```

### Alternation

The pipe character, `|`, like in regular expressions, is the alternation operator, and (Foo | Bar) matches either of the rules Foo or Bar.

```js
const alts = lang`
  Main = "foo" | "bar" | value;
`;

equal(alts`foo`, 'foo');
equal(alts`bar`, 'bar');
equal(alts`123.45`, 123.45);
```

#### A note about parsing strategy

The behavior of this operator happens to be one of the major differences between traditional CFG parsers (including Zebu) and PEG parsers. In Zebu, the order of branches doesn't matter -- the parser looks ahead at the next tokens and chooses the branch based on that. However, this means that each branch must not overlap; if they do, Zebu will raise a "first/first conflict" error.
On the other hand, PEG parsers try each branch in order, and backtrack if one doesn't succeed. This means that branches _can_ overlap, though more often than not overlapping branches are an indication of a bug, not a desirable feature.

### Repetition

The operators `*`, `+` and `?` work similarly to how they work in regular expressions:

- `Expr*` matches a sequence of 0 or more `Expr`s and returns an array,
- `Expr+` matches a sequence of 1 or more `Expr`s and returns an array,
- `Expr?` optionally matches `Expr`, and returns null if it doesn't match. `Expr?` is equivalent to `(Expr | nil)`.

```js
const repeat0 = lang`value*`;
equal(repeat0``, []);
equal(repeat0`"foo"`, ['foo']);
equal(repeat0`"foo" "bar"`, ['foo', 'bar']);

const repeat1 = lang`value+`;
throws(() => repeat1``);
equal(repeat1`"foo"`, ['foo']);
equal(repeat1`"foo" "bar"`, ['foo', 'bar']);

const maybe = lang`value?`;
equal(maybe``, null);
equal(maybe`"foo"`, 'foo');
```

### Parentheses, brackets and braces

Zebu includes syntactic sugar for matching expressions wrapped in punctuation:

- `#{ Expr }` matches `Expr` wrapped in curly braces and returns the result of `Expr`, and is equivalent to `("{" Expr "}" : ${(_, result) => result})`
- `#[ Expr ]` as above, for square brackets
- `#( Expr )` as above, for parentheses.

### Separated sequences

The operators `++` and `**` are used for matching sequences with separators, e.g. function arguments separated by commas, or statements separated by semicolons, and return an array of the matched expression (ignoring the separators). The `++` operator matches one or more elements, while the `**` operator matches zero or more. Both allow optional trailing separators.

```js
const sepBy0 = lang`value ** ","`;
equal(sepBy0``, []);
equal(sepBy0`1`, [1]);
equal(sepBy0`1,`, [1]);
equal(sepBy0`1, 2`, [1, 2]);

const sepBy1 = lang`value ++ ","`;
throws(() => sepBy1``);
equal(sepBy1`1`, [1]);
equal(sepBy1`1,`, [1]);
equal(sepBy1`1, 2`, [1, 2]);
```

If you explicitly do _not_ want trailing separators to be valid, use something like:

```js
const noTrailing1 = lang`
  Main = value Rest* : ${(first, rest) => [first, ...rest]};
  Rest = "," value : ${(_, value) => value};
`;

throws(() => noTrailing1``);
equal(noTrailing1`1`, [1]);
throws(() => noTrailing1`1,`);
equal(noTrailing1`1, 2`, [1, 2]);
```
