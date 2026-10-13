import React, { useEffect, useState } from 'react';
import { Image, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
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
import { Button, Card, H1, Muted, Notice, Pill, Screen, TopBar } from '../ui';

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
            <Card key={order.id}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.no}>#{order.number}</Text>
                  <Muted>{new Date(order.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Muted>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Pill text={labelStatus(order.status, lang)} tone={order.status === 'DELIVERED' || order.status === 'COLLECTED' ? 'green' : 'peach'} />
                  <Text style={styles.price}>{formatTaka(order.totalPoisha)}</Text>
                </View>
              </View>
              {order.lines.map(line => (
                <View key={line.productId} style={styles.line}>
                  {line.imageUrl ? <Image source={{ uri: line.imageUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{line.productName}</Text>
                    <Muted>{kgLabel(line.orderedGrams)}</Muted>
                  </View>
                  <Text style={styles.name}>{formatTaka(line.lineTotalPoisha)}</Text>
                </View>
              ))}
              {order.feePoisha ? (
                <View style={styles.row}>
                  <Muted>{order.mode === 'COLLECTION' ? t('collectionFee', lang) : t('fee', lang)}</Muted>
                  <Muted>{formatTaka(order.feePoisha)}</Muted>
                </View>
              ) : null}
              <View style={styles.actions}>
                <Pressable onPress={() => navigation.navigate('Order', { id: order.id })} style={styles.actionOutline}>
                  <Text style={styles.actionOutlineText}>{t('viewOrder', lang)}</Text>
                </Pressable>
                <Pressable onPress={() => reorder(order.id)} style={styles.actionFill}>
                  <Text style={styles.actionFillText}>{t('reorder', lang)}</Text>
                </Pressable>
              </View>
            </Card>
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
      <Notice icon="📋" title={t('confirmed', lang)} body={labelStatus(order.status, lang)} />
      <View style={styles.row}>
        <Text style={styles.no}>#{order.number}</Text>
        <Muted>{order.serviceDate}</Muted>
      </View>
      <Card>
        <Text style={styles.name}>{order.mode === 'COLLECTION' ? t('collection', lang) : t('delivery', lang)}</Text>
        <Text style={styles.price}>{order.slotLabel}</Text>
        <Muted>{order.paymentMethod} · {order.paymentState}</Muted>
      </Card>
      {order.address ? <Muted>{[order.address.line1, order.address.area, order.address.city].filter(Boolean).join(', ')}</Muted> : null}
      <Text style={styles.section}>{t('summary', lang)}</Text>
      {order.lines.map(line => (
        <Card key={line.productId} style={styles.lineCard}>
          {line.imageUrl ? <Image source={{ uri: line.imageUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{line.productName}</Text>
            <Muted>{kgLabel(line.orderedGrams)} · {line.batchCode}</Muted>
            {line.note ? <Muted>{line.note}</Muted> : null}
          </View>
          <Text style={styles.price}>{formatTaka(line.lineTotalPoisha)}</Text>
        </Card>
      ))}
      <View style={styles.row}>
        <Muted>{t('subtotal', lang)}</Muted>
        <Text>{formatTaka(order.subtotalPoisha)}</Text>
      </View>
      <View style={styles.row}>
        <Muted>{order.mode === 'COLLECTION' ? t('collectionFee', lang) : t('fee', lang)}</Muted>
        <Text>{formatTaka(order.feePoisha)}</Text>
      </View>
      <View style={styles.totalBand}>
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
      <TopBar
        title={t('track', lang)}
        onBack={() => navigation.goBack()}
        right={<Pressable onPress={() => order && navigation.navigate('Help', { orderId: order.id })}><Text style={styles.link}>{t('help', lang)}</Text></Pressable>}
      />
      {order ? <Notice icon="🚚" title={labelStatus(order.status, lang)} body={`${order.serviceDate} · ${order.slotLabel}`} /> : null}
      <Card>
        {(order?.events || []).map((event, index, list) => (
          <View key={`${event.status}-${index}`} style={styles.event}>
            <View style={styles.rail}>
              <View style={[styles.dot, index === list.length - 1 && styles.dotOn]} />
              {index < list.length - 1 ? <View style={styles.railLine} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{labelStatus(event.status, lang)}</Text>
              {event.note ? <Muted>{event.note}</Muted> : null}
              <Muted>{new Date(event.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}</Muted>
            </View>
          </View>
        ))}
      </Card>
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
      {order ? <Notice icon="🏪" title={labelStatus(order.status, lang)} body={order.branch?.name} /> : null}
      {order?.collectionCode ? (
        <Card style={{ alignItems: 'center' }}>
          <QRCode value={value} size={180} backgroundColor={colors.white} color={colors.dark} />
          <Muted>{t('collectionPass', lang)}</Muted>
          <View style={styles.codeBand}>
            <Text style={styles.code}>{order.collectionCode}</Text>
          </View>
          <Notice icon="ℹ️" title={t('showCode', lang)} />
          <Muted>#{order.number} · {order.slotLabel}</Muted>
          {order.branch ? <Muted>{order.branch.addressLine}</Muted> : null}
        </Card>
      ) : (
        <Muted>{lang === 'bn' ? 'এই অর্ডারে সংগ্রহ কোড নেই' : 'This order has no collection code'}</Muted>
      )}
      {order?.branch ? (
        <View style={styles.actions}>
          <Pressable onPress={() => Linking.openURL(`https://maps.apple.com/?q=${order.branch?.lat},${order.branch?.lng}`)} style={[styles.actionFill, { flex: 1 }]}>
            <Text style={styles.actionFillText}>{lang === 'bn' ? 'দিকনির্দেশ' : 'Get directions'}</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(`tel:${order.branch?.phone}`)} style={[styles.actionOutline, { flex: 1 }]}>
            <Text style={styles.actionOutlineText}>{t('contact', lang)}</Text>
          </Pressable>
        </View>
      ) : null}
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
      <View style={styles.row}>
        <Text style={styles.no}>#{order?.number || ''}</Text>
        {order ? <Pill text={labelStatus(order.status, lang)} tone={order.status === 'DELIVERED' || order.status === 'COLLECTED' ? 'green' : 'peach'} /> : null}
      </View>
      <Muted>{order?.paymentMethod} · {order?.paymentState}</Muted>
      {(order?.lines || []).map(line => (
        <Card key={line.productId} style={styles.lineCard}>
          {line.imageUrl ? <Image source={{ uri: line.imageUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{line.productName}</Text>
            <Muted>{kgLabel(line.orderedGrams)}</Muted>
          </View>
          <Text style={styles.name}>{formatTaka(line.lineTotalPoisha)}</Text>
        </Card>
      ))}
      <View style={styles.row}>
        <Text>{t('fee', lang)}</Text>
        <Text>{formatTaka(order?.feePoisha)}</Text>
      </View>
      <View style={styles.totalBand}>
        <Text style={styles.name}>{t('amountPaid', lang)}</Text>
        <Text style={styles.price}>{formatTaka(order?.totalPoisha)}</Text>
      </View>
      {order ? (
        <Button
          label={t('shareReceipt', lang)}
          outline
          onPress={() => {
            const lines = order.lines.map(line => `${line.productName} ${kgLabel(line.orderedGrams)} ${formatTaka(line.lineTotalPoisha)}`).join('\n');
            Share.share({ message: `MANSO #${order.number}\n${lines}\n${t('total', lang)} ${formatTaka(order.totalPoisha)}` }).catch(() => undefined);
          }}
        />
      ) : null}
      {(order?.payments || []).map(payment => (
        <Card key={payment.id}>
          <Text style={styles.name}>{payment.method} · {payment.state}</Text>
          <Muted>{formatTaka(payment.amountPoisha)}</Muted>
          {payment.transactionId ? <Muted>{payment.transactionId}</Muted> : null}
        </Card>
      ))}
      {(order?.refunds || []).map(refundItem => (
        <Notice key={refundItem.id} icon="↩" title={`${formatTaka(refundItem.amountPoisha)} · ${refundItem.status}`} body={refundItem.reason} />
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
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.peach },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  lineCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionOutline: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  actionOutlineText: { color: colors.orange, fontWeight: '800' },
  actionFill: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  actionFillText: { color: colors.white, fontWeight: '800' },
  section: { ...serif, fontSize: 22, color: colors.dark, marginTop: 8 },
  totalBand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.peach, borderRadius: 14, padding: 12, marginVertical: 8 },
  event: { flexDirection: 'row', gap: 12 },
  rail: { width: 16, alignItems: 'center' },
  railLine: { width: 2, flex: 1, backgroundColor: colors.peach, minHeight: 28 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.green, marginTop: 4 },
  dotOn: { backgroundColor: colors.orange },
  codeBand: { backgroundColor: colors.peach, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 8, marginTop: 12 },
  code: { ...serif, fontSize: 36, letterSpacing: 6, color: colors.orange },
});
