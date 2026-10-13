import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { RootStackParamList } from '../nav';
import { useStore } from '../store';
import { colors, formatTaka, kgLabel, serif } from '../theme';
import { Address, Order, Quote, SlotOffer } from '../types';
import { Button, Card, Field, H1, Muted, Pill, Qty, Screen, TopBar, tx } from '../ui';

function moneyError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function place(address?: Record<string, string | null> | null) {
  if (!address) return '';
  return [address.line1, address.line2, address.area, address.city].filter(Boolean).join(', ');
}

export function BasketScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Basket'>) {
  const { lang, user, basket, refreshBasket, changeCut, notify, branch } = useStore();
  useEffect(() => {
    refreshBasket().catch(error => notify(moneyError(error, t('offline', lang))));
  }, [user?.id]);

  const go = () => {
    if (!basket.items.length) return;
    if (!user) {
      notify(t('signInCheckout', lang));
      navigation.navigate('SignIn', { next: 'Fulfil' });
      return;
    }
    navigation.navigate('Fulfil');
  };

  return (
    <Screen
      footer={
        <View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('subtotal', lang)}</Text>
            <Text style={styles.totalValue}>{formatTaka(basket.estimatedSubtotalPoisha)}</Text>
          </View>
          <Button label={`${t('continue', lang)} →`} onPress={go} disabled={!basket.items.length} />
        </View>
      }>
      <TopBar title={t('basket', lang)} onBack={() => navigation.goBack()} right={<View />} />
      <H1>{t('basket', lang)}</H1>
      {!basket.items.length ? <Muted>{t('emptyBasket', lang)}</Muted> : null}
      {basket.items.map(item => (
        <Card key={item.productId}>
          <View style={styles.line}>
            {item.product?.imageUrl ? <Image source={{ uri: item.product.imageUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.name}>{item.product ? tx(item.product.name, lang) : item.productId}</Text>
              {item.optionName ? <Muted>{tx(item.optionName, lang)}</Muted> : null}
              <Text style={styles.price}>{formatTaka(item.lineTotalPoisha)}</Text>
              {!item.available ? <Text style={styles.warn}>{t('soldOut', lang)}</Text> : null}
            </View>
          </View>
          <View style={styles.lineActions}>
            <Qty
              value={item.grams}
              step={item.product?.incrementGrams || 500}
              onChange={grams => {
                const step = item.product?.incrementGrams || 500;
                const min = item.product?.minGrams || step;
                const max = item.product?.maxGrams || grams;
                const next = grams === 0 ? 0 : Math.min(max, Math.max(min, grams));
                changeCut(item.productId, next).catch(error => notify(moneyError(error, t('offline', lang))));
              }}
            />
            <Pressable onPress={() => changeCut(item.productId, 0).catch(error => notify(error.message))}>
              <Text style={styles.link}>{lang === 'bn' ? 'বাদ দিন' : 'Remove'}</Text>
            </Pressable>
          </View>
        </Card>
      ))}
      {!basket.items.length ? (
        <Button label={t('shopCuts', lang)} outline onPress={() => navigation.navigate('Main', { screen: 'Shop' })} />
      ) : null}
      {branch ? <Muted>{branch.name}</Muted> : null}
    </Screen>
  );
}

