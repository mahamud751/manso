import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { RootStackParamList, TabParamList } from '../nav';
import { useStore } from '../store';
import { colors, formatTaka, kgLabel, serif } from '../theme';
import { Order } from '../types';
import { Button, Card, H1, Muted, Pill, Screen, TopBar } from '../ui';

type TabNav = CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, NativeStackNavigationProp<RootStackParamList>>;

const statusCopy: Record<string, { en: string; bn: string }> = {
  RECEIVED: { en: 'Received', bn: 'গৃহীত' },
  ACCEPTED: { en: 'Accepted', bn: 'গ্রহণ' },
  PREPARING: { en: 'Preparing', bn: 'প্রস্তুত হচ্ছে' },
  READY: { en: 'Ready', bn: 'প্রস্তুত' },
  OUT_FOR_DELIVERY: { en: 'Out for delivery', bn: 'পথে' },
  DELIVERED: { en: 'Delivered', bn: 'পৌঁছেছে' },
  COLLECTED: { en: 'Collected', bn: 'সংগৃহীত' },
  CANCELLED: { en: 'Cancelled', bn: 'বাতিল' },
  FAILED: { en: 'Failed', bn: 'ব্যর্থ' },
};

function labelStatus(status: string, lang: 'en' | 'bn') {
  return statusCopy[status]?.[lang] || status;
}

function say(error: unknown) {
  return error instanceof ApiError ? error.message : 'Request failed';
}

