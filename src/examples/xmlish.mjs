import { grammar } from '../index'
import assert from 'assert'

const xmlisp = grammar`
  Document = Body
  TagBody  = TagHead ("|" line?) Body (line? "|") Tag  
             : ${(obj, _, children, __, closeTag) => { assert.strictEqual(obj.type, closeTag); return { ...obj, children } }}
           | TagHead
  TagHead  = Tag line? Attrs      : ${(type, _, attrs) => ({ type, attrs, children: [] })}
  Body     = Expr ** line?
  Expr     = #[ TagBody ]
           | value
  
  Attrs    = Attr ** line?        : ${(objs) => objs.reduce((l, r) => Object.assign(l, r), {})}
  Attr     = identifier "=" value : ${(key, _, value) => ({ [key]: value })}
  Tag      = identifier
`

export function test_xmlish_markup (expect) {
  const doc = xmlisp`
    [head|
      [title| "The Great Gatsby" |title]
      [link rel="stylesheet" href="theme.css"]
    |head]
    [body|
      [p class="foo"|
        "In my younger and more vulnerable years " [strong|"my father"|strong]" gave me some advice that I've been turning over in my mind "
        [em|"ever since"|em]
        ". \"Whenever you feel like criticizing any one,\" he told me, \"just remember that all the people in this world haven't had the advantages that you've had.\""
      |p]
    |body]
  `
  expect(doc).toEqual([
    { type: 'head',
      attrs: {},
      children: [
        { type: 'title', attrs: {}, children: ['The Great Gatsby'] },
        { type: 'link', attrs: { rel: 'stylesheet', href: 'theme.css' }, children: [] },
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
