import { lang } from "./lang";
import { op } from "./operator";

test("operator", () => {
  const math = op`
    left  "+"   : ${(l, r) => l + r}
          "-"   : ${(l, r) => l - r}
    left  "*"   : ${(l, r) => l * r}
          "/"   : ${(l, r) => l / r}
          "%"   : ${(l, r) => l % r}
    right "**"  : ${(l, r) => l ** r}
    pre   "-"   : ${(x) => -x}
    post  "++"  : ${(x) => x + 1}
          "--"  : ${(x) => x - 1}
  `;
  expect(math`3 * 4 / 5 * 6`).toEqual(((3 * 4) / 5) * 6);
  expect(math`3 * (4 / 5) * 6`).toEqual(3 * (4 / 5) * 6);
  expect(math`
    1
    + 2
    * 3
    - 4`).toEqual(1 + 2 * 3 - 4);
  expect(math`2 ** 3 ** 2`).toEqual(2 ** (3 ** 2));
});

test("operator invalid syntax", () => {
  expect(() => {
    op`left "a>" : ${(l, r) => l + r}`.compile();
  }).toThrow();
  expect(() => {
    op`left ${1} : ${(l, r) => l + r}`.compile();
  }).toThrow();
  expect(() => {
    op`
    left  "+"   : ${(l, r) => l + r}
          "+"   : ${(l, r) => l - r}
  `.compile();
  }).toThrow();
});

test("operator parser include", () => {
  const expr = lang`
    Expr = include ${op`
      left "++" : ${(xs, ys) => xs.concat(ys)}
      root RootExpr
    `};
    RootExpr  = #[ Expr ** "," ]
              | value;
  `;
  expect(expr`["foo", "bar"] ++ ["baz"]`).toEqual(["foo", "bar", "baz"]);
});

test("operator longest match first", () => {
  const eq = op`
    left  "is"        : ${(l, r) => l === r}
          "is" "not"  : ${(l, r) => l !== r}
    pre   "not"       : ${(l) => !l}
  `;
  expect(eq`4 is 4`).toEqual(true);
  expect(eq`4 is not 3`).toEqual(true);
  expect(eq`4 is (not 3)`).toEqual(false);
});
