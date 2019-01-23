# Zebu

## What is this?

Zebu is a JavaScript library for building [little languages](http://staff.um.edu.mt/afra1/seminar/little-languages.pdf) with [tagged template literals](http://2ality.com/2016/11/computing-tag-functions.html). Here are some examples of little languages built with Zebu:

### [Ranges](https://github.com/modernserf/zebu/blob/master/src/examples/range.mjs) 
```js
range`1,3 ... (10)` // => yields 1, 3, 5, 7, 9
```

### [Data expressions](https://github.com/modernserf/zebu/blob/master/src/examples/data-expressions.mjs)
```js
const obj = { foo: { bar: 3 } }
dx`.foo.bar`.replace(obj, 5) // => { foo: { bar: 5 } }
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

### [Interactive fiction](https://github.com/modernserf/zebu/blob/master/src/examples/interactive-fiction.mjs)
```js
const leonAdventure = story`
  === begin ===
  "You wake up, unfortunately. There is a treasure chest in the room. You do not know where it came from."
  * "open treasure chest" -> treasure
  * "pet cat" -> cat
  * "go to the bathroom" -> toilet
  === cat ===
  "The cat purrs with approval at your touch."
  * "open treasure chest" -> treasure
  * "pet cat" -> cat
  * "go to the bathroom" -> toilet
`
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

### Tokenizing

So how does this work? `grammar` and `spaml` are both functions that work with tagged template literals. First, the string components and interpolated values are transformed into tokens. This text:

```
  name: "Justin"
  twitter_handle: "modernserf"
  hobbies: ["karaoke", "mixology", "programming"]
```

is transformed into:

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

This step allows Zebu to target [visibly pushdown languages](https://en.wikipedia.org/wiki/Nested_word) -- essentially this means that Zebu grammars can be as (computationally) simple as regular expressions, but still allow recursive structures in brackets. This also makes it easier to provide good error messages & avoid some performance issues. This technique was adapted from [Owl](https://github.com/ianh/owl) and Dylan's [D-Expressions](https://people.csail.mit.edu/jrb/Projects/dexprs.pdf).

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

These parsing expressions match a single token:
- `line`, `value`, `operator`, `identifier` - match a token of this type
- `"include"` `"+"` - match an operator or identifier token with this value

These parsing expressions work similarly to regular expressions, and can refer to the rules defined below them:
- `expr1 expr2` - matches expr1 followed by `expr2`, returning the result of `expr2`
- `expr1 expr2 : ${func}`  matches `expr1` followed by `expr2`, returning `func(expr1, expr2)`
- `expr1 | expr1` - try matching `expr1`, else match `expr2`
- `expr+` - match one or more expr, returning a list of `expr` results
- `expr*` - match zero or more expr, returning a list of `expr` results
- `expr?` - match zero or one expr, returning null or `expr` result

These parsing expressions are useful for matching simple operator expressions, or lists with separators, and can refer to the rules defined below them. They both return lists of `expr` results.
- `expr ++ separator` - match one or more `expr` separated by `separator`
- `expr ** separator` - match zero or more `expr` separated by `separator`, with an optional trailing `separator`

These parsing expressions match expressions wrapped in bracketing punctuation. Unlike the other parsing expressions, these can also refer to rules defined _above_ them:
- `#( expr )` match `expr` wrapped in parentheses
- `#[ expr ]` match `expr` wrapped in square brackets
- `#{ expr }` match `expr` wrapped in curly braces

### Operator grammars

TODO: operator API

```js
const math = op`
  left  "+"   : ${(l, r) => l + r}
        "-"   : ${(l, r) => l - r}
  left  "*"   : ${(l, r) => l * r}
        "/"   : ${(l, r) => l / r}
        "%"   : ${(l, r) => l % r}
  right "**"  : ${(l, r) => l ** r}
  pre   "-"   : ${x => -x}
  post  "++"  : ${x => x + 1}
        "--"  : ${x => x - 1}
`
expect(math`3 * 4 / 5 * 6`).toEqual((3 * 4) / 5 * 6)
```

TODO: transcluding grammars

```js
const expr = grammar`
  Expr = include ${parent => op`
    left "++" : ${(xs, ys) => xs.concat(ys)}
    root ${parent.RootExpr}
  `}
  RootExpr  = #[ Expr ** "," ]
            | value
`
expect(expr`["foo", "bar"] ++ ["baz"]`)
  .toEqual(['foo', 'bar', 'baz'])
```