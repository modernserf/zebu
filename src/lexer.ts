export type StructureStartToken = "{" | "[" | "(";
type TokenContent =
  | {
      type: "value";
      value: unknown;
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
      type: "keyword";
      value: string;
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

class LexerState {
  index = 0;
  outerIndex = 0;
  private tokens: Token[] = [];
  constructor(
    public readonly strings: readonly string[],
    public readonly interps: unknown[]
  ) {}
  getTokens() {
    return this.tokens;
  }
  push(token: Token | undefined) {
    if (!token) return;
    this.tokens.push(token);
  }
  getInterpolation() {
    let token: (Token & { type: "value" }) | undefined;
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

const identifierPattern = /(?:\$|_|\p{ID_Start})(?:\$|\u200C|\u200D|\p{ID_Continue})*/u;
const singleQuotePattern = /((?:\\['\\]|[^\n'\\])+)|(')/y;
const doubleQuotePattern = /((?:\\["\\]|[^\n"\\])+)|(")/y;

const lineCommentPattern = /([^\n]+)|(\n)/y;
const blockCommentPattern = /((?:\*[^/]|[^*])+)|(\*\/)/y;

export const identifierOrOperator = /^(?:(?:\$|_|\p{ID_Start})(?:\$|\u200C|\u200D|\p{ID_Continue})*|[!@#%^&*\-+=|/:<>.?~]+|[,;])$/u;

class Lexer {
  lexerState: LexerState;
  keywords: Set<string>;
  mainPattern: RegExp;
  constructor(literals: string[]) {
    const [keywords, operators] = partition(literals, (lit) => {
      const match = lit.match(identifierPattern);
      return !!match && match[0] === lit;
    });
    this.keywords = new Set(keywords);

    const operatorsPattern = matchOperators(operators);
    // console.log(operatorsPattern);

    // each regex state is a set of capture groups
    this.mainPattern = new RegExp(
      [
        /[ \t\n]+/, // whitespace
        /\/\//, // line comment
        /\/\*/, // block comment
        /0x[0-9A-Fa-f_]+/, // number
        /0o[0-7_]+/,
        /0b[0-1_]+/,
        /-?[0-9_]+(?:\.[0-9_]*)?(?:[eE]-?[0-9_])?/,
        identifierPattern, // identifier
        operatorsPattern, // operators
      ]
        .map((re) => `(${re.source})`)
        .join("|"),
      "uy"
    );
  }
  run(strs: readonly string[], interps: unknown[]) {
    this.lexerState = new LexerState(strs, interps);
    this.mainState();
    return this.lexerState.getTokens();
  }
  private mainState() {
    const lexerState = this.lexerState;
    let ch: string | undefined;
    while (lexerState.hasStrings()) {
      while ((ch = lexerState.nextChar())) {
        // TODO: is this actually better than using regex?
        switch (ch) {
          case `'`:
            lexerState.index++;
            this.quote(singleQuotePattern);
            continue;
          case `"`:
            lexerState.index++;
            this.quote(doubleQuotePattern);
            continue;
        }

        const lastIndex = lexerState.index;
        const match = lexerState.matchPattern(this.mainPattern);
        // TODO: i'm not actually sure if this error is possible
        /* istanbul ignore next */
        if (!match) {
          throw new NoTokenMatchError(lexerState.index, lexerState.outerIndex);
        }
        const matchedString = match[0];

        if (match[2]) {
          this.comment(lineCommentPattern);
        } else if (match[3]) {
          this.comment(blockCommentPattern);
        } else if (match[4] || match[5] || match[6] || match[7]) {
          const value = Number(matchedString);
          lexerState.push({
            type: "value",
            value,
            index: lastIndex,
            outerIndex: lexerState.outerIndex,
            length: matchedString.length,
          });
        } else if (match[8]) {
          lexerState.push({
            type: "identifier",
            value: matchedString,
            index: lastIndex,
            outerIndex: lexerState.outerIndex,
            length: matchedString.length,
          });
        } else if (match[9]) {
          lexerState.push({
            type: "operator",
            value: matchedString,
            index: lastIndex,
            outerIndex: lexerState.outerIndex,
            length: matchedString.length,
          });
        }
      }

      lexerState.push(lexerState.getInterpolation());
    }
  }
  private quote(pattern: RegExp) {
    const lexerState = this.lexerState;
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

        if (match[1]) {
          // quote body
          token.value += match[1];
          token.length += match[1].length;
        } else {
          // end quote
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
  private comment(pattern: RegExp) {
    while (this.lexerState.hasStrings()) {
      while (this.lexerState.nextChar()) {
        const match = this.lexerState.matchPattern(pattern);
        // istanbul ignore next
        if (!match || match[2]) return;
      }
      this.lexerState.getInterpolation();
    }
  }
}

export function tokenize(
  strs: readonly string[],
  interps: unknown[],
  literals: string[]
): Token[] {
  return new Lexer(literals).run(strs, interps);
}

function partition<T>(iter: Iterable<T>, fn: (x: T) => boolean): [T[], T[]] {
  const trues: T[] = [];
  const falses: T[] = [];

  for (const value of iter) {
    if (fn(value)) {
      trues.push(value);
    } else {
      falses.push(value);
    }
  }

  return [trues, falses];
}

function reEscape(s: string) {
  return s.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function matchOperators(operators: string[]) {
  const longestFirst = Array.from(new Set(operators)).sort(
    (a, b) => b.length - a.length
  );
  return new RegExp(`(?:${longestFirst.map(reEscape).join("|")})`);
}
