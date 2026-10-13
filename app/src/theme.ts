import { Platform, TextStyle } from 'react-native';

export const colors = {
  orange: '#ED4E0A',
  dark: '#252725',
  paper: '#FFFAF4',
  peach: '#FFF0E4',
  line: '#EADFD4',
  muted: '#73756F',
  white: '#FFFFFF',
  green: '#257936',
  greenBg: '#DFF2DF',
  danger: '#B42318',
  dangerBg: '#FDECEC',
};

export const serif: TextStyle = {
  fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
};

export function formatTaka(poisha: number | null | undefined) {
  if (poisha == null) return '—';
  const negative = poisha < 0;
  const abs = Math.abs(poisha);
  const text = (abs / 100).toLocaleString('en-GB', {
    minimumFractionDigits: abs % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${negative ? '-' : ''}৳${text}`;
}

export function lineTotal(grams: number, pricePerKgPoisha: number) {
  return Math.round((grams * pricePerKgPoisha) / 1000);
}

export function kgLabel(grams: number) {
  const kg = grams / 1000;
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
}
