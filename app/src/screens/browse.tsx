import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, API_URL, ApiError } from '../api';
import { t, CopyKey } from '../i18n';
import { RootStackParamList, TabParamList } from '../nav';
import { useStore } from '../store';
import { colors, formatTaka, serif } from '../theme';
import { Product } from '../types';
import { Button, Card, CartButton, Field, Muted, Notice, Pill, ProductCard, Qty, Radio, Screen, TopBar, tx } from '../ui';

type Nav = CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, NativeStackNavigationProp<RootStackParamList>>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { lang, branch, notify, addCut, changeCut, basket } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!branch) return;
    api.products(branch.id, q).then(rows => setProducts(rows.slice(0, 4))).catch(error => notify(error instanceof ApiError ? error.message : t('offline', lang)));
  }, [branch, q, lang, notify]);

  return (
    <Screen>
      <TopBar right={<View style={{ flexDirection: 'row', gap: 8 }}><Pressable onPress={() => navigation.navigate('Account')} style={styles.round}><Text>☺</Text></Pressable><Pressable onPress={() => navigation.navigate('Notifications')} style={styles.round}><Text>🔔</Text></Pressable><CartButton label={t('basket', lang)} /></View>} />
      <Pressable onPress={() => navigation.navigate('Branch')} style={styles.loc}>
        <Text style={styles.locText}>📍 {branch ? branch.area : t('yourBranch', lang)} ▾</Text>
      </Pressable>
      <TextInput value={q} onChangeText={setQ} placeholder={t('searchCuts', lang)} placeholderTextColor={colors.muted} style={styles.search} />
      <Pressable onPress={() => navigation.navigate('Shop')} style={styles.heroWrap}>
        <Image source={{ uri: `${API_URL}/media/hero.jpg` }} style={styles.hero} />
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>{t('freshToday', lang)}{'\n'}{t('deliveredToday', lang)}</Text>
          <Text style={styles.heroSub}>{t('tagline', lang)}</Text>
          <Pressable onPress={() => navigation.navigate('Shop')} style={styles.heroBtn}><Text style={styles.heroBtnText}>{t('shopCuts', lang)} →</Text></Pressable>
        </View>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Live')} style={styles.liveSplit}>
        <View style={styles.liveCopy}>
          <Text style={styles.kicker}>● {t('liveDaily', lang)}</Text>
          <Text style={styles.liveTitle}>{t('watchOrder', lang)}</Text>
          <Text style={styles.liveSub}>{branch ? branch.name : 'Sylhet'}</Text>
        </View>
        <Image source={{ uri: `${API_URL}/media/live.jpg` }} style={styles.liveThumb} />
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Shop')}>
        <Card style={styles.deliveryRow}>
          <Text style={styles.deliveryIcon}>🚚</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.deliveryTitle}>{t('deliveryFrom', lang)}</Text>
            <Muted>{t('placeNow', lang)}</Muted>
          </View>
          <Text style={styles.chev}>›</Text>
        </Card>
      </Pressable>
      <View style={styles.rowBetween}>
        <Text style={styles.section}>{t('popular', lang)}</Text>
        <Pressable onPress={() => navigation.navigate('Shop')}><Text style={styles.link}>{t('viewAll', lang)}</Text></Pressable>
      </View>
      <View style={styles.grid}>
        {products.map(product => {
          const grams = basket.items.find(item => item.productId === product.id)?.grams || 0;
          return (
            <View key={product.id} style={styles.cell}>
              <ProductCard
                variant="home"
                product={product}
                lang={lang}
                grams={grams}
                onOpen={() => navigation.navigate('Product', { id: product.id })}
                onGrams={next => {
                  const existing = basket.items.some(item => item.productId === product.id);
                  const run = existing || next === 0 ? changeCut(product.id, next) : addCut(product, next, product.options[0]?.id);
                  run.then(() => { if (!existing && next > 0) notify(tx(product.name, lang)); }).catch(error => notify(error.message));
                }}
              />
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

export function ShopScreen() {
  const navigation = useNavigation<Nav>();
  const { lang, branch, notify, addCut, changeCut, basket } = useStore();
  const [kind, setKind] = useState('ALL');
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    if (!branch) return;
    api.products(branch.id, q, kind === 'ALL' ? undefined : kind).then(setProducts).catch(error => notify(error instanceof ApiError ? error.message : t('offline', lang)));
  }, [branch, q, kind, notify, lang]);
  const chips: { id: string; key: CopyKey }[] = [
    { id: 'ALL', key: 'all' },
    { id: 'BEEF', key: 'beef' },
    { id: 'MINCE', key: 'mince' },
    { id: 'BONELESS', key: 'boneless' },
  ];
  return (
    <Screen>
      <TopBar />
      <TextInput value={q} onChangeText={setQ} placeholder={t('searchCuts', lang)} placeholderTextColor={colors.muted} style={styles.search} />
      <View style={styles.chips}>
        {chips.map(chip => (
          <Pressable key={chip.id} onPress={() => setKind(chip.id)} style={[styles.chip, kind === chip.id && styles.chipOn]}>
            <Text style={[styles.chipText, kind === chip.id && { color: colors.white }]}>{t(chip.key, lang)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.grid}>
        {products.map(product => (
          <View key={product.id} style={styles.cell}>
            <ProductCard
              product={product}
              lang={lang}
              onOpen={() => navigation.navigate('Product', { id: product.id })}
              onAdd={() => {
                const existing = basket.items.find(item => item.productId === product.id);
                const grams = existing ? Math.min(product.maxGrams, existing.grams + product.incrementGrams) : product.minGrams;
                const run = existing ? changeCut(product.id, grams) : addCut(product, grams, product.options[0]?.id);
                run.then(() => notify(tx(product.name, lang))).catch(error => notify(String(error instanceof Error ? error.message : error)));
              }}
            />
          </View>
        ))}
      </View>
      {!products.length ? <Muted>{lang === 'bn' ? 'কোনো কাট পাওয়া যায়নি।' : 'No cuts found.'}</Muted> : null}
    </Screen>
  );
}

export function ProductScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Product'>) {
  const { lang, branch, addCut, notify, basket } = useStore();
  const [product, setProduct] = useState<Product | null>(null);
  const [grams, setGrams] = useState(1000);
  const [optionId, setOptionId] = useState<string | undefined>();
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!branch) return;
    api.product(route.params.id, branch.id).then(item => {
      setProduct(item);
      setGrams(item.minGrams);
      setOptionId(item.options[0]?.id);
    }).catch(error => notify(error instanceof ApiError ? error.message : t('offline', lang)));
  }, [branch, route.params.id, notify, lang]);
  if (!product) return <Screen><Muted>…</Muted></Screen>;
  const count = basket.items.length;
  return (
    <Screen footer={<Button label={t('addBasket', lang)} disabled={!product.inStock} onPress={() => addCut(product, grams, optionId, note).then(() => notify(tx(product.name, lang))).catch(error => notify(error.message))} />}>
      <TopBar title={tx(product.name, lang)} onBack={() => navigation.goBack()} />
      {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.detail} /> : null}
      <View style={styles.rowBetween}>
        <Text style={styles.name}>{tx(product.name, lang)}</Text>
        {product.batch ? <Pill text={`${product.batch.code} · ${product.batch.preparationDate}`} /> : null}
      </View>
      <Text style={styles.bigPrice}>{formatTaka(product.pricePerKgPoisha)} {t('perKg', lang)}</Text>
      <Muted>{tx(product.description, lang)}</Muted>
      {!product.inStock ? <Notice icon="!" title={t('soldOut', lang)} /> : null}
      <Text style={styles.label}>{t('quantity', lang)}</Text>
      <Qty wide value={grams} step={product.incrementGrams} min={product.minGrams} onChange={value => setGrams(Math.min(product.maxGrams, Math.max(product.minGrams, value || product.minGrams)))} />
      <Text style={styles.label}>{t('cutting', lang)}</Text>
      <View style={styles.optionGrid}>
        {product.options.map(option => {
          const on = optionId === option.id;
          return (
            <Pressable key={option.id} onPress={() => setOptionId(option.id)} style={[styles.option, on && styles.picked]}>
              <Radio on={on} />
              <Text style={styles.optionText}>{tx(option.name, lang)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label={t('notes', lang)} value={note} onChangeText={setNote} placeholder={t('notesPh', lang)} />
      <Notice icon="🚚" title={t('deliveryFrom', lang)} body={t('freshCut', lang)} />
      <Pressable onPress={() => navigation.navigate('Basket')}><Text style={styles.link}>{t('viewBasket', lang)} ({count})</Text></Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  loc: { alignSelf: 'flex-start', marginBottom: 8 },
  locText: { color: colors.dark, fontWeight: '700' },
  search: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, minHeight: 48, paddingHorizontal: 14, marginBottom: 12, color: colors.dark },
  heroWrap: { height: 210, borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  hero: { ...StyleSheet.absoluteFill, backgroundColor: colors.peach },
  heroCopy: { flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: '#1d211d88' },
  heroTitle: { ...serif, color: colors.white, fontSize: 28, lineHeight: 30 },
  heroSub: { color: '#FFE8D7', marginVertical: 6 },
  heroBtn: { alignSelf: 'flex-start', backgroundColor: colors.orange, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  heroBtnText: { color: colors.white, fontWeight: '700' },
  liveSplit: { flexDirection: 'row', backgroundColor: colors.orange, borderRadius: 18, overflow: 'hidden', minHeight: 124, marginBottom: 4 },
  liveCopy: { flex: 1, padding: 14, justifyContent: 'center' },
  liveThumb: { width: 124, minHeight: 124, backgroundColor: '#C2410C' },
  kicker: { color: '#FFE8D7', letterSpacing: 0.4, fontSize: 11, fontWeight: '700' },
  liveTitle: { ...serif, color: colors.white, fontSize: 26, lineHeight: 28, marginTop: 4 },
  liveSub: { color: colors.white, marginTop: 4, fontSize: 12 },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deliveryIcon: { fontSize: 18 },
  deliveryTitle: { fontWeight: '800', color: colors.dark },
  chev: { fontSize: 26, color: colors.muted, marginTop: -2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  section: { ...serif, fontSize: 22, color: colors.dark },
  link: { color: colors.orange, fontWeight: '700', padding: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: { width: '48%', marginBottom: 12 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  chipText: { fontWeight: '700', color: colors.dark },
  detail: { width: '100%', height: 230, borderRadius: 18, backgroundColor: colors.peach },
  name: { ...serif, fontSize: 28, color: colors.dark, flex: 1 },
  bigPrice: { color: colors.orange, fontSize: 26, fontWeight: '800', marginVertical: 6 },
  label: { fontWeight: '800', marginTop: 14, marginBottom: 8, color: colors.dark },
  picked: { borderColor: colors.orange, borderWidth: 1.5, backgroundColor: '#FFF7F2' },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 12, minHeight: 72 },
  optionText: { fontWeight: '700', color: colors.dark, flex: 1 },
});
