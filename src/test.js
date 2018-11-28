import * as parseUtils from './parse-utils'
import * as tokenUtils from './token-utils'
import * as rootLanguage from './root-language'
import * as immutableRecord from './immutable-record'

const modules = [parseUtils, tokenUtils, rootLanguage, immutableRecord]

const assert = require('assert').strict

const expect = (value) => ({
  toEqual: (compare) => assert.deepEqual(value, compare),
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
        } catch (e) {
          if (e instanceof assert.AssertionError) {
            console.log('not ok', count, e.message)
            break
          }
          throw e
        }
        console.log('ok', count)
        passCount++
      }
    }
  }
  console.log()
  console.log(`1..${count}`)
  console.log('# tests', count)
  console.log('# pass ', passCount)
}

runTests(modules)