export function FulfilScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Fulfil'>) {
  const { lang, branch, user, basket, addresses, refreshAddresses, addAddress, notify } = useStore();
  const [mode, setMode] = useState<'DELIVERY' | 'COLLECTION'>('DELIVERY');
  const [offer, setOffer] = useState<SlotOffer | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [label, setLabel] = useState('Home');
  const [line1, setLine1] = useState('');
  const [area, setArea] = useState(branch?.zones[0]?.name || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) refreshAddresses().catch(() => undefined);
  }, [user?.id]);

  useEffect(() => {
    if (!addresses.length) return;
    const preferred = addresses.find(item => item.isDefault) || addresses[0];
    setAddressId(current => current || preferred.id);
  }, [addresses]);

  useEffect(() => {
    if (!branch) return;
    setSlotId(null);
    api
      .slots(branch.id, mode)
      .then(next => {
        setOffer(next);
        setSlotId(next.slots[0]?.id ?? null);
      })
      .catch(error => notify(moneyError(error, t('offline', lang))));
  }, [branch?.id, mode, lang]);

  const saveAddress = async () => {
    if (!line1.trim() || !area.trim()) {
      notify(lang === 'bn' ? 'ঠিকানা ও এলাকা দিন' : 'Add a street and area');
      return;
    }
    setBusy(true);
    try {
      const created = await addAddress({
        label: label.trim() || 'Home',
        line1: line1.trim(),
        area: area.trim(),
        city: branch?.city || 'Sylhet',
        isDefault: addresses.length === 0,
      });
      setAddressId(created.id);
      setLine1('');
      notify(t('saved', lang));
    } catch (error) {
      notify(moneyError(error, t('offline', lang)));
    } finally {
      setBusy(false);
    }
  };

  const hold = async () => {
    if (!branch || !user || !offer || !slotId) return;
    if (mode === 'DELIVERY' && !addressId) {
      notify(lang === 'bn' ? 'একটি ঠিকানা বেছে নিন' : 'Choose an address');
      return;
    }
    if (basket.estimatedSubtotalPoisha < offer.minOrderPoisha && mode === 'DELIVERY') {
      notify(`${lang === 'bn' ? 'সর্বনিম্ন অর্ডার' : 'Minimum order'} ${formatTaka(offer.minOrderPoisha)}`);
      return;
    }
    setBusy(true);
    try {
      const quote = await api.quote({
        branchId: branch.id,
        mode,
        slotTemplateId: slotId,
        serviceDate: offer.serviceDate,
        addressId: mode === 'DELIVERY' ? addressId : undefined,
      });
      navigation.navigate('Payment', { quoteId: quote.id });
    } catch (error) {
      notify(moneyError(error, t('offline', lang)));
    } finally {
      setBusy(false);
    }
  };

  const fee = mode === 'COLLECTION' ? 0 : zoneFee(branch?.zones || [], addresses.find(item => item.id === addressId), branch?.deliveryFeePoisha || 0);

  return (
    <Screen footer={<Button label={`${t('toPayment', lang)} →`} onPress={hold} loading={busy} disabled={!slotId} />}>
      <TopBar title={mode === 'DELIVERY' ? t('delivery', lang) : t('collection', lang)} onBack={() => navigation.goBack()} right={<View />} />
      <View style={styles.modeRow}>
        <Pressable onPress={() => setMode('DELIVERY')} style={[styles.mode, mode === 'DELIVERY' && styles.modeOn]}>
          <Text style={[styles.modeText, mode === 'DELIVERY' && styles.modeTextOn]}>{t('delivery', lang)}</Text>
        </Pressable>
        <Pressable onPress={() => setMode('COLLECTION')} style={[styles.mode, mode === 'COLLECTION' && styles.modeOn]}>
          <Text style={[styles.modeText, mode === 'COLLECTION' && styles.modeTextOn]}>{t('collection', lang)}</Text>
        </Pressable>
      </View>
      {mode === 'DELIVERY' ? (
        <View>
          <Text style={styles.section}>{t('address', lang)}</Text>
          {addresses.map(item => (
            <AddressCard key={item.id} address={item} selected={item.id === addressId} onPress={() => setAddressId(item.id)} />
          ))}
          <Card>
            <Field label={lang === 'bn' ? 'নাম' : 'Label'} value={label} onChangeText={setLabel} />
            <Field label={lang === 'bn' ? 'রাস্তা' : 'Street'} value={line1} onChangeText={setLine1} placeholder="House 12, Road 4" />
            <Muted>{lang === 'bn' ? 'ডেলিভারি এলাকা' : 'Covered area'}</Muted>
            <View style={styles.chips}>
              {(branch?.zones || []).map(zone => (
                <Pressable key={zone.id} onPress={() => setArea(zone.name)} style={[styles.chip, area === zone.name && styles.chipOn]}>
                  <Text style={[styles.chipText, area === zone.name && styles.chipTextOn]}>{zone.name}</Text>
                </Pressable>
              ))}
            </View>
            <Button label={lang === 'bn' ? 'ঠিকানা সেভ' : 'Save address'} outline onPress={saveAddress} loading={busy} />
          </Card>
        </View>
      ) : (
        <Card>
          <Text style={styles.name}>{branch?.name}</Text>
          <Muted>{branch?.addressLine}</Muted>
          <Muted>{lang === 'bn' ? `সংগ্রহ ${branch?.collectionOpensAt} থেকে` : `Collection from ${branch?.collectionOpensAt}`}</Muted>
        </Card>
      )}
      <Text style={styles.section}>{t('selectTime', lang)}</Text>
      {offer?.movedToNextDay ? (
        <Card style={{ backgroundColor: colors.peach }}>
          <Text style={styles.name}>{lang === 'bn' ? 'আজকের সময় শেষ। আগামীকাল।' : 'Today is finished. Showing tomorrow.'}</Text>
        </Card>
      ) : null}
      <Muted>
        {mode === 'DELIVERY'
          ? `${t('deliveryFrom', lang)} · ${t('fee', lang)} ${formatTaka(fee)}`
          : `${t('collectionFee', lang)} · ${formatTaka(0)}`}
      </Muted>
      {(offer?.slots || []).map(slot => (
        <Pressable key={`${slot.id}-${slot.serviceDate}`} onPress={() => setSlotId(slot.id)} style={[styles.slot, slotId === slot.id && styles.slotOn]}>
          <Text style={styles.name}>{slot.label}</Text>
          <Muted>{slot.remaining} {lang === 'bn' ? 'খালি' : 'left'}</Muted>
        </Pressable>
      ))}
      {!offer?.slots.length ? <Muted>{lang === 'bn' ? 'এই মুহূর্তে কোনো স্লট নেই' : 'No slots are open right now'}</Muted> : null}
    </Screen>
  );
}

