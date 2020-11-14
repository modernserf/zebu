import { lang, op, tag } from '../index';
import { assertUnreachable } from '../util';

/* 
A programming language with no interesting features.
*/

type Stmt =
  | { type: 'if'; branches: Array<{ cond: Expr; body: Stmt[] }>; else: Stmt[] }
  | {
      type: 'try';
      body: Stmt[];
      catch: { binding: string; body: Stmt[] } | null;
      finally: Stmt[] | null;
    }
  | { type: 'let'; binding: string; expr: Expr }
  | { type: 'while'; expr: Expr; body: Stmt[] }
  | { type: 'for'; binding: string; expr: Expr; body: Stmt[] }
  | { type: 'return'; expr: Expr | null }
  | { type: 'throw'; expr: Expr }
  | { type: 'break' }
  | { type: 'continue' }
  | Expr;

type Expr =
  | { type: 'identAssign'; binding: string; right: Expr }
  | { type: 'keyAssign'; left: Expr; right: Expr; arg: Expr }
  | { type: 'or'; left: Expr; right: Expr }
  | { type: 'and'; left: Expr; right: Expr }
  | { type: 'eq'; left: Expr; right: Expr }
  | { type: 'neq'; left: Expr; right: Expr }
  | { type: 'gt'; left: Expr; right: Expr }
  | { type: 'lt'; left: Expr; right: Expr }
  | { type: 'gte'; left: Expr; right: Expr }
  | { type: 'lte'; left: Expr; right: Expr }
  | { type: 'add'; left: Expr; right: Expr }
  | { type: 'sub'; left: Expr; right: Expr }
  | { type: 'mul'; left: Expr; right: Expr }
  | { type: 'div'; left: Expr; right: Expr }
  | { type: 'mod'; left: Expr; right: Expr }
  | { type: 'pow'; left: Expr; right: Expr }
  | { type: 'not'; expr: Expr }
  | { type: 'neg'; expr: Expr }
  | { type: 'call'; expr: Expr; args: Expr[] }
  | { type: 'get'; expr: Expr; arg: Expr }
  | { type: 'dict'; pairs: Array<{ key: Expr; value: Expr }> }
  | { type: 'list'; exprs: Expr[] }
  | { type: 'func'; params: string[]; body: Stmt[] }
  | { type: 'ident'; value: string }
  | { type: 'value'; value: unknown };

class Scope {
  private values = new Map<string, unknown>();
  constructor(private readonly parentScope: Scope | null) {}
  get(key: string): unknown {
    if (this.values.has(key)) return this.values.get(key)!;
    if (this.parentScope) return this.parentScope.get(key);
    throw new Error(`ReferenceError: unknown identifier ${key}`);
  }
  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }
}

class ReturnInterrupt {
  constructor(public readonly value: unknown) {}
}

class ThrowInterrupt {
  private nodeStack: Stmt[] = [];
  constructor(public readonly value: unknown, node: Stmt) {
    this.nodeStack.push(node);
  }
  pushStack(node: Stmt) {
    this.nodeStack.push(node);
  }
}

class VanillaException {
  constructor(public readonly message: string) {}
}

class BreakInterrupt {}
class ContinueInterrupt {}

class Dict extends Map<unknown, unknown> {}

