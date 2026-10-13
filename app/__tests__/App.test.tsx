import { formatTaka, lineTotal } from '../src/theme';

test('money stays in integer poisha until display', () => {
  expect(formatTaka(75000)).toBe('৳750');
  expect(formatTaka(7550)).toBe('৳75.50');
  expect(lineTotal(1500, 95000)).toBe(142500);
});
