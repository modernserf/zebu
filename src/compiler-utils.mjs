import { parse, padded } from './parse-utils'
import { tokenize } from './token-utils'

const notNull = (x) => x !== null
export const tag = (type) => (...values) => [type, ...values.filter(notNull)]

export function createCompiler (model) {
  return (ast) => {
    const ctx = {
      scope: {},
      usedTerminals: {},
      eval: ([type, ...payload]) =>
        model[type](...payload, ctx),
    }
    return ctx.eval(ast)
  }
}

export function createTTS (parser) {
  const childTTS = (strings, ...interpolations) => {
    const tokens = Array.from(tokenize(strings.raw, interpolations))
    return parse(padded(parser), tokens)
  }
  childTTS.parse = (subject) => parser.parse(subject)
  return childTTS
}
