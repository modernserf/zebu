// istanbul ignore next
export function assertUnreachable(value: never): never {
  console.error("shouldnt have gotten (", value, ")");
  throw new Error(`unreachable`);
}

export function union<T>(left: Set<T>, right: Set<T>): Set<T> {
  return new Set([...left, ...right]);
}

export function intersection<T>(left: Set<T>, right: Set<T>): Set<T> {
  const out = new Set<T>();
  for (const item of left) {
    if (right.has(item)) out.add(item);
  }
  return out;
}

export function partition<T>(xs: T[], fn: (x: T) => boolean): [T[], T[]] {
  const trues: T[] = [];
  const falses: T[] = [];
  for (const x of xs) {
    if (fn(x)) {
      trues.push(x);
    } else {
      falses.push(x);
    }
  }
  return [trues, falses];
}

/*
 * outerIndex: index of string in interpolation
 * index: position in string
 * length: length of matched pattern
 * NOTE: an interpolation is treated as if it as it index 0 and has a length of 0.
 * If a token spans across an interpolation (e.g. its a quoted string with an interpolation),
 * the length will be the sum of the string parts, e.g.
 * the length of "foo${x}bar", which is parsed as [`"foo`, x, bar"`], is 8
 */
export type TokenPosition = {
  index: number;
  outerIndex: number;
  length: number;
};

const MAX_OFFSET = 100;

function scan(
  strs: readonly string[],
  pos: TokenPosition,
  direction: number,
  fn: (ch: string, pos: TokenPosition) => boolean
) {
  const state = { length: 0, index: pos.index, outerIndex: pos.outerIndex };
  while (state.outerIndex >= 0 && state.outerIndex < strs.length) {
    while (state.index >= 0 && state.index < strs[state.outerIndex].length) {
      const ch = strs[state.outerIndex][state.index];
      if (fn(ch, state)) return state;
      state.length++;
      state.index += direction;
    }
    state.outerIndex += direction;
    if (direction < 0) {
      state.index = (strs[state.outerIndex] || "").length - 1;
    } else {
      state.index = 0;
    }
  }

  return state;
}

function findOffset(
  strs: readonly string[],
  pos: TokenPosition,
  direction: number
): TokenPosition {
  return scan(
    strs,
    pos,
    direction,
    (ch, newPos) => ch === "\n" || newPos.length >= MAX_OFFSET
  );
}

function toEnd(strs: readonly string[], pos: TokenPosition): TokenPosition {
  return scan(strs, pos, 1, (_, nextPos) => nextPos.length === pos.length);
}

export function showInContext(
  strs: readonly string[],
  pos: TokenPosition
): string {
  const lines: string[] = [];
  let strInContext = "";
  let underline = "";
  const startPos = findOffset(strs, pos, -1);
  const endPos = findOffset(strs, toEnd(strs, pos), 1);
  let offset = -startPos.length;

  scan(strs, startPos, 1, (ch, { index, outerIndex }) => {
    if (outerIndex > 0 && index === 0) {
      // eslint-disable-next-line no-template-curly-in-string
      strInContext += "${...}";
      if (offset > 0 && offset <= pos.length) {
        underline += "^^^^^^";
      } else {
        underline += "      ";
      }
    }

    offset++;

    if (ch === "\n") {
      lines.push(strInContext, underline);
      strInContext = "";
      underline = "";
    } else {
      strInContext += ch;
      if (offset > 0 && offset <= pos.length) {
        underline += "^";
      } else {
        underline += " ";
      }
    }

    return !(outerIndex < endPos.outerIndex || index <= endPos.index);
  });

  lines.push(strInContext, underline);
  return lines.filter((line) => line.trimEnd().length > 0).join("\n");
}

export class ParseError extends Error {
  constructor(message: string, strs: readonly string[], pos: TokenPosition) {
    super(`${message}\n${showInContext(strs, pos)}`);
  }
}

// TODO: add token position & show in context
// will probably need to include source tokens in AST nodes
export class CompileError extends Error {}