class Interpreter {
  constructor(private readonly scope: Scope = new Scope(null)) {}
  interpret(node: Stmt) {
    const assertBool = arg => assertBoolBound(arg, node);
    const assertNum = arg => assertNumBound(arg, node);
    switch (node.type) {
      case 'let':
        this.scope.set(node.binding, this.interpret(node.expr));
        return null;
      case 'if': {
        for (const branch of node.branches) {
          const cond = assertBool(this.interpret(branch.cond));
          if (cond) {
            const ctx = this.createContext();
            for (const stmt of branch.body) {
              ctx.interpret(stmt);
            }
            return null;
          }
        }

        if (node.else.length) {
          const ctx = this.createContext();
          for (const stmt of node.else) {
            ctx.interpret(stmt);
          }
        }

        return null;
      }
      case 'try': {
        const ctx = this.createContext();
        try {
          for (const stmt of node.body) {
            ctx.interpret(stmt);
          }
        } catch (interrupt) {
          if (interrupt instanceof ThrowInterrupt && node.catch) {
            const ctx = this.createContext();
            ctx.scope.set(node.catch.binding, interrupt.value);
            for (const stmt of node.catch.body) {
              ctx.interpret(stmt);
            }
          } else {
            throw interrupt;
          }
        } finally {
          if (node.finally) {
            const ctx = this.createContext();
            for (const stmt of node.finally) {
              ctx.interpret(stmt);
            }
          }
        }
        return null;
      }
      case 'while': {
        try {
          while (assertBool(this.interpret(node.expr))) {
            const ctx = this.createContext();
            try {
              for (const stmt of node.body) {
                ctx.interpret(stmt);
              }
            } catch (interrupt) {
              if (interrupt instanceof ContinueInterrupt) {
                // continue
              } else {
                throw interrupt;
              }
            }
          }
        } catch (interrupt) {
          if (interrupt instanceof BreakInterrupt) {
            // break
          } else {
            throw interrupt;
          }
        }
        return null;
      }
      case 'for': {
        const expr = this.interpret(node.expr);
        const iter = expr instanceof Dict ? expr.keys() : expr;
        try {
          for (const value of iter) {
            const ctx = this.createContext();
            ctx.scope.set(node.binding, value);
            try {
              for (const stmt of node.body) {
                ctx.interpret(stmt);
              }
            } catch (interrupt) {
              if (interrupt instanceof ContinueInterrupt) {
                // continue
              } else {
                throw interrupt;
              }
            }
          }
        } catch (interrupt) {
          if (interrupt instanceof BreakInterrupt) {
            // break
          } else {
            throw interrupt;
          }
        }
        return null;
      }
      case 'return':
        throw new ReturnInterrupt(node.expr ? this.interpret(node.expr) : null);
      case 'throw':
        throw new ThrowInterrupt(this.interpret(node.expr), node);
      case 'break':
        throw new BreakInterrupt();
      case 'continue':
        throw new ContinueInterrupt();
      case 'identAssign': {
        const right = this.interpret(node.right);
        this.scope.set(node.binding, right);
        return right;
      }
      case 'keyAssign': {
        const left = this.interpret(node.left);
        const right = this.interpret(node.right);
        const key = this.interpret(node.arg);
        if (left instanceof Dict) {
          left.set(key, right);
        } else {
          left[key] = right;
        }
        return right;
      }
      case 'or':
        if (assertBool(this.interpret(node.left))) return true;
        return assertBool(this.interpret(node.right));
      case 'and':
        if (!assertBool(this.interpret(node.left))) return false;
        return assertBool(this.interpret(node.right));
      case 'eq':
        return isEqual(this.interpret(node.left), this.interpret(node.right));
      case 'neq':
        return !isEqual(this.interpret(node.left), this.interpret(node.right));
      case 'gt':
        return (
          assertNum(this.interpret(node.left)) >
          assertNum(this.interpret(node.right))
        );
      case 'lt':
        return (
          assertNum(this.interpret(node.left)) <
          assertNum(this.interpret(node.right))
        );
      case 'gte':
        return (
          assertNum(this.interpret(node.left)) >=
          assertNum(this.interpret(node.right))
        );
      case 'lte':
        return (
          assertNum(this.interpret(node.left)) <=
          assertNum(this.interpret(node.right))
        );
      case 'add':
        return (
          assertNum(this.interpret(node.left)) +
          assertNum(this.interpret(node.right))
        );
      case 'sub':
        return (
          assertNum(this.interpret(node.left)) -
          assertNum(this.interpret(node.right))
        );
      case 'mul':
        return (
          assertNum(this.interpret(node.left)) *
          assertNum(this.interpret(node.right))
        );
      case 'div':
        return (
          assertNum(this.interpret(node.left)) /
          assertNum(this.interpret(node.right))
        );
      case 'mod':
        return (
          assertNum(this.interpret(node.left)) %
          assertNum(this.interpret(node.right))
        );
      case 'pow':
        return (
          assertNum(this.interpret(node.left)) **
          assertNum(this.interpret(node.right))
        );
      case 'not':
        return !assertBool(this.interpret(node.expr));
      case 'neg':
        return -assertNum(this.interpret(node.expr));
      case 'call': {
        const target = this.interpret(node.expr);
        // TODO: check target length
        if (typeof target === 'function') {
          return target(...node.args.map(arg => this.interpret(arg)));
        }
        throw new ThrowInterrupt(
          new VanillaException(`TypeError: target is not a function`),
          node
        );
      }
      case 'get': {
        const target = this.interpret(node.expr);
        const arg = this.interpret(node.arg);
        const result = target instanceof Dict ? target.get(arg) : target[arg];
        if (result === undefined) {
          throw new ThrowInterrupt(
            new VanillaException(
              `RangeError: target does not have property ${arg}`
            ),
            node
          );
        }
        return result;
      }
      case 'dict': {
        return new Dict(
          node.pairs.map(({ key, value }) => [
            this.interpret(key),
            this.interpret(value),
          ])
        );
      }
      case 'list': {
        return node.exprs.map(expr => this.interpret(expr));
      }
      case 'func': {
        const ctx = this.createContext();
        return (...args: unknown[]) => {
          for (const [i, arg] of args.entries()) {
            ctx.scope.set(node.params[i], arg);
          }
          try {
            for (const stmt of node.body) {
              ctx.interpret(stmt);
            }
            return null;
          } catch (interrupt) {
            if (interrupt instanceof ReturnInterrupt) {
              return interrupt.value;
            } else if (interrupt instanceof ThrowInterrupt) {
              interrupt.pushStack(node);
              throw interrupt;
            } else {
              throw interrupt;
            }
          }
        };
      }

      case 'ident':
        return this.scope.get(node.value);
      case 'value':
        return node.value;
      default:
        assertUnreachable(node);
    }
  }
  private createContext() {
    return new Interpreter(new Scope(this.scope));
  }
}

