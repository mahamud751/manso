import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { RootStackParamList } from '../nav';
import { useStore } from '../store';
import { colors, serif } from '../theme';
import { Notice, Order } from '../types';
import { Button, Card, Field, H1, Muted, Screen, TopBar, tx } from '../ui';

function say(error: unknown) {
  return error instanceof ApiError ? error.message : 'Request failed';
}

export function AccountScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Account'>) {
  const { lang, setLang, user, signOut, deleteAccount, updateProfile, notify } = useStore();
  const [name, setName] = useState(user?.name || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(user?.name || ''), [user?.name]);

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({ name: name.trim() });
      notify(t('saved', lang));
    } catch (error) {
      notify(say(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    Alert.alert(
      t('delete', lang),
      lang === 'bn' ? 'প্রোফাইল মুছে যাবে। হিসাবের রেকর্ড থাকবে।' : 'Your profile is anonymised. Financial records stay.',
      [
        { text: lang === 'bn' ? 'না' : 'Keep', style: 'cancel' },
        {
          text: t('delete', lang),
          style: 'destructive',
          onPress: () => deleteAccount().then(() => navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] })).catch(error => notify(say(error))),
        },
      ],
    );
  };

  if (!user) {
    return (
      <Screen>
        <TopBar title={t('account', lang)} onBack={() => navigation.goBack()} right={<View />} />
        <H1>{t('account', lang)}</H1>
        <Button label={t('signIn', lang)} onPress={() => navigation.navigate('SignIn')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title={t('account', lang)} onBack={() => navigation.goBack()} right={<View />} />
      <Card style={styles.profile}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(user.name || 'M').slice(0, 1)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.name}</Text>
          <Muted>{user.phone}</Muted>
        </View>
      </Card>
      <Field label={lang === 'bn' ? 'নাম' : 'Name'} value={name} onChangeText={setName} />
      <Button label={lang === 'bn' ? 'নাম সেভ' : 'Save name'} outline onPress={save} loading={busy} />
      <Card style={styles.profile}>
        <Text style={{ fontSize: 18 }}>🌐</Text>
        <Text style={[styles.name, { flex: 1 }]}>{t('language', lang)}</Text>
        <Pressable onPress={() => setLang('en')} style={[styles.langPill, lang === 'en' && styles.langPillOn]}>
          <Text style={lang === 'en' ? styles.langPillTextOn : styles.langPillText}>English</Text>
        </Pressable>
        <Pressable onPress={() => setLang('bn')} style={[styles.langPill, lang === 'bn' && styles.langPillOn]}>
          <Text style={lang === 'bn' ? styles.langPillTextOn : styles.langPillText}>বাংলা</Text>
        </Pressable>
      </Card>
      <LinkRow icon="🔔" label={t('notifications', lang)} onPress={() => navigation.navigate('Notifications')} />
      <LinkRow icon="🧾" label={t('orders', lang)} onPress={() => navigation.navigate('Main', { screen: 'Orders' })} />
      <LinkRow icon="💬" label={t('help', lang)} onPress={() => navigation.navigate('Help')} />
      <LinkRow icon="🔒" label={t('privacy', lang)} onPress={() => navigation.navigate('Policy', { slug: 'privacy' })} />
      <LinkRow icon="📄" label={t('terms', lang)} onPress={() => navigation.navigate('Policy', { slug: 'terms' })} />
      <LinkRow icon="↪" label={t('signOut', lang)} onPress={() => signOut().then(() => navigation.navigate('Main', { screen: 'Home' }))} />
      <LinkRow icon="🗑" label={t('delete', lang)} danger onPress={remove} />
    </Screen>
  );
}

function LinkRow({ icon, label, onPress, danger }: { icon: string; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.profile}>
        <Text style={styles.rowIcon}>{icon}</Text>
        <Text style={[styles.name, { flex: 1 }, danger && { color: colors.danger }]}>{label}</Text>
        <Text style={styles.chev}>›</Text>
      </Card>
    </Pressable>
  );
}

function ConsentRow({ icon, label, hint, value, onChange }: { icon: string; label: string; hint: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Card style={styles.profile}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{label}</Text>
        <Muted>{hint}</Muted>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.orange }} />
    </Card>
  );
}

