import { lang } from "./lang";
import { print } from "./core";

test("nil language", () => {
  const nil = lang`Main = nil`;
  expect(nil``).toEqual(null);
});

test("simple values", () => {
  const num = lang`Main = "return" value : ${(_, x) => x}`;
  expect(num`return 123`).toEqual(123);
});

test("recursive rules", () => {
  const math = lang`
    Neg   = "-" Expr : ${(_, value) => -value}
          | Expr;
    Expr  = #( Neg )
          | value
  `;
  expect(math`123`).toEqual(123);
  expect(math`-123`).toEqual(-123);
  expect(math`(123)`).toEqual(123);
  expect(math`-(-(123))`).toEqual(123);
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
});

test("if else", () => {
  const ifElse = lang`
    IfElse = "if" Block ("else" (IfElse | Block))?;
    Block = value
  `;
  ifElse`if "foo"`;
  ifElse`if "foo" else "bar"`;
  ifElse`if "foo" else if "bar"`;
  ifElse`if "foo" else if "bar" else if "baz" else "quux"`;
});

test("interpolated parser", () => {
  const list = lang`Main = (include ${lang`Main = value`})+`;
  expect(list`1 2 3`).toEqual([1, 2, 3]);
});