function assertNumBound<T>(value: T, node: Stmt): T {
  if (typeof value !== 'number') {
    throw new ThrowInterrupt(
      new VanillaException(`TypeError: ${value} is not a number`),
      node
    );
  }
  return value;
}

function assertBoolBound<T>(value: T, node: Stmt): T {
  if (typeof value !== 'boolean') {
    throw new ThrowInterrupt(
      new VanillaException(`TypeError: ${value} is not a boolean`),
      node
    );
  }
  return value;
}

function isEqual(left: unknown, right: unknown) {
  if (left === right) return true;
  if (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length
  ) {
    for (let i = 0; i < left.length; i++) {
      if (!isEqual(left[i], right[i])) return false;
    }
    return true;
  }
  if (
    left instanceof Dict &&
    right instanceof Dict &&
    left.size === right.size
  ) {
    for (const [key, leftValue] of left) {
      if (!isEqual(leftValue, right.get(key))) return false;
    }
    return true;
  }
  return false;
}

type BlockContext = {
  inLoop: boolean;
  inFunc: boolean;
  inFinally: boolean;
};

function assertBlockContext(
  node: Stmt,
  context: BlockContext = { inLoop: false, inFunc: false, inFinally: false }
): void {
  switch (node.type) {
    case 'if': {
      for (const branch of node.branches) {
        for (const stmt of branch.body) {
          assertBlockContext(stmt, context);
        }
      }
      for (const stmt of node.else) {
        assertBlockContext(stmt, context);
      }
      return;
    }
    case 'try': {
      for (const stmt of node.body) {
        assertBlockContext(stmt, context);
      }
      if (node.catch) {
        for (const stmt of node.catch.body) {
          assertBlockContext(stmt, context);
        }
      }
      if (node.finally) {
        const innerContext = { ...context, inFinally: true };
        for (const stmt of node.finally) {
          assertBlockContext(stmt, innerContext);
        }
      }
      return;
    }
    case 'while':
    case 'for': {
      const innerContext = { ...context, inLoop: true };
      for (const stmt of node.body) {
        assertBlockContext(stmt, innerContext);
      }
      return;
    }
    case 'func': {
      const innerContext = {
        inFunc: true,
        inLoop: false,
        inFinally: false,
      };
      for (const stmt of node.body) {
        assertBlockContext(stmt, innerContext);
      }
      return;
    }
    case 'return':
      if (!context.inFunc) {
        throw new Error('Cannot return from top level');
      }
      if (context.inFinally) {
        throw new Error('Cannot return from inside finally block');
      }
      return;
    case 'break':
    case 'continue':
      if (!context.inLoop) {
        throw new Error('Cannot break or continue outside of loop');
      }
      return;
  }
}

