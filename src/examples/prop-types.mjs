import PropTypes from 'prop-types'
import { lang } from '../index'

const pair = (key, value) => ({ [key]: value })
const fromPairs = (pairs) => pairs.reduce(Object.assign, {})
const ifMultiple = (fn) => (xs) => xs.length === 1 ? xs[0] : fn(xs)

export const propTypes = lang`
  Rules     = Rule / (%line | ";")  : ${fromPairs}
  Rule      = %identifier ~":" Expr : ${pair}

  Pair      = Key ~":" Expr         : ${pair}
  Key       = %identifier | %value

  Expr      = OptExpr / "|"         : ${ifMultiple(PropTypes.oneOfType)}
  OptExpr   = BaseExpr "?"            // proptypes are optional by default
            | BaseExpr              : ${(type) => type.isRequired}
  BaseExpr  = ["(" Expr ")"]
            | ["{" (~":" Expr) "}"] : ${PropTypes.objectOf}
            | ["{" Pair / "," "}"]  : ${(pairs) => PropTypes.shape(fromPairs(pairs))}
            | ["[" Expr "]"]        : ${PropTypes.arrayOf}
            | "instanceof" %value   : ${PropTypes.instanceOf}
            | %identifier           : ${(id) => PropTypes[id]}
            | %value                : ${(value) => typeof value === 'function' ? value : PropTypes.oneOf([value])}
`

export function test_react_prop_types (expect) {
  const types = propTypes`
    className: string?
    type: ("select" | "datalist")?
    options: [{ id: string, label: string }]
    value: string
    onChange: func
  `
  expect(types.onChange).toEqual(PropTypes.func.isRequired)
  expect(types.className).toEqual(PropTypes.string)
}