function zoneFee(
  zones: { name: string; feePoisha: number }[],
  address: Address | undefined,
  fallback: number,
) {
  if (!address) return fallback;
  const zone = zones.find(item => item.name.toLowerCase() === address.area.toLowerCase());
  return zone?.feePoisha ?? fallback;
}

function AddressCard({ address, selected, onPress }: { address: Address; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.slot, selected && styles.slotOn]}>
      <Text style={styles.name}>{address.label}</Text>
      <Muted>{address.line1}, {address.area}</Muted>
    </Pressable>
  );
}

export function PaymentScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Payment'>) {
  const { lang, notify, refreshBasket } = useStore();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState<'BKASH' | 'CARD' | 'CASH'>('BKASH');
  const [agreed, setAgreed] = useState(false);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);
  const idempotency = useRef(`app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const load = () => {
    api.quoteById(route.params.quoteId).then(setQuote).catch(error => notify(moneyError(error, t('offline', lang))));
  };
  useEffect(load, [route.params.quoteId]);
  useEffect(() => {
    if (!quote) return;
    const tick = () => setLeft(Math.max(0, new Date(quote.expiresAt).getTime() - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [quote?.expiresAt]);

  const placeOrder = async () => {
    if (!quote || !agreed || left <= 0) return;
    setBusy(true);
    try {
      const order = await api.order({ quoteId: quote.id, method, termsAccepted: true }, idempotency.current);
      await refreshBasket();
      if (method === 'CASH') navigation.replace('Result', { orderId: order.id });
      else setPlaced(order);
    } catch (error) {
      notify(moneyError(error, t('offline', lang)));
    } finally {
      setBusy(false);
    }
  };

  const sandbox = async (outcome: 'PAID' | 'FAILED') => {
    if (!placed) return;
    setBusy(true);
    try {
      const result = await api.sandbox(placed.id, outcome);
      navigation.replace('Result', { orderId: result.order.id });
    } catch (error) {
      notify(moneyError(error, t('offline', lang)));
    } finally {
      setBusy(false);
    }
  };

  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);

  return (
    <Screen
      footer={
        placed ? null : (
          <Button
            label={method === 'CASH' ? t('placeOrder', lang) : `${t('pay', lang)} ${quote ? formatTaka(quote.totalPoisha) : ''}`}
            onPress={placeOrder}
            loading={busy}
            disabled={!agreed || left <= 0}
          />
        )
      }>
      <TopBar title={t('payment', lang)} onBack={() => navigation.goBack()} right={<View />} />
      {quote ? (
        <Card style={{ backgroundColor: colors.peach }}>
          <Text style={styles.name}>{t('hold', lang)} {mins}:{String(secs).padStart(2, '0')}</Text>
          <Muted>{quote.slotLabel} · {quote.serviceDate}</Muted>
          <Muted>{place(quote.address)}</Muted>
        </Card>
      ) : null}
      <Text style={styles.section}>{t('summary', lang)}</Text>
      {(quote?.lines || []).map(line => (
        <View key={line.productId} style={styles.summaryLine}>
          <Text style={styles.name}>{line.productName}</Text>
          <Text>{kgLabel(line.grams)} · {formatTaka(line.lineTotalPoisha)}</Text>
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text>{t('subtotal', lang)}</Text>
        <Text>{formatTaka(quote?.subtotalPoisha)}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text>{quote?.mode === 'COLLECTION' ? t('collectionFee', lang) : t('fee', lang)}</Text>
        <Text>{formatTaka(quote?.feePoisha)}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('total', lang)}</Text>
        <Text style={styles.totalValue}>{formatTaka(quote?.totalPoisha)}</Text>
      </View>
      <Text style={styles.section}>{t('method', lang)}</Text>
      {(['BKASH', 'CARD', 'CASH'] as const).map(item => (
        <Pressable key={item} onPress={() => setMethod(item)} style={[styles.slot, method === item && styles.slotOn]}>
          <Text style={styles.name}>{item === 'BKASH' ? t('bkash', lang) : item === 'CARD' ? t('card', lang) : t('cash', lang)}</Text>
          {method === item ? <Pill text="✓" /> : null}
        </Pressable>
      ))}
      <Pressable onPress={() => setAgreed(value => !value)} style={styles.agree}>
        <View style={[styles.box, agreed && styles.boxOn]}>{agreed ? <Text style={{ color: colors.white }}>✓</Text> : null}</View>
        <Text style={{ flex: 1 }}>{t('agree', lang)}</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('Policy', { slug: 'terms' })}>
        <Text style={styles.link}>{t('terms', lang)}</Text>
      </Pressable>
      {placed ? (
        <Card>
          <Text style={styles.section}>{t('sandbox', lang)}</Text>
          <Muted>{t('sandboxHint', lang)}</Muted>
          <Button label={t('paidNow', lang)} onPress={() => sandbox('PAID')} loading={busy} />
          <Button label={t('failPay', lang)} outline onPress={() => sandbox('FAILED')} />
        </Card>
      ) : null}
    </Screen>
  );
}

export function ResultScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Result'>) {
  const { lang, notify } = useStore();
  const [order, setOrder] = useState<Order | null>(null);
  useEffect(() => {
    api.orderById(route.params.orderId).then(setOrder).catch(error => notify(moneyError(error, t('offline', lang))));
  }, [route.params.orderId]);

  const title =
    order?.paymentState === 'PAID'
      ? t('success', lang)
      : order?.paymentState === 'CASH_DUE'
        ? t('cashDue', lang)
        : order?.paymentState === 'FAILED'
          ? t('failed', lang)
          : t('pending', lang);

  return (
    <Screen
      footer={
        <View>
          <Button label={t('viewOrder', lang)} onPress={() => order && navigation.replace('Order', { id: order.id })} disabled={!order} />
          <Button label={t('keepShopping', lang)} outline onPress={() => navigation.navigate('Main', { screen: 'Shop' })} />
        </View>
      }>
      <View style={{ alignItems: 'center', paddingTop: 28 }}>
        <Text style={styles.mark}>{order?.paymentState === 'FAILED' ? '!' : '✓'}</Text>
        <H1>{title}</H1>
        {order ? <Text style={styles.orderNo}>#{order.number}</Text> : null}
        <Muted>{order ? `${order.slotLabel} · ${formatTaka(order.totalPoisha)}` : ''}</Muted>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: colors.peach },
  name: { fontWeight: '700', color: colors.dark },
  price: { color: colors.orange, fontWeight: '800' },
  warn: { color: colors.danger, fontWeight: '700' },
  lineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  link: { color: colors.orange, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  totalLabel: { fontWeight: '800', color: colors.dark },
  totalValue: { ...serif, fontSize: 22, color: colors.dark },
  modeRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  mode: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  modeOn: { backgroundColor: colors.dark, borderColor: colors.dark },
  modeText: { fontWeight: '700', color: colors.dark },
  modeTextOn: { color: colors.white },
  section: { ...serif, fontSize: 22, color: colors.dark, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.peach, borderColor: colors.orange },
  chipText: { color: colors.dark },
  chipTextOn: { color: colors.orange, fontWeight: '700' },
  slot: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, marginVertical: 6, backgroundColor: colors.white, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotOn: { borderColor: colors.orange, backgroundColor: colors.peach },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 },
  agree: { flexDirection: 'row', gap: 10, alignItems: 'center', marginVertical: 12 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.orange, borderColor: colors.orange },
  mark: { fontSize: 48, color: colors.orange, fontWeight: '800' },
  orderNo: { ...serif, fontSize: 28, color: colors.dark },
});
