/** Integer poisha. 1 BDT = 100 poisha. Half-up to the nearest poisha. */
export function lineTotalPoisha(grams: number, pricePerKgPoisha: number): number {
  if (!Number.isInteger(grams) || !Number.isInteger(pricePerKgPoisha)) {
    throw new Error('Money inputs must be integers');
  }
  if (grams < 0 || pricePerKgPoisha < 0) {
    throw new Error('Money inputs must be non-negative');
  }
  return Math.round((grams * pricePerKgPoisha) / 1000);
}

export function formatBdt(poisha: number): string {
  const negative = poisha < 0;
  const abs = Math.abs(poisha);
  const taka = abs / 100;
  const hasFraction = abs % 100 !== 0;
  const text = taka.toLocaleString('en-GB', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${negative ? '-' : ''}৳${text}`;
}
