import { lang } from '../index'

const assertFn = (test, error) => (...args) => {
  if (!test(...args)) { throw new Error(error) }
  return args[0]
}

const xml = lang`
  Document = Body
  TagBody  = TagHead (">" line?) Body : ${(obj, _, children) => ({ ...obj, children })}
  TagHead  = Tag line? Attrs          : ${(type, _, attrs) => ({ type, attrs, children: [] })}
  Body     = Expr ** line?
  Expr     = ["<" TagHead "/>"]
           | ["<" TagBody "</" ] Tag ">" : ${assertFn((obj, closeTag) => obj.type === closeTag, 'tags do not match')}
           | value
  
  Attrs    = Attr ** line?            : ${(objs) => objs.reduce((l, r) => Object.assign(l, r), {})}
  Attr     = identifier "=" value     : ${(key, _, value) => ({ [key]: value })}
  Tag      = identifier
`

export function test_xmlish_markup (expect) {
  const doc = xml`
    <head>
      <title>"The Great Gatsby"</title>
    </head>
    <body>
      <p class="foo">
        "In my younger and more vulnerable years "<strong>"my father"</strong>" gave me some advice that I've been turning over in my mind "
        <em>"ever since"</em>
        ". \"Whenever you feel like criticizing any one,\" he told me, \"just remember that all the people in this world haven't had the advantages that you've had.\""
      </p>
    </body>
  `
  expect(doc).toEqual([
    { type: 'head',
      attrs: {},
      children: [
        { type: 'title', attrs: {}, children: ['The Great Gatsby'] },
      ] },
    { type: 'body',
      attrs: {},
      children: [
        { type: 'p',
          attrs: { class: 'foo' },
          children: [
            'In my younger and more vulnerable years ',
            { type: 'strong', attrs: {}, children: ['my father'] },
            " gave me some advice that I've been turning over in my mind ",
            { type: 'em', attrs: {}, children: ['ever since'] },
            `. "Whenever you feel like criticizing any one," he told me, "just remember that all the people in this world haven't had the advantages that you've had."`,
          ] },
      ] },
  ])
}
