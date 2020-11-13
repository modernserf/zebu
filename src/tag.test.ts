import { tag } from './tag';

test('tag helper', () => {
  const letNode = tag`let _ binding _ expr`;
  expect(letNode('let', 'x', '=', 'foo')).toEqual({
    type: 'let',
    binding: 'x',
    expr: 'foo',
  });
});

test('tag helper with default values', () => {
  const trueNode = tag`value value = ${true}`;
  expect(trueNode()).toEqual({ type: 'value', value: true });
});