export function NotificationsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Notifications'>) {
  const { lang, user, notify, consent, setConsent } = useStore();
  const [items, setItems] = useState<Notice[]>([]);
  useEffect(() => {
    if (!user) return;
    api.notifications().then(setItems).catch(error => notify(say(error)));
  }, [user?.id]);

  const open = async (item: Notice) => {
    api.readNotification(item.id).catch(() => undefined);
    setItems(current => current.map(row => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row)));
    if (item.orderId) navigation.navigate('Order', { id: item.orderId });
    else if (item.sessionId) navigation.navigate('LiveWatch', { id: item.sessionId });
  };

  return (
    <Screen>
      <TopBar title={t('notifications', lang)} onBack={() => navigation.goBack()} right={<View />} />
      {!user ? <Button label={t('signIn', lang)} onPress={() => navigation.navigate('SignIn')} /> : (
        <View>
          <Text style={styles.section}>{lang === 'bn' ? 'পছন্দ' : 'Notification preferences'}</Text>
          <ConsentRow icon="🔔" label={t('alerts', lang)} hint={t('alertsHint', lang)} value={consent.liveAlerts} onChange={value => setConsent({ liveAlerts: value })} />
          <ConsentRow icon="🏷" label={t('offers', lang)} hint={t('offersHint', lang)} value={consent.offers} onChange={value => setConsent({ offers: value })} />
          <ConsentRow icon="🚚" label={t('updates', lang)} hint={t('updatesHint', lang)} value={consent.orderUpdates} onChange={value => setConsent({ orderUpdates: value })} />
        </View>
      )}
      <Text style={styles.section}>{lang === 'bn' ? 'সাম্প্রতিক' : 'Recent notifications'}</Text>
      {!items.length ? <Muted>{lang === 'bn' ? 'কোনো বার্তা নেই' : 'No messages yet'}</Muted> : null}
      {items.map(item => (
        <Pressable key={item.id} onPress={() => open(item)}>
          <Card style={[styles.profile, !item.readAt && { backgroundColor: colors.peach }]}>
            <View style={styles.noteIcon}><Text>{item.type === 'LIVE' ? '📡' : item.orderId ? '🚚' : '🔔'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{tx(item.title, lang)}</Text>
              <Muted>{tx(item.body, lang)}</Muted>
            </View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const topics = ['DELIVERY_ISSUE', 'MISSING_ITEM', 'WRONG_CUT', 'REFUND', 'OTHER'] as const;

export function HelpScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Help'>) {
  const { lang, user, notify } = useStore();
  const [topic, setTopic] = useState<(typeof topics)[number]>('OTHER');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const orderId = route.params?.orderId;
  useEffect(() => {
    if (!orderId) return;
    api.orderById(orderId).then(setOrder).catch(() => undefined);
  }, [orderId]);

  const send = async () => {
    if (!user) {
      navigation.navigate('SignIn');
      return;
    }
    if (message.trim().length < 3) {
      notify(lang === 'bn' ? 'একটু বিস্তারিত লিখুন' : 'Write a short message');
      return;
    }
    setBusy(true);
    try {
      if (orderId) await api.orderSupport(orderId, { topic, message: message.trim() });
      else await api.support({ topic, message: message.trim() });
      setMessage('');
      notify(lang === 'bn' ? 'বার্তা গেছে' : 'Message sent');
    } catch (error) {
      notify(say(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button label={t('send', lang)} onPress={send} loading={busy} />}>
      <TopBar title={t('help', lang)} onBack={() => navigation.goBack()} right={<View />} />
      <H1>{t('help', lang)}</H1>
      {order ? (
        <Pressable onPress={() => navigation.navigate('Order', { id: order.id })}>
          <Card style={[styles.profile, { backgroundColor: colors.peach }]}>
            <Text style={styles.rowIcon}>📋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>#{order.number}</Text>
              <Muted>{order.serviceDate} · {order.slotLabel}</Muted>
            </View>
            <Text style={styles.chev}>›</Text>
          </Card>
        </Pressable>
      ) : null}
      <Text style={styles.section}>{lang === 'bn' ? 'কী নিয়ে সাহায্য চান?' : 'What do you need help with?'}</Text>
      <View style={styles.topics}>
        {topics.map(item => {
          const on = topic === item;
          const icon = item === 'DELIVERY_ISSUE' ? '🚚' : item === 'MISSING_ITEM' ? '📦' : item === 'WRONG_CUT' ? '🥩' : item === 'REFUND' ? '↩' : '💬';
          return (
            <Pressable key={item} onPress={() => setTopic(item)} style={[styles.topicCard, on && styles.topicOn]}>
              <Text style={styles.rowIcon}>{icon}</Text>
              <Text style={[styles.topicText, on && styles.chipTextOn]}>{item.replaceAll('_', ' ')}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field label={lang === 'bn' ? 'বার্তা' : 'Message'} value={message} onChangeText={setMessage} placeholder={lang === 'bn' ? 'কী হয়েছে?' : 'What happened?'} />
    </Screen>
  );
}

export function PolicyScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Policy'>) {
  const { lang, notify } = useStore();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => {
    api
      .policy(route.params.slug)
      .then(page => {
        setTitle(tx(page.title, lang));
        setBody(tx(page.body, lang));
      })
      .catch(error => notify(say(error)));
  }, [route.params.slug, lang]);
  return (
    <Screen>
      <TopBar title={route.params.slug === 'terms' ? t('terms', lang) : t('privacy', lang)} onBack={() => navigation.goBack()} right={<View />} />
      <Text style={styles.policyTitle}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...serif, fontSize: 22, color: colors.dark, marginTop: 8 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...serif, color: colors.orange, fontSize: 22 },
  name: { fontWeight: '700', color: colors.dark },
  rowIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  chev: { fontSize: 24, color: colors.muted },
  langPill: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.paper },
  langPillOn: { backgroundColor: colors.orange },
  langPillText: { fontWeight: '700', color: colors.dark },
  langPillTextOn: { fontWeight: '700', color: colors.white },
  noteIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  chipTextOn: { color: colors.orange, fontWeight: '700' },
  topics: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginVertical: 8 },
  topicCard: { width: '48%', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, minHeight: 92, marginBottom: 10, gap: 8 },
  topicOn: { borderColor: colors.orange, backgroundColor: '#FFF7F2' },
  topicText: { fontWeight: '700', color: colors.dark },
  policyTitle: { ...serif, fontSize: 32, color: colors.dark, marginBottom: 8 },
  body: { color: colors.dark, fontSize: 16, lineHeight: 24 },
});
