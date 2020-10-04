import moo from "moo";

class BracketMismatchError extends Error {}

const trimQuotes = (str) => str.slice(1, -1).replace(/\\(.)/g, "$1");
const toNumber = (str) => Number(str.replace(/_/g, ""));

const baseTokenizer = moo.states({
  main: {
    line: { match: /\n\s*/u, lineBreaks: true },
    ignore: [
      { match: /(?: |\t)+/u },
      { match: "//", next: "lineComment" },
      { match: "/*", next: "blockComment" },
    ],
    value: [
      { match: /"(?:\\["\\]|[^\n"\\])*"/u, value: trimQuotes },
      { match: /'(?:\\['\\]|[^\n'\\])*'/u, value: trimQuotes },
      { match: /-?[0-9_]+(?:\.[0-9_]*)?(?:[eE]-?[0-9_])?/u, value: toNumber },
      { match: /0x[0-9A-Fa-f_]+/u, value: toNumber },
      { match: /0o[0-7_]+/u, value: toNumber },
      { match: /0b[0-1_]+/u, value: toNumber },
    ],
    startToken: ["[", "(", "{"],
    endToken: ["]", ")", "}"],
    identifier: {
      match: /(?:\$|_|\p{ID_Start})(?:\$|\u200C|\u200D|\p{ID_Continue})*/u,
    },
    operator: [{ match: [",", ";"] }, { match: /[!@#%^&*\-+=|/:<>.?~]+/u }],
  },
  lineComment: {
    ignore: { match: /[^\n]+/u },
    line: { match: /\n+\s*/u, lineBreaks: true, next: "main" },
  },
  blockComment: {
    ignore: [
      { match: /(?:\*[^/]|[^*])+/u, lineBreaks: true },
      { match: "*/", next: "main" },
    ],
  },
});

/**
 * @param {[String]} strs
 * @param {[Object]} interpolations
 */
export function tokenize(strs, interpolations) {
  return skeletonize(tokenizeWithInterpolations(strs, interpolations));
}

// TODO: what does line/col mean when we reset the tokenizer on substri
function* tokenizeWithInterpolations(strs, interpolations) {
  let lastState;
  for (const str of strs) {
    yield* baseTokenizer.reset(str, lastState);
    lastState = baseTokenizer.save();
    if (interpolations.length) {
      let value = interpolations.shift();
      // don't yield interpolated values in comments
      if (lastState.state === "main") {
        yield {
          type: "value",
          value,
          line: lastState.line,
          col: lastState.col,
        };
      }
    }
  }
}

const matches = {
  "]": "[",
  "}": "{",
  ")": "(",
  end: "start",
};

function skeletonize(tokens) {
  const stack = [{ value: [], startToken: "start" }];
  for (const tok of tokens) {
    if (tok.type === "ignore") {
      continue;
    }
    if (tok.type === "line") {
      const top = stack[stack.length - 1];
      const lastToken = top.value[top.value.length - 1];
      if (lastToken && lastToken.type === "line") {
        continue;
      }
    }

    if (tok.type === "startToken") {
      stack.push({
        type: "structure",
        value: [],
        offset: tok.offset,
        line: tok.line,
        col: tok.col,
        startToken: tok.value,
      } as any);
    } else if (tok.type === "endToken") {
      const structure = stack.pop();
      if (matches[tok.value] !== structure.startToken) {
        throw new BracketMismatchError(tok);
      }

      (structure as any).endToken = tok.value;
      const top = stack[stack.length - 1];
      top.value.push(structure);
    } else {
      stack[stack.length - 1].value.push(tok);
    }
  }
  const result = stack.pop();
  if (result.startToken !== "start") {
    throw new BracketMismatchError();
  }
  return result.value;
}
