import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { RootStackParamList } from '../nav';
import { useStore } from '../store';
import { colors, serif } from '../theme';
import { Notice } from '../types';
import { Button, Card, Field, H1, Muted, Screen, TopBar, tx } from '../ui';

function say(error: unknown) {
  return error instanceof ApiError ? error.message : 'Request failed';
}

export function AccountScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Account'>) {
  const { lang, setLang, user, consent, setConsent, signOut, deleteAccount, updateProfile, notify } = useStore();
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
      <H1>{user.name}</H1>
      <Muted>{user.phone}</Muted>
      <Field label={lang === 'bn' ? 'নাম' : 'Name'} value={name} onChangeText={setName} />
      <Button label={lang === 'bn' ? 'নাম সেভ' : 'Save name'} outline onPress={save} loading={busy} />
      <Text style={styles.section}>{t('language', lang)}</Text>
      <View style={styles.row}>
        <Pressable onPress={() => setLang('en')} style={[styles.chip, lang === 'en' && styles.chipOn]}>
          <Text>English</Text>
        </Pressable>
        <Pressable onPress={() => setLang('bn')} style={[styles.chip, lang === 'bn' && styles.chipOn]}>
          <Text>বাংলা</Text>
        </Pressable>
      </View>
      <ConsentRow label={t('alerts', lang)} hint={t('alertsHint', lang)} value={consent.liveAlerts} onChange={value => setConsent({ liveAlerts: value })} />
      <ConsentRow label={t('offers', lang)} hint={t('offersHint', lang)} value={consent.offers} onChange={value => setConsent({ offers: value })} />
      <ConsentRow label={t('updates', lang)} hint={t('updatesHint', lang)} value={consent.orderUpdates} onChange={value => setConsent({ orderUpdates: value })} />
      <Button label={t('notifications', lang)} outline onPress={() => navigation.navigate('Notifications')} />
      <Button label={t('orders', lang)} outline onPress={() => navigation.navigate('Main', { screen: 'Orders' })} />
      <Button label={t('help', lang)} outline onPress={() => navigation.navigate('Help')} />
      <Button label={t('privacy', lang)} outline onPress={() => navigation.navigate('Policy', { slug: 'privacy' })} />
      <Button label={t('terms', lang)} outline onPress={() => navigation.navigate('Policy', { slug: 'terms' })} />
      <Button label={t('signOut', lang)} outline onPress={() => signOut().then(() => navigation.navigate('Main', { screen: 'Home' }))} />
      <Button label={t('delete', lang)} outline onPress={remove} />
    </Screen>
  );
}

function ConsentRow({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{label}</Text>
          <Muted>{hint}</Muted>
        </View>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.orange }} />
      </View>
    </Card>
  );
}

export function NotificationsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Notifications'>) {
  const { lang, user, notify } = useStore();
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
      {!user ? <Button label={t('signIn', lang)} onPress={() => navigation.navigate('SignIn')} /> : null}
      {!items.length ? <Muted>{lang === 'bn' ? 'কোনো বার্তা নেই' : 'No messages yet'}</Muted> : null}
      {items.map(item => (
        <Pressable key={item.id} onPress={() => open(item)}>
          <Card style={item.readAt ? undefined : { backgroundColor: colors.peach }}>
            <Text style={styles.name}>{tx(item.title, lang)}</Text>
            <Muted>{tx(item.body, lang)}</Muted>
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
  const orderId = route.params?.orderId;

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
      {orderId ? <Muted>{lang === 'bn' ? 'এই অর্ডারের জন্য' : 'About this order'}</Muted> : null}
      <View style={styles.topics}>
        {topics.map(item => (
          <Pressable key={item} onPress={() => setTopic(item)} style={[styles.chip, topic === item && styles.chipOn]}>
            <Text style={topic === item ? styles.chipTextOn : undefined}>{item.replaceAll('_', ' ')}</Text>
          </Pressable>
        ))}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontWeight: '700', color: colors.dark },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.peach, borderColor: colors.orange },
  chipTextOn: { color: colors.orange, fontWeight: '700' },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  policyTitle: { ...serif, fontSize: 32, color: colors.dark, marginBottom: 8 },
  body: { color: colors.dark, fontSize: 16, lineHeight: 24 },
});
