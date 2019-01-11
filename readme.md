# Little Language Lab

## What is this?

LLL is JavaScript library for building [little languages](http://staff.um.edu.mt/afra1/seminar/little-languages.pdf) that use [tagged template literals](http://2ality.com/2016/11/computing-tag-functions.html).

## Little Languages built with LLL

### [Ranges](https://github.com/modernserf/little-language-lab/blob/master/src/examples/range.mjs) 
```js
range`1,3 ... (10)` // => yields 1, 3, 5, 7, 9
```

### [Data expressions](http://justinfalcone.com/data-expressions/)
```js
dx`.foo.bar`.replace({ foo: { bar: 3 } }, 5) // => { foo: { bar: 5 } }
```

### [React PropTypes](https://github.com/modernserf/little-language-lab/blob/master/src/examples/prop-types.mjs)
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

### [Matrix math operations](https://github.com/modernserf/little-language-lab/blob/master/src/examples/matrix.mjs)
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
url.match("https://github.com/modernserf/little-language-lab?foo=bar20baz"/)
/* => { 
  ok: true, 
  value: {
    protocol: "https",
    host: ["github", "com"],
    path: ["modernserf", "little-language-lab"],
    search: { foo: "bar baz" },
    anchor: null,
  },
} */
```

## Writing a language

Let's make a configuration language, called SPAML.

```js
import { grammar } from "little-language-lab"

const spaml = grammar`
  Block = Pair ** Sep
        : ${fromPairs}
  Pair  = Key (":" line?) Expr
        : ${(key, _, value) => [key, value]}
  Expr  = #[ Expr ** Sep ]  : ${(xs = []) => xs}
        | #{ Block }
        | value
        | "true"            : ${() => true}
        | "false"           : ${() => false}
        | "null"            : ${() => null}
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

TODO: something about tagged template strings

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

This process removes whitespace & comments and joins newlines together.

TODO: show how text is tokenized, including removed whitespace, comments, joined operators. emphasize that tokenization is same between the definition language & the generated language

### Parsing

LLL is a _parser generator_, much like [yacc](http://dinosaur.compilertools.net/), [PEG.js](https://pegjs.org/), or [Nearley](https://nearley.js.org). 


With LLL, you define grammars with tagged template literals. Like [Owl](https://github.com/ianh/owl), but unlike most other parser generators, LLL is designed for 



LLL targets [visibly pushdown languages](https://en.wikipedia.org/wiki/Nested_word). 


TODO: examples, three columns: grammar on left, example text in middle, parse tree on right

These parsing expressions match a single token:
- `line`, `value`, `operator`, `identifier` - match a token of this type
- `"include"` `"+"` - match an operator or identifier token with this value

Parsing expressions can also refer to the rules defined _below_them:

```js

```

These parsing expressions work similarly to regular expressions:
- `expr1 expr2` - matches expr1 followed by expr2, returning the value of expr1.
- `expr1 expr2 : ${func}`  matches expr1 followed by expr2. return `func(expr1, expr2)`
- `expr1 | expr1` - try matching `expr1`, else match `expr2`
- `expr+` - match one or more expr
- `expr*` - match zero or more expr
- `expr?` - match zero or one expr

These parsing expressions 
- `< . "+" expr > : ${func}` - match a left-associative infix expression, and reduce over `func`
- `< expr "**" . > : ${func}` - match a right-associative infix expression, and reduce over `func`
- `expr ++ separator` - match one or more `expr` separated by `separator`
- `expr ** separator` - match zero or more `expr` separated by `separator`


These parsing expressions can refer the rules above them, as well:
- `#( expr )` match `expr` wrapped in parentheses
- `#[ expr ]` match `expr` wrapped in square brackets
- `#{ expr }` match `expr` wrapped in curly braces