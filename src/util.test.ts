import { showInContext } from "./util";

test("showInContext", () => {
  const id = <T>(x: T, ..._) => x;

  const example = id`
    The quick brown fox jumps over the lazy dog.
    How razorback jumping ${false} frogs level six piqued gymnasts!
    Sphinx of black quartz: judge my vow.
  `;

  expect(
    showInContext(example, { index: 68, outerIndex: 0, length: 14 })
  ).toEqual(
    [
      "    How razorback jumping ${...} frogs level six piqued gymnasts!",
      "                  ^^^^^^^^^^^^^^^^^^^^                           ",
    ].join("\n")
  );

  expect(
    showInContext(example, { index: 24, outerIndex: 1, length: 20 })
  ).toEqual(
    [
      "    How razorback jumping ${...} frogs level six piqued gymnasts!",
      "                                                        ^^^^^^^^^",
      "    Sphinx of black quartz: judge my vow.",
      "^^^^^^^^^^                               ",
    ].join("\n")
  );
});
