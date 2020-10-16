import { lang } from "./lang";

test("nil language", () => {
  const nil = lang``;
  expect(nil``).toEqual(null);
});

test("simple values", () => {
  const num = lang`"return" value : ${(_, x) => x}`;
  expect(num`return 123`).toEqual(123);
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

test.skip("repeaters", () => {
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

test("interpolated parser", () => {
  const list = lang`(include ${lang`value`})+`;
  expect(list`1 2 3`).toEqual([1, 2, 3]);
});
