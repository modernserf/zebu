import { grammar } from '../index'

const isInt = (x) => x === Math.floor(x)

const time = grammar`
  %number ~":" %number (~":" %number) ${(h, m, s = 0) => {
    const isValid = h < 24 && m < 60 && s < 60 &&
      h >= 0 && m >= 0 && s >= 0 &&
      isInt(h) && isInt(m)
    if (!isValid) { throw new Error(`invalid time ${h}:${m}:${s}`) }
    return { hour: h, minute: m, second: s }
  }}
`

const date = grammar`
  %number "-" %number "-" %number ${(y, m, d) => {
    const isValid = m <= 12 && d <= 31 &&
      m >= 1 && d >= 1 &&
      isInt(y) && isInt(m) && isInt(d)
    if (!isValid) { throw new Error(`invalid date ${y}-${m}-${d}`) }
    return { year: y, month: m, date: d }
  }}
`

const dateTime = grammar`${date} ${time} ${(date, time) => ({ ...date, ...time })}`
