import assert from 'assert'
import * as parseUtils from './parse-utils'
import * as tokenUtils from './token-utils'
import * as rootLanguage from './root-language'
import * as jsonExample from './examples/json'
// import * as typeExample from './examples/types'

const modules = [
  parseUtils, tokenUtils, rootLanguage,
  jsonExample,
  // typeExample,
]

const expect = (value) => ({
  toEqual: (compare) => assert.deepStrictEqual(value, compare),
  toThrow: (error) => assert.throws(value, error),
})

function processTests (modules) {
  const tests = []
  for (const module of modules) {
    for (const [name, test] of Object.entries(module)) {
      // bail early if there's an "only" test
      if (name.match(/^only_test_/)) {
        const message = name.replace(/^only_test_/, '').replace(/_/g, ' ')
        return [{ message, test }]
      }
      if (name.match(/^test_/)) {
        const message = name.replace(/^test_/, '').replace(/_/g, ' ')
        tests.push({ message, test })
      }
    }
  }
  return tests
}

async function runTests (modules) {
  console.log('TAP version 13')
  let count = 0
  let passCount = 0
  for (const { message, test } of processTests(modules)) {
    count++
    console.log('#', message)
    try {
      await test(expect)
      console.log('ok', count)
      passCount++
    } catch (e) {
      console.log('not ok', count, e.message)
    }
  }

  console.log()
  console.log(`1..${count}`)
  console.log('# tests', count)
  console.log('# pass ', passCount)
}

runTests(modules)
