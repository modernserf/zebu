import { TokenPosition, ParseError } from './util';

type TokenContent =
  | {
      type: 'literal';
      value: string;
    }
  | {
      type: 'value';
      value: unknown;
    }
  | {
      type: 'identifier';
      value: string;
    };

export type Token = TokenContent & TokenPosition;

abstract class LexerError {
  message: string;
  constructor(public pos: TokenPosition) {}
}

class NoTokenMatchError extends LexerError {
  message = 'No match for token';
}
class StringNewlineError extends LexerError {
  message = 'Unexpected newline in string';
}
class StringIncompleteError extends LexerError {
  message = 'Unexpected end of input in string';
}

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
    let token: (Token & { type: 'value' }) | undefined;
    if (this.outerIndex < this.interps.length) {
      token = {
        type: 'value',
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

export const identifierPattern = /(?:\$|_|\p{ID_Start})(?:\$|\u200C|\u200D|\p{ID_Continue})*/u;
const singleQuotePattern = /((?:\\['\\]|[^\n'\\])+)|(')/y;
const doubleQuotePattern = /((?:\\["\\]|[^\n"\\])+)|(")/y;

const lineCommentPattern = /([^\n]+)|(\n)/y;
const blockCommentPattern = /((?:\*[^/]|[^*])+)|(\*\/)/y;

export const identifierOrOperator = /^(?:(?:\$|_|\p{ID_Start})(?:\$|\u200C|\u200D|\p{ID_Continue})*|[!@#%^&*\-+=|/:<>.?~]+|[,;])$/u;

export class Lexer {
  lexerState: LexerState;
  mainPattern: RegExp;
  constructor(private readonly keywords: Set<string>, operators: Set<string>) {
    const operatorsPattern = matchOperators(Array.from(operators));

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
        .map(re => `(${re.source})`)
        .join('|'),
      'uy'
    );
  }
  run(strs: readonly string[], interps: unknown[]): Token[] {
    this.lexerState = new LexerState(strs, interps);
    try {
      this.mainState();
    } catch (e) {
      // istanbul ignore else
      if (e instanceof LexerError) {
        throw new ParseError(e.message, strs, e.pos);
      } else {
        throw e;
      }
    }
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
        if (!match) {
          throw new NoTokenMatchError({
            index: lexerState.index,
            outerIndex: lexerState.outerIndex,
            length: 1,
          });
        }
        const matchedString = match[0];

        if (match[2]) {
          this.comment(lineCommentPattern);
        } else if (match[3]) {
          this.comment(blockCommentPattern);
        } else if (match[4] || match[5] || match[6] || match[7]) {
          const value = Number(matchedString);
          lexerState.push({
            type: 'value',
            value,
            index: lastIndex,
            outerIndex: lexerState.outerIndex,
            length: matchedString.length,
          });
        } else if (match[8]) {
          lexerState.push({
            type: this.keywords.has(matchedString) ? 'literal' : 'identifier',
            value: matchedString,
            index: lastIndex,
            outerIndex: lexerState.outerIndex,
            length: matchedString.length,
          });
        } else if (match[9]) {
          lexerState.push({
            type: 'literal',
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
      type: 'value',
      value: '',
      index: lexerState.index - 1, // -1 for initial quote
      outerIndex: lexerState.outerIndex,
      length: 1,
    };
    while (lexerState.hasStrings()) {
      while (lexerState.nextChar()) {
        const match = lexerState.matchPattern(pattern);
        // TODO: what could this be besides a newline? Why _shouldn't_ a newline be allowed?
        if (!match) throw new StringNewlineError(token);

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
      // if interpolating mid-string, interpolate the value _into_ the string
      const interpolatedToken = lexerState.getInterpolation();
      if (interpolatedToken) {
        token.value += String(interpolatedToken.value);
      }
    }
    throw new StringIncompleteError(token);
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

function reEscape(s: string) {
  return s.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function matchOperators(operators: string[]) {
  const longestFirst = Array.from(new Set(operators)).sort(
    (a, b) => b.length - a.length
  );
  return new RegExp(`(?:${longestFirst.map(reEscape).join('|')})`);
}
