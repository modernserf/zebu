import { lang } from "./lang";

test("nil language", () => {
  const nil = lang`Main = nil`;
  expect(nil``).toEqual(null);
});

test("simple values", () => {
  const num = lang`Main = "return" value : ${(_, x) => x}`;
  expect(num`return 123`).toEqual(123);
  expect(() => num`return`).toThrow();
  expect(() => num`return foo`).toThrow();
  expect(() => num`"return" 123`).toThrow();
});

test("recursive rules", () => {
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

test("undefined rules", () => {
  expect(() => lang`Rule = Expr`.compile()).toThrow();
});

test("self-recursion", () => {
  const right = lang`
    Term = Expr ("+" Term)?;
    Expr = value;
  `;
  expect(() => right.compile()).not.toThrow();
  const left = lang`
    Term = Term ("-" Expr)?;
    Expr = value;
  `;
  expect(() => left.compile()).toThrow();
});

test("repeaters", () => {
  const list = lang`
    Expr  = #( Expr* )
          | identifier
  `;
  expect(list`(foo bar (baz quux) xyzzy)`).toEqual([
    "foo",
    "bar",
    ["baz", "quux"],
    "xyzzy",
  ]);

  const nonEmptyList = lang`
    Expr  = #( Expr+ )
          | identifier
  `;
  expect(nonEmptyList`(foo bar (baz quux) xyzzy)`).toEqual([
    "foo",
    "bar",
    ["baz", "quux"],
    "xyzzy",
  ]);
  expect(() => nonEmptyList`()`).toThrow();

  expect(() => lang`Main = (value?)*`.compile()).toThrow();
});

test("if else", () => {
  const ifElse = lang`
    IfElse = "if" Block ("else" (IfElse | Block))?;
    Block = value;
  `;
  ifElse`if "foo"`;
  ifElse`if "foo" else "bar"`;
  ifElse`if "foo" else if "bar"`;
  ifElse`if "foo" else if "bar" else if "baz" else "quux"`;
});

test("interpolated parser", () => {
  const list = lang`Main = (include ${lang`Main = value`})+`;
  expect(list`1 2 3`).toEqual([1, 2, 3]);

  expect(() => lang`Main = include ${null}`.compile()).toThrow();
});

test("keyword and operator terminals", () => {
  const it = lang`
    Statement = "print" Expr;
    Expr      = DotExpr ("+" Expr)*;
    DotExpr   = RootExpr ("." (identifier | keyword))*;
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
  }).toThrow();
});

test("separators", () => {
  const list1 = lang`Rule = identifier ++ ","`;
  expect(list1`foo`).toEqual(["foo"]);
  expect(list1`foo,`).toEqual(["foo"]);
  expect(list1`foo, bar, baz`).toEqual(["foo", "bar", "baz"]);

  const list0 = lang`Rule = (identifier ** ",")`;
  expect(list0``).toEqual([]);
  expect(list0`foo`).toEqual(["foo"]);
  expect(list0`foo,`).toEqual(["foo"]);
  expect(list0`foo, bar, baz`).toEqual(["foo", "bar", "baz"]);
});

test("structures", () => {
  const fromPairs = (pairs) => pairs.reduce((l, r) => Object.assign(l, r), {});
  const json = lang`
    Expr = #{ Pair ** "," : ${fromPairs} }
         | #[ Expr ** "," ]
         | "true"   : ${() => true}
         | "false"  : ${() => false}
         | "null"   : ${() => null}
         | value;
    Pair = value ":" Expr : ${(k, _, v) => ({ [k]: v })}; 
  `;
  expect(json`{"foo": [123, "bar", true, false, null] }`).toEqual({
    foo: [123, "bar", true, false, null],
  });
});

test("unresolvable conflicts", () => {
  expect(() => lang`Main = value? value`.compile()).toThrow();
  expect(() =>
    lang`Main = value  ${() => "x"}| value ${() => "y"}`.compile()
  ).toThrow();
});
