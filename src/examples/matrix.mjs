import math from "mathjs";
import { grammar, op } from "../index.mjs";

const matrix = grammar`
  Main = Expr
  Row  = Expr+
  Expr = include ${(parent) => op`
    left "+" : ${math.add}
         "-" : ${math.subtract}
    left "*" : ${math.multiply}
         "/" : ${math.divide}
    post "T" : ${math.transpose}
    root ${parent.BaseExpr}
  `}
  BaseExpr = #[ Row ++ Sep ]
           | value
  Sep      = line | ";"
`;
export function skip_test_matrix_multiplication(expect) {
  const x = [
    [7, 1],
    [-2, 3],
  ];
  expect(
    matrix`
      [ 2 0 
        -1 3 ] * ${x}
    `
  ).toEqual([
    [14, 2],
    [-13, 8],
  ]);
}
