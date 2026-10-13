import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { colors, formatTaka, kgLabel, serif } from './theme';
import { Lang, Localized, Product } from './types';
import { t } from './i18n';
import { useStore } from './store';

export function tx(value: Localized | string | null | undefined, lang: Lang) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.en;
}

export function Bull({ size = 28, color = colors.orange }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size * 0.9} viewBox="0 0 100 90">
      <Path
        fill={color}
        d="M5 4Q2 28 26 30L37 35 34 48 42 75Q50 88 58 75L66 48 63 35 74 30Q98 28 95 4Q85 21 67 20L50 22 33 20Q15 21 5 4Z"
      />
      <Path fill={color} d="M34 39L18 35 24 47 37 49M66 39L82 35 76 47 63 49" />
    </Svg>
  );
}

export function Screen({
  children,
  footer,
  scroll = true,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { toast } = useStore();
  const body = scroll ? (
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding: 18 }}>{children}</View>
  );
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View> : null}
      {toast ? (
        <View style={[styles.toast, { bottom: (footer ? 88 : 24) + insets.bottom }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function TopBar({
  title,
  onBack,
  right,
}: {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { lang } = useStore();
  return (
    <View style={styles.top}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.iconBtn}>
          <Text style={styles.iconGlyph}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.brand}>
          <Bull />
          <Text style={styles.brandText}>MANSO</Text>
        </View>
      )}
      {title ? <Text style={styles.topTitle}>{title}</Text> : <View style={{ flex: 1 }} />}
      <View style={styles.topRight}>{right ?? <CartButton label={t('basket', lang)} />}</View>
    </View>
  );
}

export function CartButton({ onPress, label }: { onPress?: () => void; label: string }) {
  const { basketCount } = useStore();
  const navigation = useNavigation<any>();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress ?? (() => navigation.navigate('Basket'))} style={styles.iconBtn}>
      <Text style={styles.iconGlyph}>👜</Text>
      {basketCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{Math.round(basketCount)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  outline,
  disabled,
  loading,
}: {
  label: string;
  onPress?: () => void;
  outline?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.btn, outline && styles.btnOutline, (disabled || loading) && styles.btnDisabled]}>
      {loading ? <ActivityIndicator color={outline ? colors.orange : colors.white} /> : <Text style={[styles.btnText, outline && { color: colors.orange }]}>{label}</Text>}
    </Pressable>
  );
}

export function Pill({ text, tone = 'peach' }: { text: string; tone?: 'peach' | 'green' | 'dark' }) {
  return (
    <View style={[styles.pill, tone === 'green' && styles.pillGreen, tone === 'dark' && styles.pillDark]}>
      <Text style={[styles.pillText, tone === 'green' && { color: colors.green }, tone === 'dark' && { color: colors.white }]}>{text}</Text>
    </View>
  );
}

export function Qty({ value, onChange, step }: { value: number; onChange: (grams: number) => void; step: number }) {
  return (
    <View style={styles.qty}>
      <Pressable accessibilityLabel="Decrease" onPress={() => onChange(Math.max(0, value - step))} style={styles.qtyBtn}>
        <Text style={styles.qtyGlyph}>–</Text>
      </Pressable>
      <Text style={styles.qtyValue}>{kgLabel(value)}</Text>
      <Pressable accessibilityLabel="Increase" onPress={() => onChange(value + step)} style={[styles.qtyBtn, styles.qtyBtnOn]}>
        <Text style={[styles.qtyGlyph, { color: colors.white }]}>+</Text>
      </Pressable>
    </View>
  );
}

export function ProductCard({
  product,
  lang,
  onOpen,
  onAdd,
}: {
  product: Product;
  lang: Lang;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <Pressable onPress={onOpen} style={styles.product}>
      {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.photo} /> : <View style={styles.photo} />}
      <View style={{ padding: 12, gap: 4 }}>
        <Text style={styles.productName}>{tx(product.name, lang)}</Text>
        <Text style={styles.price}>
          {formatTaka(product.pricePerKgPoisha)}
          {t('perKg', lang)}
        </Text>
        <View style={styles.row}>
          <Text style={styles.muted}>{product.inStock ? kgLabel(product.availableGrams) : t('soldOut', lang)}</Text>
          <Pressable accessibilityLabel={t('add', lang)} onPress={onAdd} style={styles.add}>
            <Text style={styles.addText}>+ {t('add', lang)}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboard,
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboard?: 'default' | 'phone-pad' | 'number-pad';
}) {
  return (
    <View style={{ gap: 6, marginVertical: 8 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboard}
        style={styles.input}
      />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  footer: { paddingHorizontal: 18, paddingTop: 8, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line },
  toast: { position: 'absolute', left: 16, right: 16, backgroundColor: colors.dark, borderRadius: 13, padding: 14 },
  toastText: { color: colors.white, fontWeight: '600' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, minHeight: 44 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { ...serif, fontSize: 22, color: colors.orange, letterSpacing: -0.5 },
  topTitle: { ...serif, fontSize: 20, color: colors.dark, flex: 1, textAlign: 'center' },
  topRight: { minWidth: 44, alignItems: 'flex-end' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  iconGlyph: { fontSize: 22, color: colors.dark, marginTop: -2 },
  badge: { position: 'absolute', top: -2, right: -2, backgroundColor: colors.orange, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  btn: { backgroundColor: colors.orange, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginVertical: 6 },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.orange },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 16 },
  pill: { alignSelf: 'flex-start', backgroundColor: colors.peach, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  pillGreen: { backgroundColor: colors.greenBg },
  pillDark: { backgroundColor: colors.dark },
  pillText: { color: colors.orange, fontSize: 12, fontWeight: '700' },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 24, padding: 4, alignSelf: 'flex-start', backgroundColor: colors.white },
  qtyBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  qtyBtnOn: { backgroundColor: colors.orange },
  qtyGlyph: { color: colors.orange, fontSize: 20, fontWeight: '700' },
  qtyValue: { minWidth: 48, textAlign: 'center', fontWeight: '700', color: colors.dark },
  product: { flex: 1, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  photo: { height: 120, width: '100%', backgroundColor: colors.peach },
  productName: { fontWeight: '700', color: colors.dark },
  price: { color: colors.orange, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  muted: { color: colors.muted, fontSize: 13 },
  add: { backgroundColor: colors.orange, borderRadius: 12, paddingHorizontal: 10, minHeight: 36, justifyContent: 'center' },
  addText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  fieldLabel: { color: colors.dark, fontWeight: '600' },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, color: colors.dark },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 14, marginVertical: 8 },
  h1: { ...serif, fontSize: 34, lineHeight: 38, color: colors.dark, marginVertical: 8 },
});
