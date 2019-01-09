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

LLL is a parser generator, much like [yacc](http://dinosaur.compilertools.net/), [PEG.js](https://pegjs.org/), or (Nearley)[https://nearley.js.org]. With LLL, you define grammars with tagged template literals. Here's a grammar that parses JSON:

```js
const fromPairs = (pairs = []) =>
  pairs.reduce((obj, [key, value]) => Object.assign(obj, { [key]: value }), {})
const json = lang`
  Start = Expr
  Pair  = value ":" Expr          : ${(k, _, v) => [k, v]}

  Expr  = [ "[" Expr ** "," "]" ] : ${(xs = []) => xs}
        | [ "{" Pair ** "," "}" ] : ${fromPairs}
        | value
        | "true"                  : ${() => true}
        | "false"                 : ${() => false}
        | "null"                  : ${() => null}
`
```

This returns a function that, in turn, is used for tagged template literals:

```js
const value = 42

json`{ 
  "foo": [true, null, -123.45], 
  "bar": ${42} 
}`
// => { foo: [true, null, -123.45], bar: 42 }

```



### Vocabulary
TODO: adapt vocabulary section from nearley https://nearley.js.org/docs/grammar

### Tokenizing

TODO: show how text is tokenized, including removed whitespace, comments, joined operators. emphasize that tokenization is same between the definition language & the generated language

`line` match a linebreak.
`value` - match a literal value -- a number or a quoted string -- or an interpolated value
`identifier` - match a

### Parsing

TODO: examples, three columns: grammar on left, example text in middle, parse tree on right

`"include"` `"+"` - match a token with this text
`Expr` `value` - match tokens that match this rule
`exprA | exprB` - try matching `exprA`, else match `exprB`
`< . "+" expr > : ${func}` - match a left-associative infix expression, and reduce over `func`
`< expr "**" . > : ${func}` - match a right-associative infix expression, and reduce over `func`
`exprA exprB : ${func}` - match a sequence of exprA and exprB. if `func` provided, return `func` called with values of all exprs, otherwise return value of first expr
`expr ++ separator` - match one or more `expr` separated by `separator`
`expr ** separator` - match zero or more `expr` separated by `separator`
`expr+` - match one or more expr
`expr*` - match zero or more expr
`expr?` - match zero or one expr
`[ startToken expr endToken : ${func} ]` match `expr` wrapped with `startToken` and `endToken`. This is the only rule that can refer to rules defined above it. if func is provided, return `func(startToken, expr, endToken)`, otherwise return expr

