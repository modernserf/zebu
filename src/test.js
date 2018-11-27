import * as parseUtils from './parse-utils'
import * as tokenUtils from './token-utils'
import * as rootLanguage from './root-language'

const tape = require('tape')

const modules = [parseUtils, tokenUtils, rootLanguage]
for (const module of modules) {
  for (const [name, fn] of Object.entries(module)) {
    if (name.match(/^test_/)) {
      tape(name.replace(/^test_/, '').replace(/_/g, ' '), (t) => {
        const res = fn(expecter(t))
        if (res && res.then) { return res.then(() => { t.end() }) }
        t.end()
      })
    }
  }
}

function expecter (t) {
  return (value) => ({
    toEqual: (compare) => t.deepEquals(value, compare),
    toThrow: (error) => t.throws(value, error),
  })
}
