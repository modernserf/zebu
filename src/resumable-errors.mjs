function * example (resource) {
  resource.open()
  yield _finally(function * () {
    resource.close()
  })

  yield _catch(function * (error) {
    if (error.message === 'foo') {
      return resume('bar')
    }
    return end('baz')
  })

  let y = yield _try(() => { throw new Error('foo') })

  let x = yield _try(() => 'baz')

  return { x, y }
}

const _finally = (value) => ({ type: 'finally', value })
const _catch = (value) => ({ type: 'catch', value })
const _try = (value) => ({ type: 'try', value })
const resume = (value) => ({ type: 'resume', value })
const end = (value) => ({ type: 'end', value })

function exceptionToValue (thunk) {
  try {
    return { ok: true, value: thunk() }
  } catch (e) {
    return { ok: false, value: e }
  }
}

function handleError (errorValue, state) {
  if (!state.catch) { run(state.finally); throw errorValue }
  const { ok, value: valueOrError } = exceptionToValue(() => run(state.catch, errorValue))
  if (!ok) { run(state.finally); throw valueOrError }
  return valueOrError
}

function run (fn, ...args) {
  if (!fn) { return }
  const gen = fn(...args)
  let state = { catch: null, finally: null }
  let lhs
  while (true) {
    const { value: result, done } = gen.next(lhs)
    lhs = undefined
    if (done) {
      run(state.finally)
      return result
    }

    if (result.type === 'try') {
      const { ok, value: valueOrError } = exceptionToValue(result.value)
      if (ok) {
        lhs = valueOrError
        continue
      }

      const errorRes = handleError(valueOrError, state)
      if (errorRes.type === 'end') {
        run(state.finally)
        return errorRes.value
      } else if (errorRes.type === 'resume') {
        lhs = errorRes.value
        continue
      }
    } else if (result.type === 'catch') {
      state.catch = result.value
    } else if (result.type === 'finally') {
      state.finally = result.value
    }
  }
}

export function test_resumable_errors (expect) {
  const resource = {
    log: [],
    open: () => { resource.log.push('opened') },
    close: () => { resource.log.push('closed') },
  }
  const { x, y } = run(example, resource)
  expect(x).toEqual('baz')
  expect(y).toEqual('bar')
  expect(resource.log).toEqual(['opened', 'closed'])
}
