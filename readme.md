# Zebu

## What is this?

Zebu is a JavaScript library for building [little languages](http://staff.um.edu.mt/afra1/seminar/little-languages.pdf) with [tagged template literals](http://2ality.com/2016/11/computing-tag-functions.html).

## Little Languages built with Zebu

### [Ranges](https://github.com/modernserf/zebu/blob/master/src/examples/range.mjs) 
```js
range`1,3 ... (10)` // => yields 1, 3, 5, 7, 9
```

### [Data expressions](http://justinfalcone.com/data-expressions/)
```js
dx`.foo.bar`.replace({ foo: { bar: 3 } }, 5) // => { foo: { bar: 5 } }
```

### [React PropTypes](https://github.com/modernserf/zebu/blob/master/src/examples/prop-types.mjs)
```js
const types = propTypes`
  className: string?
  type: ("select" | "datalist")?
  options: [{ id: string, label: string }]
  value: string
  onChange: func
`
/* => {
  className: PropTypes.string,
  type: PropTypes.oneOf(["select", "datalist"]),
  options: PropTypes.arrayOf([
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }).isRequired
  ]).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
} */
```

### [Matrix math operations](https://github.com/modernserf/zebu/blob/master/src/examples/matrix.mjs)
```js
const x = [
  [7, 1],
  [-2, 3],
]
matrix`
  [ 2 0 
   -1 3 ] * ${x}
`
// => [[14, 2], [-13, 8]]
```

### State machines
```js
const traffic = machine`
  initState: #green
  states: #green | #yellow | #red
  events: #timer
  onTransition: ${(state) => console.log(state)}

  #green  @ #timer -> #yellow
  #yellow @ #timer -> #red
  #red    @ #timer -> #green
`
traffic.start() // log { type: "green" }
traffic.send({ type: "timer" }) // log { type: "yellow" }
```

### Text matching
```js
const joinObjects = (objects) => objects.reduce((l, r) => Object.assign(l, r), {})
const url = text`
  URL       = Protocol Host Path? "/"? Search? Anchor?
              : ${(protocol, host, path, _, search, anchor) => ({ protocol, host, path, search, anchor })}
  Protocol  = ${/[a-z]+/} "://"
  Host      = ${/[A-Za-z0-9-]+/} ++ "."
  Path      = "/" (Component ++ "/")  : ${(_, path) => path}
  Search    = "?" Pair ++ "&"         : ${(_, pairs) => joinObjects(pairs)}
  Pair      = Component "=" Component : ${(key, _, value) => ({[key]: value})}
  Anchor    = "#" Component           : ${(_, target) => target}
  Component = ${/[A-Za-z0-9()_\-~]/}  : ${decodeURIComponent}
`
url.match("https://github.com/modernserf/zebu?foo=bar20baz"/)
/* => { 
  ok: true, 
  value: {
    protocol: "https",
    host: ["github", "com"],
    path: ["modernserf", "zebu"],
    search: { foo: "bar baz" },
    anchor: null,
  },
} */
```

## Writing a language

Zebu exports the function `grammar` that is used to define the rules for interpreting a language. Let's use `grammar` to make a yaml-like configuration language, called "spaml":

```js
import { grammar } from "zebu"

const spaml = grammar`
  Block = Pair ** Sep           : ${fromPairs}
  Pair  = Key (":" line?) Expr  : ${(key, _, value) => [key, value]}
  Expr  = #[ Expr ** Sep ]      : ${(xs = []) => xs}
        | #{ Block }
        | value
        | "true"                : ${() => true}
        | "false"               : ${() => false}
        | "null"                : ${() => null}
  Key   = identifier | value
  Sep   = line | ","
`
function fromPairs (pairs) {
  const obj = {}
  for (const [key, value] of pairs) {
    obj[key] = value
  }
  return obj
}
```

You can use the `spaml` grammar like this:

```js
const justin = spaml`
  name: "Justin"
  twitter_handle: "modernserf"
  hobbies: ["karaoke", "mixology", "programming"]
`
```

which results in: 
```js
{ 
  name: "Justin", 
  twitter_handle: "modernserf", 
  hobbies: ["karaoke", "mixology", "programming"],
}
```

How does this work?

`grammar` and `spaml` are both functions that work with tagged template literals.

TODO: something about tagged template literals

### Tokenizing

First, the string components and interpolated values are transformed into tokens:

```
  name: "Justin"
  twitter_handle: "modernserf"
  hobbies: ["karaoke", "mixology", "programming"]
```

becomes:

```js
[
  { type: 'identifier', value: 'name' },
  { type: 'operator', value: ':' },
  { type: 'value', value: 'Justin' },
  { type: 'line' },
  { type: 'identifier', value: 'twitter_handle' },
  { type: 'operator', value: ':' },
  { type: 'value', value: 'modernserf' },
  { type: 'line' },
  { type: 'identifier', value: 'hobbies' },
  { type: 'operator', value: ':' },
  { type: 'startToken', value: '[' },
  { type: 'value', value: 'karaoke' },
  { type: 'operator', value: ',' },
  { type: 'value', value: 'mixology' },
  { type: 'operator', value: ',' },
  { type: 'value', value: 'programming' },
  { type: 'endToken', value: ']' },
]
```

Some text, like tabs and spaces, are removed altogether. JS-style comments (both `//` line comments and `/* */` block) are also removed. If there are multiple newlines in a row, they are consolidated into a single `line` token; any opening and closing lines are removed as well.

Numbers and quoted strings become `value` tokens; all interpolated values are inserted as `value` tokens as well. Words that match JavaScript's rules for identifiers become `identifier` tokens. Most punctuation becomes `operator` tokens. 

Grouping symbols `( ) [ ] { }` are specially handled and become `startToken` and `endToken`, and these have a special purpose in the next stage of processing.

### Skeleton syntax trees

Next, the grouping tokens are matched, and the tokens between them are collected into a single `structure` token:

```js
[
  { type: 'identifier', value: 'name' },
  { type: 'operator', value: ':' },
  { type: 'value', value: 'Justin' },
  { type: 'line' },
  { type: 'identifier', value: 'twitter_handle' },
  { type: 'operator', value: ':' },
  { type: 'value', value: 'modernserf' },
  { type: 'line' },
  { type: 'identifier', value: 'hobbies' },
  { type: 'operator', value: ':' },
  { type: 'structure', structureType: '[]', value: [
    { type: 'value', value: 'karaoke' },
    { type: 'operator', value: ',' },
    { type: 'value', value: 'mixology' },
    { type: 'operator', value: ',' },
    { type: 'value', value: 'programming' },
  ] }
]
```

Most parsers don't have this step, but this means that the next step can be much simpler.

### Parsing

In the next step, we try to match the tokens to the top rule of the grammar. 

```js
const spaml = grammar`
  Block = Pair ** Sep           : ${fromPairs}
  Pair  = Key (":" line?) Expr  : ${(key, _, value) => [key, value]}
  Expr  = #[ Expr ** Sep ]      : ${(xs = []) => xs}
        | #{ Block }
        | value
        | "true"                : ${() => true}
        | "false"               : ${() => false}
        | "null"                : ${() => null}
  Key   = identifier | value
  Sep   = line | ","
`
```

```
(Block
  (Pair 
    (Key (identifier "name")) 
    (Expr (value "Justin")))
  (Pair 
    (Key (identifier "twitter_handle")) 
    (Expr (value "modernserf")))
  (Pair 
    (Key (identifier "hobbies")) 
    (Expr [
      (Expr (value "karaoke"))
      (Expr (value "mixology"))
      (Expr (value "programming"))
    ])))
```






Zebu is a _parser generator_, much like [yacc](http://dinosaur.compilertools.net/), [PEG.js](https://pegjs.org/), or [Nearley](https://nearley.js.org). 


With Zebu, you define grammars with tagged template literals. Like [Owl](https://github.com/ianh/owl), but unlike most other parser generators, Zebu is designed for 



Zebu targets [visibly pushdown languages](https://en.wikipedia.org/wiki/Nested_word). 


TODO: examples, three columns: grammar on left, example text in middle, parse tree on right

These parsing expressions match a single token:
- `line`, `value`, `operator`, `identifier` - match a token of this type
- `"include"` `"+"` - match an operator or identifier token with this value

Parsing expressions can also refer to the rules defined _below_them:

```js

```

These parsing expressions work similarly to regular expressions:
- `expr1 expr2` - matches expr1 followed by expr2, returning the value of expr2.
- `expr1 expr2 : ${func}`  matches expr1 followed by expr2. return `func(expr1, expr2)`
- `expr1 | expr1` - try matching `expr1`, else match `expr2`
- `expr+` - match one or more expr
- `expr*` - match zero or more expr
- `expr?` - match zero or one expr

These parsing expressions are useful for
- `expr ++ separator` - match one or more `expr` separated by `separator`
- `expr ** separator` - match zero or more `expr` separated by `separator`, returning a list of `expr` values.


These parsing expressions can refer the rules above them, as well:
- `#( expr )` match `expr` wrapped in parentheses
- `#[ expr ]` match `expr` wrapped in square brackets
- `#{ expr }` match `expr` wrapped in curly braces