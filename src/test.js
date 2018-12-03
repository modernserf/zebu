import * as parseUtils from './parse-utils'
import * as tokenUtils from './token-utils'
import * as rootLanguage from './root-language'
import * as immutableRecord from './immutable-record'
import * as jsonExample from './examples/json'
import * as typeExample from './examples/types'

const modules = [
  parseUtils, tokenUtils, rootLanguage, immutableRecord,
  jsonExample, typeExample,
]

const assert = require('assert')

const expect = (value) => ({
  toEqual: (compare) => assert.deepStrictEqual(value, compare),
  toThrow: (error) => assert.throws(value, error),
})

async function runTests (modules) {
  console.log('TAP version 13')
  let count = 0
  let passCount = 0
  for (const module of modules) {
    for (const [name, test] of Object.entries(module)) {
      if (name.match(/^test_/)) {
        count++
        const message = name.replace(/^test_/, '').replace(/_/g, ' ')
        console.log('#', message)
        try {
          await test(expect)
          console.log('ok', count)
          passCount++
        } catch (e) {
          console.log('not ok', count, e.message)
        }
      }
    }
  }
  console.log()
  console.log(`1..${count}`)
  console.log('# tests', count)
  console.log('# pass ', passCount)
}

runTests(modules)