export function OrdersScreen() {
  const navigation = useNavigation<TabNav>();
  const { lang, user, notify, refreshBasket } = useStore();
  const [scope, setScope] = useState<'active' | 'past'>('active');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!user) return;
    setLoading(true);
    api.orders(scope).then(setOrders).catch(error => notify(say(error))).finally(() => setLoading(false));
  };
  useEffect(load, [scope, user?.id]);

  const reorder = async (id: string) => {
    try {
      const result = await api.reorder(id);
      await refreshBasket();
      if (result.warnings.length) notify(result.warnings[0]);
      navigation.navigate('Basket');
    } catch (error) {
      notify(say(error));
    }
  };

  return (
    <Screen>
      <TopBar title={t('orders', lang)} />
      {!user ? (
        <View>
          <H1>{t('orders', lang)}</H1>
          <Muted>{t('signInCheckout', lang)}</Muted>
          <Button label={t('signIn', lang)} onPress={() => navigation.navigate('SignIn')} />
        </View>
      ) : (
        <View>
          <View style={styles.modeRow}>
            <Pressable onPress={() => setScope('active')} style={[styles.mode, scope === 'active' && styles.modeOn]}>
              <Text style={[styles.modeText, scope === 'active' && styles.modeTextOn]}>{t('active', lang)}</Text>
            </Pressable>
            <Pressable onPress={() => setScope('past')} style={[styles.mode, scope === 'past' && styles.modeOn]}>
              <Text style={[styles.modeText, scope === 'past' && styles.modeTextOn]}>{t('past', lang)}</Text>
            </Pressable>
          </View>
          {!orders.length && !loading ? <Muted>{t('emptyOrders', lang)}</Muted> : null}
          {orders.map(order => (
            <Pressable key={order.id} onPress={() => navigation.navigate('Order', { id: order.id })}>
              <Card>
                <View style={styles.row}>
                  <Text style={styles.no}>#{order.number}</Text>
                  <Pill text={labelStatus(order.status, lang)} />
                </View>
                <Muted>{order.slotLabel} · {order.serviceDate}</Muted>
                <Text style={styles.price}>{formatTaka(order.totalPoisha)}</Text>
                <View style={styles.row}>
                  <Muted>{order.lines.length} {lang === 'bn' ? 'কাট' : 'cuts'}</Muted>
                  {scope === 'past' ? (
                    <Pressable onPress={() => reorder(order.id)}>
                      <Text style={styles.link}>{t('reorder', lang)}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

export function OrderScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Order'>) {
  const { lang, notify } = useStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.orderById(route.params.id).then(setOrder).catch(error => notify(say(error)));
  useEffect(() => {
    load();
  }, [route.params.id]);

  const cancel = async () => {
    setBusy(true);
    try {
      setOrder(await api.cancel(route.params.id));
      notify(lang === 'bn' ? 'অর্ডার বাতিল' : 'Order cancelled');
    } catch (error) {
      notify(say(error));
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return (
      <Screen>
        <TopBar title={t('orders', lang)} onBack={() => navigation.goBack()} right={<View />} />
        <Muted>{t('offline', lang)}</Muted>
      </Screen>
    );
  }
  const canCancel = order.status === 'RECEIVED' || order.status === 'ACCEPTED';
  return (
    <Screen
      footer={
        <View>
          <Button label={t('track', lang)} onPress={() => navigation.navigate('Track', { id: order.id })} />
          {order.mode === 'COLLECTION' && order.collectionCode ? (
            <Button label={t('collectionPass', lang)} outline onPress={() => navigation.navigate('Pickup', { id: order.id })} />
          ) : null}
        </View>
      }>
      <TopBar title={`#${order.number}`} onBack={() => navigation.goBack()} right={<View />} />
      <H1>{t('confirmed', lang)}</H1>
      <Pill text={labelStatus(order.status, lang)} tone="dark" />
      <Muted>{order.slotLabel} · {order.serviceDate}</Muted>
      <Muted>{order.paymentMethod} · {order.paymentState}</Muted>
      {order.lines.map(line => (
        <Card key={line.productId}>
          <View style={styles.row}>
            {line.imageUrl ? <Image source={{ uri: line.imageUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{line.productName}</Text>
              <Muted>{kgLabel(line.orderedGrams)} · {line.batchCode}</Muted>
              {line.note ? <Muted>{line.note}</Muted> : null}
            </View>
            <Text style={styles.price}>{formatTaka(line.lineTotalPoisha)}</Text>
          </View>
        </Card>
      ))}
      <View style={styles.row}>
        <Text style={styles.name}>{t('total', lang)}</Text>
        <Text style={styles.price}>{formatTaka(order.totalPoisha)}</Text>
      </View>
      <Button label={t('receipt', lang)} outline onPress={() => navigation.navigate('Receipt', { id: order.id })} />
      <Button label={t('help', lang)} outline onPress={() => navigation.navigate('Help', { orderId: order.id })} />
      {canCancel ? <Button label={lang === 'bn' ? 'বাতিল করুন' : 'Cancel order'} outline onPress={cancel} loading={busy} /> : null}
    </Screen>
  );
}

export function TrackScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Track'>) {
  const { lang, notify } = useStore();
  const [order, setOrder] = useState<Order | null>(null);
  useEffect(() => {
    api.orderById(route.params.id).then(setOrder).catch(error => notify(say(error)));
  }, [route.params.id]);
  return (
    <Screen>
      <TopBar title={t('track', lang)} onBack={() => navigation.goBack()} right={<View />} />
      <H1>#{order?.number || ''}</H1>
      <Muted>{order ? labelStatus(order.status, lang) : ''}</Muted>
      {(order?.events || []).map((event, index) => (
        <View key={`${event.status}-${index}`} style={styles.event}>
          <View style={styles.dot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{labelStatus(event.status, lang)}</Text>
            {event.note ? <Muted>{event.note}</Muted> : null}
            <Muted>{new Date(event.createdAt).toLocaleString()}</Muted>
          </View>
        </View>
      ))}
      {order?.driver ? (
        <Card>
          <Text style={styles.name}>{order.driver.name || (lang === 'bn' ? 'চালক' : 'Driver')}</Text>
          <Muted>{order.driver.status}</Muted>
          {order.driver.phone ? (
            <Pressable onPress={() => Linking.openURL(`tel:${order.driver?.phone}`)}>
              <Text style={styles.link}>{order.driver.phone}</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}
      {order?.branch ? (
        <Card>
          <Text style={styles.name}>{order.branch.name}</Text>
          <Muted>{order.branch.addressLine}</Muted>
          <Pressable onPress={() => Linking.openURL(`tel:${order.branch?.phone}`)}>
            <Text style={styles.link}>{t('contact', lang)} · {order.branch.phone}</Text>
          </Pressable>
        </Card>
      ) : null}
    </Screen>
  );
}

export function PickupScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Pickup'>) {
  const { lang, notify } = useStore();
  const [order, setOrder] = useState<Order | null>(null);
  useEffect(() => {
    api.orderById(route.params.id).then(setOrder).catch(error => notify(say(error)));
  }, [route.params.id]);
  const value = order?.collectionCode ? `MANSO:${order.number}:${order.collectionCode}` : '';
  return (
    <Screen>
      <TopBar title={t('collectionPass', lang)} onBack={() => navigation.goBack()} right={<View />} />
      <H1>{t('showCode', lang)}</H1>
      {order?.collectionCode ? (
        <Card style={{ alignItems: 'center' }}>
          <QRCode value={value} size={180} backgroundColor={colors.white} color={colors.dark} />
          <Text style={styles.code}>{order.collectionCode}</Text>
          <Muted>#{order.number}</Muted>
          <Muted>{order.branch?.name} · {order.slotLabel}</Muted>
        </Card>
      ) : (
        <Muted>{lang === 'bn' ? 'এই অর্ডারে সংগ্রহ কোড নেই' : 'This order has no collection code'}</Muted>
      )}
    </Screen>
  );
}

export function ReceiptScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Receipt'>) {
  const { lang, notify } = useStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.orderById(route.params.id).then(setOrder).catch(error => notify(say(error)));
  }, [route.params.id]);

  const refund = async () => {
    setBusy(true);
    try {
      await api.orderSupport(route.params.id, { topic: 'REFUND', message: 'Customer requested a refund from the receipt.' });
      notify(lang === 'bn' ? 'রিফান্ড অনুরোধ গেছে' : 'Refund request sent');
      const next = await api.orderById(route.params.id);
      setOrder(next);
    } catch (error) {
      notify(say(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button label={t('refund', lang)} outline onPress={refund} loading={busy} disabled={!order || order.status === 'CANCELLED'} />}>
      <TopBar title={t('receipt', lang)} onBack={() => navigation.goBack()} right={<View />} />
      <H1>#{order?.number || ''}</H1>
      <Muted>{t('amountPaid', lang)} {formatTaka(order?.totalPoisha)}</Muted>
      <Muted>{order?.paymentMethod} · {order?.paymentState}</Muted>
      {(order?.lines || []).map(line => (
        <View key={line.productId} style={styles.row}>
          <Text style={{ flex: 1 }}>{line.productName} · {kgLabel(line.orderedGrams)}</Text>
          <Text>{formatTaka(line.lineTotalPoisha)}</Text>
        </View>
      ))}
      <View style={styles.row}>
        <Text>{t('fee', lang)}</Text>
        <Text>{formatTaka(order?.feePoisha)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.name}>{t('total', lang)}</Text>
        <Text style={styles.price}>{formatTaka(order?.totalPoisha)}</Text>
      </View>
      {(order?.payments || []).map(payment => (
        <Card key={payment.id}>
          <Text style={styles.name}>{payment.method} · {payment.state}</Text>
          <Muted>{formatTaka(payment.amountPoisha)}</Muted>
          {payment.transactionId ? <Muted>{payment.transactionId}</Muted> : null}
        </Card>
      ))}
      {(order?.refunds || []).map(refundItem => (
        <Card key={refundItem.id} style={{ backgroundColor: colors.peach }}>
          <Text style={styles.name}>{refundItem.status}</Text>
          <Muted>{formatTaka(refundItem.amountPoisha)} · {refundItem.reason}</Muted>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  mode: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  modeOn: { backgroundColor: colors.dark, borderColor: colors.dark },
  modeText: { fontWeight: '700', color: colors.dark },
  modeTextOn: { color: colors.white },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginVertical: 4 },
  no: { ...serif, fontSize: 22, color: colors.dark },
  price: { color: colors.orange, fontWeight: '800' },
  link: { color: colors.orange, fontWeight: '700' },
  name: { fontWeight: '700', color: colors.dark },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.peach },
  event: { flexDirection: 'row', gap: 12, marginVertical: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.orange, marginTop: 4 },
  code: { ...serif, fontSize: 40, letterSpacing: 6, color: colors.dark, marginTop: 12 },
});
