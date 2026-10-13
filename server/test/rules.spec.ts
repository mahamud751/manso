import { describe, expect, it } from '@jest/globals';
import { lineTotalPoisha, formatBdt } from '../src/common/money';
import { selectableSlots } from '../src/common/slots';
import { normalizeBdPhone } from '../src/common/phone';

describe('money', () => {
  it('prices a kilogram and a half kilogram in poisha', () => {
    expect(lineTotalPoisha(1000, 75000)).toBe(75000);
    expect(lineTotalPoisha(500, 95000)).toBe(47500);
    expect(formatBdt(176000)).toBe('৳1,760');
  });
});

describe('phones', () => {
  it('accepts local and international Bangladesh mobiles', () => {
    expect(normalizeBdPhone('01712345678')).toBe('+8801712345678');
    expect(normalizeBdPhone('+880 1712-345678')).toBe('+8801712345678');
    expect(normalizeBdPhone('12345')).toBeNull();
  });
});

describe('slots', () => {
  const templates = [
    { id: 'early', mode: 'DELIVERY' as const, label: '12–2 pm', startMinutes: 12 * 60, endMinutes: 14 * 60, capacity: 4 },
    { id: 'two', mode: 'DELIVERY' as const, label: '2–4 pm', startMinutes: 14 * 60, endMinutes: 16 * 60, capacity: 4 },
    { id: 'four', mode: 'DELIVERY' as const, label: '4–6 pm', startMinutes: 16 * 60, endMinutes: 18 * 60, capacity: 1 },
  ];

  it('offers 2 pm at 10:30 and never a delivery before 2 pm', () => {
    const slots = selectableSlots({
      now: new Date('2026-10-13T04:30:00.000Z'),
      today: '2026-10-13',
      date: '2026-10-13',
      mode: 'DELIVERY',
      deliveryStartMinutes: 14 * 60,
      templates,
      booked: {},
    });
    expect(slots.map((slot) => slot.label)).toEqual(['2–4 pm', '4–6 pm']);
    expect(slots.every((slot) => slot.startMinutes >= 14 * 60)).toBe(true);
  });

  it('hides a full slot and a slot that already started', () => {
    const slots = selectableSlots({
      now: new Date('2026-10-13T09:30:00.000Z'),
      today: '2026-10-13',
      date: '2026-10-13',
      mode: 'DELIVERY',
      deliveryStartMinutes: 14 * 60,
      templates,
      booked: { 'four|2026-10-13': 1 },
    });
    expect(slots.map((slot) => slot.id)).toEqual([]);
  });
});
