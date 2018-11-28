class Record {
  constructor (entries) {
    const values = []
    for (const [key, value] of entries) {
      this[key] = value
      values.push(value)
    }
    Record.Values.set(this, values)
    Object.freeze(this)
  }
  * [Symbol.iterator] () {
    yield * Record.Values.get(this)
  }
}

Record.Values = new WeakMap()
Record.empty = new Record([])

/**
 * Not quite a weak map.
 */
class FlimsyMap {
  constructor () {
    this._primitives = new Map()
    this._objects = new WeakMap()
  }
  _lookup (key) {
    if (key && typeof key === 'object') { return this._objects }
    return this._primitives
  }
  get (key) {
    return this._lookup(key).get(key)
  }
  set (key, value) {
    this._lookup(key).set(key, value)
    return this
  }
  getDeep (...keys) {
    let value = this
    for (const key of keys) {
      if (!value) { return null }
      value = value.get(key)
    }
    return value
  }
  updateDeep (update, key, ...restKeys) {
    if (!restKeys.length) {
      this.set(key, update(this.get(key)))
    } else {
      const childMap = this.get(key) || new FlimsyMap()
      this.set(key, childMap.updateDeep(update, ...restKeys))
    }
    return this
  }
}

/**
 * size -> key -> value -> records
 * @type {FlimsyMap<number, FlimsyMap<string, FlimsyMap<any, record[]>>> }
 */
const recordsByCount = new FlimsyMap()

function lookupRecordByFields (fields, byCount) {
  const count = fields.length
  if (count === 0) { return Record.empty }
  const [firstField, ...restFields] = fields
  const [key, value] = firstField

  let candidateRecords = byCount.getDeep(count, key, value)
  if (!candidateRecords) { return null }

  // check that remaining fields match
  for (const [key, value] of restFields) {
    const nextCandidates = byCount.getDeep(count, key, value)
    if (!nextCandidates) { return null }
    candidateRecords = intersection(candidateRecords, nextCandidates)
    if (!candidateRecords.length) { return null }
  }

  if (candidateRecords.length > 1) {
    throw new Error('has duplicate records')
  }

  return candidateRecords[0]
}

function createRecord (fields, byCount) {
  const out = new Record(fields)
  const count = fields.length
  for (const [key, value] of fields) {
    byCount.updateDeep(
      (records = []) => { records.push(out); return records },
      count, key, value
    )
  }
  return out
}

function intersection (left, right) {
  return left.filter((item) => right.includes(item))
}

export function record (fields = {}, byCount = recordsByCount) {
  const entries = Object.entries(fields)
  return lookupRecordByFields(entries, byCount) ||
    createRecord(entries, byCount)
}

export const tuple = (...values) => record(values)

export function test_empty_record (expect) {
  const left = record()
  const right = record({})
  expect(left === right).toEqual(true)
}

export function test_record_equality (expect) {
  const left = record({ x: 1, y: 2 })
  const right = record({ x: 1, y: 2 })

  expect(left === right).toEqual(true)
  expect(left.x).toEqual(1)
  expect(left.y).toEqual(2)
}

export function test_tuple (expect) {
  const left = tuple('foo', 'bar')
  const right = tuple('foo', 'bar')
  expect(left === right).toEqual(true)
  const [a, b] = left
  expect(a).toEqual('foo')
  expect(b).toEqual('bar')
}

export function test_record_deep_structure (expect) {
  const left = record({
    x: record({ foo: 1, bar: 2 }),
    y: tuple('foo', 'bar', record({ baz: 3 })),
  })
  const right = record({
    x: record({ foo: 1, bar: 2 }),
    y: tuple('foo', 'bar', record({ baz: 3 })),
  })
  expect(left === right).toEqual(true)
  expect(left.x === record({ foo: 1, bar: 2 })).toEqual(true)
  expect(left.y === tuple('foo', 'bar', record({ baz: 3 }))).toEqual(true)
}

export function test_record_as_map_key (expect) {
  const map = new Map([
    [record({ x: 1, y: 2 }), 'foo'],
    [tuple(3, 4), 'bar'],
  ])
  expect(map.get(record({ x: 1, y: 2 }))).toEqual('foo')
  expect(map.get(tuple(3, 4))).toEqual('bar')
  expect(map.get(record({ x: 1, y: 1 }))).toEqual(undefined)
}
