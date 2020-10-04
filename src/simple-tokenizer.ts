type TokenContent =
  | {
      type: "value";
      value: unknown;
    }
  | {
      type: "structure";
      value: Token[];
      startToken: "{" | "[" | "(";
    }
  | {
      type: "operator";
      value: string;
    }
  | {
      type: "identifier";
      value: string;
    }
  | {
      type: "line";
    };

/*
 * outerIndex: index of string in interpolation
 * index: position in string
 * length: length of matched pattern
 * NOTE: an interpolation is treated as if it as it index 0 and has a length of 0.
 * If a token spans across an interpolation (e.g. its a quoted string with an interpolation),
 * the length will be the sum of the string parts, e.g.
 * the length of "foo${x}bar", which is parsed as [`"foo`, x, bar"`], is 8
 */
type TokenPosition = {
  index: number;
  outerIndex: number;
  length: number;
};

export type Token = TokenContent & TokenPosition;

class LexerError {
  constructor(
    public readonly index: number,
    public readonly outerIndex: number
  ) {}
}

class NoTokenMatchError extends LexerError {}
class MismatchedBracketError extends LexerError {
  constructor(
    public readonly expected: string,
    public readonly received: string,
    public readonly index: number,
    public readonly outerIndex: number
  ) {
    super(index, outerIndex);
  }
}

const startTokenMatches = {
  "[": "]",
  "{": "}",
  "(": ")",
};

const endTokenMatches = {
  "]": "[",
  "}": "{",
  ")": "(",
};

class LexerState {
  index = 0;
  outerIndex = 0;
  private stack: Token[][] = [];
  private tokens: Token[] = [];
  constructor(
    public readonly strings: readonly string[],
    public readonly interps: unknown[]
  ) {
    this.tokens = [];
    this.stack = [];
  }
  getTokens() {
    if (this.stack.length) {
      const lastStructure = this.tokens[this.tokens.length - 1];
      throw new MismatchedBracketError(
        startTokenMatches[(lastStructure as any).startToken],
        "end",
        this.index,
        this.outerIndex
      );
    }
    return this.tokens;
  }
  push(token: Token | undefined) {
    if (!token) return;
    this.tokens.push(token);
  }
  start(startToken: "{" | "[" | "(") {
    const nextTokens = [];
    const structure: Token = {
      type: "structure",
      value: nextTokens,
      startToken,
      index: this.index,
      outerIndex: this.outerIndex,
      length: 0, // filled in in `end`
    };
    this.tokens.push(structure);
    this.stack.push(this.tokens);
    this.tokens = nextTokens;
  }
  end(endToken: "}" | "]" | ")") {
    const expectedStartToken = endTokenMatches[endToken];
    const lastTokens = this.stack.pop();
    if (!lastTokens) {
      throw new MismatchedBracketError(
        expectedStartToken,
        "end",
        this.index,
        this.outerIndex
      );
    }
    this.tokens = lastTokens;

    const lastStructure: any = this.tokens[this.tokens.length - 1];
    if (lastStructure.startToken !== expectedStartToken) {
      throw new MismatchedBracketError(
        expectedStartToken,
        lastStructure.strtToken,
        this.index,
        this.outerIndex
      );
    }

    if (lastStructure.outerIndex === this.outerIndex) {
      lastStructure.length = this.outerIndex - lastStructure.outerIndex;
    } else {
      lastStructure.length =
        // rest of first string
        this.strings[lastStructure.outerIndex].length -
        lastStructure.index +
        // all strings in between
        this.strings
          .slice(lastStructure.outerIndex + 1, this.outerIndex)
          .reduce((sum, str) => sum + str.length, 0) +
        // last string to this point
        this.index;
    }
  }
  getInterpolation() {
    let token: Token & { type: "value" };
    if (this.outerIndex < this.interps.length) {
      token = {
        type: "value",
        value: this.interps[this.outerIndex],
        index: 0,
        outerIndex: this.outerIndex + 1,
        length: 0,
      };
    }
    this.outerIndex++;
    this.index = 0;
    return token;
  }
  hasStrings() {
    return this.outerIndex < this.strings.length;
  }
  nextChar() {
    const buf = this.strings[this.outerIndex];
    if (!buf) return undefined;
    return buf[this.index];
  }
  matchPattern(pattern: RegExp) {
    const buf = this.strings[this.outerIndex];
    pattern.lastIndex = this.index;
    const result = pattern.exec(buf);
    if (!result) return null;

    this.index = pattern.lastIndex;
    return result;
  }
}

