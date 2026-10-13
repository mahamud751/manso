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
import { Button, Card, CartButton, Field, Muted, Pill, ProductCard, Qty, Screen, TopBar, tx } from '../ui';

type Nav = CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, NativeStackNavigationProp<RootStackParamList>>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { lang, branch, notify, addCut } = useStore();
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
      <Pressable onPress={() => navigation.navigate('Live')} style={styles.liveCard}>
        <Text style={styles.kicker}>{t('liveDaily', lang).toUpperCase()}</Text>
        <Text style={styles.liveTitle}>{t('watchOrder', lang)}</Text>
        <Text style={styles.liveSub}>{branch ? branch.name : 'Sylhet'}</Text>
      </Pressable>
      <Card style={{ backgroundColor: colors.peach }}>
        <Text style={{ fontWeight: '800' }}>🚚 {t('deliveryFrom', lang)}</Text>
        <Muted>{lang === 'bn' ? 'অথবা শাখা থেকে সংগ্রহ করুন।' : 'Or collect from your branch.'}</Muted>
      </Card>
      <View style={styles.rowBetween}>
        <Text style={styles.section}>{t('popular', lang)}</Text>
        <Pressable onPress={() => navigation.navigate('Shop')}><Text style={styles.link}>{t('viewAll', lang)}</Text></Pressable>
      </View>
      <View style={styles.grid}>
        {products.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            lang={lang}
            onOpen={() => navigation.navigate('Product', { id: product.id })}
            onAdd={() => addCut(product, product.minGrams, product.options[0]?.id).then(() => notify(`${tx(product.name, lang)} added`)).catch(error => notify(error.message))}
          />
        ))}
      </View>
    </Screen>
  );
}

export function ShopScreen() {
  const navigation = useNavigation<Nav>();
  const { lang, branch, notify, addCut } = useStore();
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
          <ProductCard key={product.id} product={product} lang={lang} onOpen={() => navigation.navigate('Product', { id: product.id })} onAdd={() => addCut(product, product.minGrams, product.options[0]?.id).then(() => notify(tx(product.name, lang))).catch(error => notify(String(error.message || error)))} />
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
      {!product.inStock ? <Card style={{ backgroundColor: colors.peach }}><Text style={{ color: colors.orange, fontWeight: '800' }}>{t('soldOut', lang)}</Text></Card> : null}
      <Text style={styles.label}>{t('quantity', lang)}</Text>
      <Qty value={grams} step={product.incrementGrams} onChange={value => setGrams(Math.min(product.maxGrams, Math.max(product.minGrams, value)))} />
      <Text style={styles.label}>{t('cutting', lang)}</Text>
      {product.options.map(option => (
        <Pressable key={option.id} onPress={() => setOptionId(option.id)}>
          <Card style={optionId === option.id ? styles.picked : undefined}>
            <Text style={{ fontWeight: '700' }}>{optionId === option.id ? '● ' : '○ '}{tx(option.name, lang)}</Text>
          </Card>
        </Pressable>
      ))}
      <Field label={t('notes', lang)} value={note} onChangeText={setNote} placeholder={t('notesPh', lang)} />
      <Card style={{ backgroundColor: colors.peach }}><Text>🚚 {t('deliveryFrom', lang)}</Text></Card>
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
  liveCard: { backgroundColor: colors.orange, borderRadius: 18, padding: 16, marginBottom: 4 },
  kicker: { color: '#FFE8D7', letterSpacing: 1, fontSize: 11, fontWeight: '700' },
  liveTitle: { ...serif, color: colors.white, fontSize: 28 },
  liveSub: { color: colors.white },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  section: { ...serif, fontSize: 22, color: colors.dark },
  link: { color: colors.orange, fontWeight: '700', padding: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  chipText: { fontWeight: '700', color: colors.dark },
  detail: { width: '100%', height: 230, borderRadius: 18, backgroundColor: colors.peach },
  name: { ...serif, fontSize: 28, color: colors.dark, flex: 1 },
  bigPrice: { color: colors.orange, fontSize: 26, fontWeight: '800', marginVertical: 6 },
  label: { fontWeight: '800', marginTop: 14, marginBottom: 8, color: colors.dark },
  picked: { borderColor: colors.orange, borderWidth: 2 },
});
