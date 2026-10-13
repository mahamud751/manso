/** Bangladesh mobile numbers to E.164. Accepts 01XXXXXXXXX, 1XXXXXXXXX, 8801…, +8801…. */
export function normalizeBdPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('880')) local = local.slice(3);
  if (local.startsWith('0')) local = local.slice(1);
  if (!/^1[3-9]\d{8}$/.test(local)) return null;
  return `+880${local}`;
}
