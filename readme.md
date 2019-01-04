# Little Language Lab

## What is this?

LLL is JavaScript library for building [little languages](http://staff.um.edu.mt/afra1/seminar/little-languages.pdf) that use [tagged template strings](http://2ality.com/2016/11/computing-tag-functions.html).

## Little Languages built with LLL

### [Ranges](https://github.com/modernserf/little-language-lab/blob/master/src/examples/range.mjs) 
```js
[...range`1,3 ... (10)`] // => [1,3,5,7,9]
```

### [Data expressions](http://justinfalcone.com/data-expressions/)
```js
dx`.foo.bar`.replace({ foo: { bar: 3 } }, 5) // => { foo: { bar: 5} }
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

### Matrix math operations
```js
const x = [
  [7, 1],
  [-2, 3],
]
matrix`
  [ 2 0 
    1 3 ] * ${x}
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

## Text matching
```js
const joinObjects = (objects) => objects.reduce((l, r) => Object.assign(l, r), {})
const url = text`
  URL       = Protocol ~"://" Host (~"/" Path)? (~"?" Search)? (~"#" Anchor)?
              ${(protocol, host, path, search, anchor) => ({ protocol, host, path, search, anchor })}
  Protocol  = ${/[a-z]+/}
  Host      = ${/[A-Za-z0-9-]+/} / "."
  Path      = (Component / "/") "/"?
  Search    = Pair / "&"                ${joinObjects}
  Pair      = Component ~"=" Component  ${(key, value) => ({[key]: value})}
  Anchor    = Component
  Component = ${/[A-Za-z0-9()_\-~]/}    ${decodeURIComponent}
`
url.match("https://github.com/modernserf/little-language-lab?foo=bar%20baz"/)
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