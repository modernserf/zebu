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

/**
 * works like a WeakMap, but can also hold primitives.
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
  has (key) {
    return this._lookup(key).has(key)
  }
}

/**
 * a FlimsyMap that simulates tuple keys.
 * It implements this by creating a tree of FlimsyMaps for each key,
 * with the final value using the unique key `PolyMap.END`.
 * @todo investigate if this performs better with a leading "length"
 * key, instead of a trailing "end" key.
 */
class PolyMap {
  constructor () {
    this._rootMap = new FlimsyMap()
  }
  get (keys) {
    let map = this._rootMap
    for (const key of keys) {
      map = map.get(key)
      if (!map) { return null }
    }
    return map.get(PolyMap.END)
  }
  set (keys, value) {
    let map = this._rootMap
    for (const key of keys) {
      if (!map.has(key)) {
        map.set(key, new FlimsyMap())
      }
      map = map.get(key)
    }
    map.set(PolyMap.END, value)
    return this
  }
}
PolyMap.END = Symbol('END')

export function test_polymap_lookup (expect) {
  const map = new PolyMap()
  map.set(['foo', 'bar', 'baz'], 123)
  expect(map.get(['foo', 'bar', 'baz'])).toEqual(123)
}

/**
 * the PolyMap that keeps track of every record requires the keys of each record
 * to be in a consistent order. However, some JS values (e.g. symbols, objects)
 * are not sortable. To get around this, a Sorter object assigns unique ids
 * to every object it tracks, so that they can be consistently
 * (though arbitrarily) sorted.
 */
class Sorter {
  constructor () {
    this.sortID = 0
    this.sortMap = new FlimsyMap()
  }
  getSortID (value) {
    if (!this.sortMap.has(value)) {
      this.sortMap.set(value, this.sortID++)
    }
    return this.sortMap.get(value)
  }
  sortEntries (entries) {
    return entries.sort(([a], [b]) => this.getSortID(a) - this.getSortID(b))
  }
}

export function test_sorter (expect) {
  const sorter = new Sorter()
  const left = sorter.sortEntries(
    Object.entries({ x: 1, y: 2, sym1: 3, sym2: 4 })
  )
  const right = sorter.sortEntries(
    Object.entries({ sym2: 4, y: 2, x: 1, sym1: 3 })
  )
  expect(left).toEqual(right)
  expect(left.length).toEqual(4)
}

/**
 * for records to be comparable, they need to be stored in the same lookup
 * table and use the same system for sorting keys.
 */
class RecordState {
  constructor () {
    // state
    this.map = new PolyMap()
    this.sorter = new Sorter()
    // convenience accessors
    this.record = (fields = {}) =>
      this.getRecord(this.sorter.sortEntries(entriesWithSymbols(fields)))
    this.tuple = (...values) =>
      this.getRecord(Object.entries(values))
  }
  getRecord (entries) {
    const flatEntries = entries.reduce((list, pair) => list.concat(pair), [])
    const foundRecord = this.map.get(flatEntries)
    if (foundRecord) { return foundRecord }
    const newRecord = new Record(entries)
    this.map.set(flatEntries, newRecord)
    return newRecord
  }
}

export function test_getRecord (expect) {
  const recordState = new RecordState()
  const left = recordState.getRecord([['x', 1], ['y', 2]])
  const right = recordState.getRecord([['x', 1], ['y', 2]])
  expect(left === right).toEqual(true)
  expect(left.x).toEqual(1)
  expect(left.y).toEqual(2)
}

const globalState = new RecordState()

export const { record, tuple } = globalState

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

export function test_record_keys_in_any_order_with_symbols (expect) {
  const sym1 = Symbol('sym1')
  const sym2 = Symbol('sym2')
  const left = record({ x: 1, y: 2, [sym1]: 3, [sym2]: 4 })
  const right = record({ [sym2]: 4, y: 2, x: 1, [sym1]: 3 })
  expect(left === right).toEqual(true)
  expect(left[sym1]).toEqual(3)
  expect(left[sym2]).toEqual(4)
}

// Object.entries does not include symbols
function entriesWithSymbols (object) {
  const allKeys = Object.keys(object)
    .concat(Object.getOwnPropertySymbols(object))
  return allKeys.map((key) => [key, object[key]])
}