// each regex state is a set of capture groups
// 1: whitespace 2: "//" 3: "/*" 4, 5, 6, 7: number 8: identifier 9: operator
const mainPattern = /((?: |\t)+)|(\/\/)|(\/\*)|(0x[0-9A-Fa-f_]+)|(0o[0-7_]+)|(0b[0-1_]+)|(-?[0-9_]+(?:\.[0-9_]*)?(?:[eE]-?[0-9_])?)|((?:\$|_|\p{ID_Start})(?:\$|\u200C|\u200D|\p{ID_Continue})*)|([!@#%^&*\-+=|/:<>.?~]+)/uy;
function mainState(lexerState: LexerState) {
  let ch: string | undefined;
  while (lexerState.hasStrings()) {
    // TODO: is this actually better than using regex?
    while ((ch = lexerState.nextChar())) {
      switch (ch) {
        case `\n`:
          lexerState.push({
            type: "line",
            index: lexerState.index,
            outerIndex: lexerState.outerIndex,
            length: 0,
          });
          lexerState.index++;
          line(lexerState);
          break;
        case `'`:
          lexerState.index++;
          quote(singleQuotePattern, lexerState);
          break;
        case `"`:
          lexerState.index++;
          quote(doubleQuotePattern, lexerState);
          break;
        case "[":
        case "{":
        case "(":
          lexerState.index++;
          lexerState.start(ch);
          break;
        case "]":
        case "}":
        case ")":
          lexerState.index++;
          lexerState.end(ch);
          break;
        case ",":
        case ";":
          lexerState.index++;
          lexerState.push({
            type: "operator",
            value: ch,
            index: lexerState.index,
            outerIndex: lexerState.outerIndex,
            length: 1,
          });
          break;
        default: {
          const lastIndex = lexerState.index;
          const match = lexerState.matchPattern(mainPattern);
          // TODO: i'm not actually sure if this error is possible
          /* istanbul ignore next */
          if (!match) {
            throw new NoTokenMatchError(
              lexerState.index,
              lexerState.outerIndex
            );
          }
          const matchedString = match[0];

          switch (matchedString) {
            case match[1]:
              break;
            case match[2]:
              lexerState.push({
                type: "line",
                index: lastIndex,
                outerIndex: lexerState.outerIndex,
                length: matchedString.length,
              });
              lineComment(lexerState);
              break;
            case match[3]:
              blockComment(lexerState);
              break;
            case match[4]:
            case match[5]:
            case match[6]:
            case match[7]: {
              const value = Number(matchedString);
              lexerState.push({
                type: "value",
                value,
                index: lastIndex,
                outerIndex: lexerState.outerIndex,
                length: matchedString.length,
              });
              break;
            }
            case match[8]:
              lexerState.push({
                type: "identifier",
                value: matchedString,
                index: lastIndex,
                outerIndex: lexerState.outerIndex,
                length: matchedString.length,
              });
              break;
            case match[9]:
              lexerState.push({
                type: "operator",
                value: matchedString,
                index: lastIndex,
                outerIndex: lexerState.outerIndex,
                length: matchedString.length,
              });
          }
        }
      }
    }

    lexerState.push(lexerState.getInterpolation());
  }
}

const linePattern = /([ \t\n]+)|(\/\/)|(\/\*)/y;
// yield one line for multiple lines, including comments
function line(lexerState: LexerState) {
  while (lexerState.nextChar()) {
    const match = lexerState.matchPattern(linePattern);
    if (!match) return;

    switch (match[0]) {
      case match[1]:
        break; // whitespace
      case match[2]:
        lineComment(lexerState);
        break;
      case match[3]:
        blockComment(lexerState);
    }
  }
  lexerState.push(lexerState.getInterpolation());
}
const singleQuotePattern = /((?:\\['\\]|[^\n'\\])+)|(')/y;
const doubleQuotePattern = /((?:\\["\\]|[^\n"\\])+)|(")/y;

function quote(pattern: RegExp, lexerState: LexerState) {
  const token: Token = {
    type: "value",
    value: "",
    index: lexerState.index - 1, // -1 for initial quote
    outerIndex: lexerState.outerIndex,
    length: 1,
  };
  while (lexerState.hasStrings()) {
    while (lexerState.nextChar()) {
      const match = lexerState.matchPattern(pattern);
      // TODO: what could this be besides a newline? Why _shouldn't_ a newline be allowed?
      if (!match) throw new Error("newline not allowed in string");
      switch (match[0]) {
        // quote body
        case match[1]:
          token.value += match[1];
          token.length += match[1].length;
          break;
        // end quote
        case match[2]:
          token.length++; // add 1 for end quote
          lexerState.push(token);
          return;
      }
    }
    // if interpolating mid-string, interpolate the value _into_ the strin
    const interpolatedToken = lexerState.getInterpolation();
    if (interpolatedToken) {
      token.value += String(interpolatedToken.value);
    }
  }
  // TODO
  throw new Error("string left open");
}

const lineCommentPattern = /([^\n]+)|(\n)/y;
function lineComment(lexerState: LexerState) {
  while (lexerState.hasStrings()) {
    while (lexerState.nextChar()) {
      const match = lexerState.matchPattern(lineCommentPattern);
      // istanbul ignore next
      if (!match) return;
      switch (match[0]) {
        case match[1]:
          break;
        case match[2]:
          // TODO: is mutual recursion likely to be a problem here?
          line(lexerState);
          return;
      }
    }
    lexerState.getInterpolation();
  }
}

const blockCommentPattern = /((?:\*[^/]|[^*])+)|(\*\/)/y;
function blockComment(lexerState: LexerState) {
  while (lexerState.hasStrings()) {
    while (lexerState.nextChar()) {
      const match = lexerState.matchPattern(blockCommentPattern);
      // istanbul ignore next
      if (!match) return;
      switch (match[0]) {
        case match[1]:
          break;
        case match[2]:
          return;
      }
    }
    lexerState.getInterpolation();
  }
}

export function tokenize(strs: readonly string[], interps: unknown[]): Token[] {
  const lexerState = new LexerState(strs, interps);
  mainState(lexerState);
  return lexerState.getTokens();
}