function interpret(program: Stmt[]) {
  for (const node of program) {
    assertBlockContext(node);
  }
  const interpreter = new Interpreter();
  for (const node of program) {
    interpreter.interpret(node);
  }
}

type IfParseTree =
  | { type: 'if'; cond: Expr; body: Stmt[]; next: IfParseTree | null }
  | { type: 'else'; body: Stmt[] };

function foldIfStatement(node: IfParseTree | null): Stmt {
  const branches: Array<{ cond: Expr; body: Stmt[] }> = [];
  while (node) {
    if (node.type === 'if') {
      branches.push({ cond: node.cond, body: node.body });
      node = node.next;
    } else {
      return { type: 'if', branches, else: node.body };
    }
  }

  return { type: 'if', branches, else: [] };
}

function parseAssignment(left: Expr, right: Expr): Expr {
  if (left.type === 'ident') {
    return { type: 'identAssign', binding: left.value, right };
  } else if (left.type === 'get') {
    return { type: 'keyAssign', left: left.expr, arg: left.arg, right };
  }
  throw new Error('Invalid assignment');
}

export const vanilla = lang`
  Program = Statement ** ";" : ${interpret};
  Block = #{ Statement ** ";" };
  Statement =
    | "let" Binding "=" Expression          : ${tag`let _ binding _ expr`}
    | "while" Expression Block              : ${tag`while _ expr body`}
    | "for" Binding "of" Expression Block   : ${tag`for _ binding _ expr body`}
    | "return" Expression?                  : ${tag`return _ expr`}
    | "throw" Expression                    : ${tag`throw _ expr`}
    | "break"                               : ${tag`break`}
    | "continue"                            : ${tag`continue`}
    | IfStatement                           : ${foldIfStatement}
    | TryStatement
    | Expression;

  IfStatement = "if" Expression Block ElseBranch? : ${tag`if _ expr body next`};
  ElseBranch  = "else" IfStatement  : ${(_, node) => node}
              | "else" Block        : ${tag`else _ body`};
  
  TryStatement = "try" Block Catch? Finally : ${tag`try _ body catch finallyBody`};
  Catch = "catch" Binding Block : ${(_, binding, body) => ({ binding, body })};
  Finally = "finally" Block : ${(_, body) => body};

  Expression = include ${op`
    right "="     : ${parseAssignment}
    left  "||"    : ${tag`or left right`}
    left  "&&"    : ${tag`and left right`}
    left  "=="    : ${tag`eq left right`}
          "!="    : ${tag`neq left right`}
    left  ">"     : ${tag`gt left right`}
          "<"     : ${tag`lt left right`}
          ">="    : ${tag`gte left right`}
          "<="    : ${tag`lte left right`}
    left  "+"     : ${tag`add left right`}
          "-"     : ${tag`sub left right`}
    left  "*"     : ${tag`mul left right`}
          "/"     : ${tag`div left right`}
          "%"     : ${tag`mod left right`}
    right "**"    : ${tag`pow left right`}
    pre   "!"     : ${tag`not expr`}
          "-"     : ${tag`neg expr`}
    root RootExpression
  `};
  
  RootExpression =
    | #( Expression )
    | RootExpression #( Expression ** "," ) : ${tag`call expr args`}
    | RootExpression #[ Expression ]        : ${tag`get expr arg`}
    | RootExpression "." Key                : ${tag`get expr _ arg`}
    | "func" #( Binding ** "," ) Block      : ${tag`func _ params body`}
    | #{ Pair ** "," }                      : ${tag`dict pairs`}
    | #[ Expression ** "," ]                : ${tag`list exprs`}
    | identifier                            : ${tag`ident value`}
    | value                                 : ${tag`value value`}
    | "true"                                : ${tag`value value=${true}`}
    | "false"                               : ${tag`value value=${false}`}
    | "null"                                : ${tag`value value=${null}`};

  Pair = Expression ":" Expression : ${(key, _, value) => ({ key, value })};
  Key = identifier | keyword : ${tag`value value`};
  Binding = identifier;
`;
