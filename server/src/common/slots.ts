import { dhakaParts } from './time';

export type SlotMode = 'DELIVERY' | 'COLLECTION';

export type SlotTemplateInput = {
  id: string;
  mode: SlotMode;
  label: string;
  startMinutes: number;
  endMinutes: number;
  capacity: number;
};

export type OfferedSlot = SlotTemplateInput & {
  serviceDate: string;
  remaining: number;
};

/**
 * Delivery slots never start before the branch delivery open time (default 14:00).
 * A slot that has already started is not offered. Full slots are omitted.
 */
export function selectableSlots(args: {
  now: Date;
  today: string;
  date: string;
  mode: SlotMode;
  deliveryStartMinutes: number;
  templates: SlotTemplateInput[];
  booked: Record<string, number>;
}): OfferedSlot[] {
  const parts = dhakaParts(args.now);
  const nowMinutes = parts.hour * 60 + parts.minute;

  const isToday = args.date === args.today;
  const out: OfferedSlot[] = [];
  for (const template of args.templates) {
    if (template.mode !== args.mode) continue;
    if (args.mode === 'DELIVERY' && template.startMinutes < args.deliveryStartMinutes) continue;
    if (isToday && nowMinutes >= template.startMinutes) continue;
    const used = args.booked[`${template.id}|${args.date}`] ?? 0;
    if (used >= template.capacity) continue;
    out.push({
      ...template,
      serviceDate: args.date,
      remaining: template.capacity - used,
    });
  }
  return out.sort((a, b) => a.startMinutes - b.startMinutes);
}

export function parseClock(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}
