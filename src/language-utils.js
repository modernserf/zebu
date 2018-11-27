import { parse } from './parse-utils'
import { tokenize } from './token-utils'

/**
 * @typedef {(strs: string[], ...any) => any} TaggedTemplateString
 * @param {import('./token-utils').Tokenizer} tokenizer
 * @param {import('./parse-utils').Parser} parser
 * @returns TaggedTemplateString
 */
export const createLanguage = ({ tokenizer, parser, context }) => {
  const tts = (strs, ...interpolations) => {
    const tokens = Array.from(tokenize(tokenizer, strs, interpolations))
    return parse(parser, tokens, context)
  }
  // add `parse`, `withCtx` methods for subparsing
  //   Object.assign(tts, parser)
  return tts
}
