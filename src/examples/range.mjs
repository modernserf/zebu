import { lang } from '../root-language'

const interval = (exclude) => (value, end) => ({
  value,
  interval: end - value,
  exclude,
})

function * doRange (
  { value: start, interval, exclude: excludeStart },
  { value: end, exclude: excludeEnd } = {}) {
  if (interval === undefined) {
    interval = end > start ? 1 : -1
  }
  const cmp = end === undefined ? () => true
    : interval > 0 ? (x, y) => x < y
      : (x, y) => x > y

  let value = start
  if (excludeStart) { value += interval }
  while (cmp(value, end)) {
    yield value
    value += interval
  }
  if (!excludeEnd && value === end) { yield value }
}

export const range = lang`
  OpenRange = < Range ~"," . > ${function * (l, r) { yield * l; yield * r }}
            | Start ~"..." ${doRange}
            | Range

  Range = Start ~"..." End ${doRange}
        | Value / ","

  Start = ExcludeValue ~"," Value ${interval(true)}
        | Value ~"," Value ${interval(false)}
        | Value ${(value) => ({ value, exclude: false })} 
  End   = ExcludeValue ${(value) => ({ value, exclude: true })}
        | %number ${(value) => ({ value, exclude: false })}

  ExcludeValue = ~"(" Value ")"
  Value        = %number
`
