import { lang } from './lang';
import { ParseError, CompileError } from './util';

test('nil language', () => {
  const nil = lang`Main = nil`;
  expect(nil``).toEqual(null);
});

test('simple values', () => {
  const num = lang`Main = "return" value : ${(_, x) => x};`;
  expect(num`return 123`).toEqual(123);
  expect(() => num`yield 123`).toThrow(ParseError);
  expect(() => num`return`).toThrow(ParseError);
  expect(() => num`return foo`).toThrow(ParseError);
  expect(() => num`"return" 123`).toThrow(ParseError);
  expect(() => num`return 123 456`).toThrow(ParseError);
});

test('recursive rules', () => {
  const math = lang`
    Neg   = "-" Expr : ${(_, value) => -value}
          | Expr;
    Expr  = #( Neg )
          | value;
  `;
  expect(math`123`).toEqual(123);
  expect(math`-123`).toEqual(-123);
  expect(math`(123)`).toEqual(123);
  expect(math`-(-(123))`).toEqual(123);
});

test('undefined rules', () => {
  expect(() => lang`Rule = Expr`.compile()).toThrow(CompileError);
});

test('self-recursion', () => {
  const right = lang`
    Term = Expr "**" Term : ${(l, _, r) => l ** r}
         | Expr;
    Expr = value;
  `;
  expect(right`2 ** 3 ** 4`).toEqual(2 ** (3 ** 4));
  const left = lang`
    Term = Term "-" Expr: ${(l, _, r) => l - r}
         | Expr;
    Expr = value;
  `;
  expect(left`2 - 3 - 4`).toEqual(2 - 3 - 4);
});

test('repeaters', () => {
  const list = lang`
    Expr  = #( Expr* )
          | identifier
  `;
  expect(list`(foo bar (baz quux) xyzzy)`).toEqual([
    'foo',
    'bar',
    ['baz', 'quux'],
    'xyzzy',
  ]);

  const nonEmptyList = lang`
    Expr  = #( Expr+ )
          | identifier
  `;
  expect(nonEmptyList`(foo bar (baz quux) xyzzy)`).toEqual([
    'foo',
    'bar',
    ['baz', 'quux'],
    'xyzzy',
  ]);
  expect(() => nonEmptyList`()`).toThrow(ParseError);

  expect(() => lang`Main = (value?)*`.compile()).toThrow(CompileError);
});

test('if else', () => {
  const ifElse = lang`
    IfElse = "if" Block Else? 
      : ${(_, ifBlock, elseBlock) => ({ ifBlock, elseBlock })};
    Else = "else" (IfElse | Block) : ${(_, x) => x};
    Block = value;
  `;
  ifElse`if "foo"`;
  ifElse`if "foo" else "bar"`;
  ifElse`if "foo" else if "bar"`;
  ifElse`if "foo" else if "bar" else if "baz" else "quux"`;
});

test('interpolated parser', () => {
  const list = lang`Main = (include ${lang`Main = value`})+`;
  expect(list`1 2 3`).toEqual([1, 2, 3]);

  expect(() => lang`Main = include ${null}`.compile()).toThrow(CompileError);
});

test('keyword and operator terminals', () => {
  const noop = () => {
    return;
  };
  const it = lang`
    Statement = "print" Expr : ${noop};
    Expr      = DotExpr ("+" Expr : ${noop})* : ${noop};
    DotExpr   = RootExpr ("." (identifier | keyword) : ${noop})* : ${noop};
    RootExpr  = #( operator )
              | identifier
              | value;
  `;
  expect(() => {
    it`print (+)`;
    it`print foo.bar.print`;
  }).not.toThrow();
  expect(() => {
    it`print print.foo`;
  }).toThrow(ParseError);
});

test('separators', () => {
  const list1 = lang`Rule = identifier ++ ","`;
  expect(list1`foo`).toEqual(['foo']);
  expect(list1`foo,`).toEqual(['foo']);
  expect(list1`foo, bar, baz`).toEqual(['foo', 'bar', 'baz']);

  const list0 = lang`Rule = (identifier ** ",")`;
  expect(list0``).toEqual([]);
  expect(list0`foo`).toEqual(['foo']);
  expect(list0`foo,`).toEqual(['foo']);
  expect(list0`foo, bar, baz`).toEqual(['foo', 'bar', 'baz']);
});

test('structures', () => {
  const fromPairs = pairs => pairs.reduce((l, r) => Object.assign(l, r), {});
  const json = lang`
    Expr = 
      | #{ Pair ** "," : ${fromPairs} }
      | #[ Expr ** "," ]
      | "true"   : ${() => true}
      | "false"  : ${() => false}
      | "null"   : ${() => null}
      | value;
    Pair = value ":" Expr : ${(k, _, v) => ({ [k]: v })}; 
  `;
  expect(json`{"foo": [123, "bar", true, false, null] }`).toEqual({
    foo: [123, 'bar', true, false, null],
  });
});

test('unresolvable conflicts', () => {
  const noop = () => {
    return;
  };
  expect(() => lang`Main = value? value : ${noop}`.compile()).toThrow(
    CompileError
  );
  expect(() => lang`Main = "foo" value? value : ${noop}`.compile()).toThrow(
    CompileError
  );
  // TODO: why does this throw, but not the rule below?
  expect(() => {
    lang`
      Main = Loop value : ${noop};
      Loop = value Loop : ${(l, r) => [l, ...r]}
           | nil : ${() => []};
    `.compile();
  }).toThrow(CompileError);
  // expect(() => lang`Main = value* value`.compile()).toThrow(CompileError);
  expect(() =>
    lang`Main = value : ${() => 'x'}
              | value : ${() => 'y'};
        `.compile()
  ).toThrow(CompileError);
});
