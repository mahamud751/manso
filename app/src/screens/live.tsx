import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { RootStackParamList, TabParamList } from '../nav';
import { useStore } from '../store';
import { colors, formatTaka, serif } from '../theme';
import { LiveSession, Replay } from '../types';
import { Button, Card, Field, Muted, Pill, Qty, Screen, TopBar, tx } from '../ui';

type Nav = CompositeNavigationProp<BottomTabNavigationProp<TabParamList>, NativeStackNavigationProp<RootStackParamList>>;

export function LiveHubScreen() {
  const navigation = useNavigation<Nav>();
  const { lang, branch, consent, setConsent, user, notify } = useStore();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [replays, setReplays] = useState<Replay[]>([]);
  const load = () => {
    if (!branch) return;
    Promise.all([api.sessions(branch.id), api.replays(branch.id)])
      .then(([nextSessions, nextReplays]) => {
        setSessions(nextSessions);
        setReplays(nextReplays);
      })
      .catch(error => notify(error instanceof ApiError ? error.message : t('offline', lang)));
  };
  useEffect(() => {
    load();
  }, [branch?.id]);
  const current = sessions.find(session => session.status === 'LIVE' || session.status === 'RECONNECTING') || sessions[0];
  return (
    <Screen>
      <TopBar title={t('liveHub', lang)} />
      <View style={styles.banner}>
        <Text style={styles.kicker}>{t('liveDaily', lang)}</Text>
        <Text style={styles.bannerTitle}>{t('watchOrder', lang)}</Text>
      </View>
      {current ? (
        <Card>
          {current.posterUrl ? <Image source={{ uri: current.posterUrl }} style={styles.thumb} /> : null}
          <View style={styles.row}>
            <Pill text={current.status} tone={current.status === 'LIVE' ? 'dark' : 'peach'} />
            <Muted>{current.viewerCount} {lang === 'bn' ? 'দেখছেন' : 'watching'}</Muted>
          </View>
          <Text style={styles.title}>{tx(current.title, lang)}</Text>
          <Muted>{tx(current.summary, lang)}</Muted>
          <Button label={`${t('watchOrder', lang)} →`} onPress={() => navigation.navigate('LiveWatch', { id: current.id })} />
        </Card>
      ) : <Muted>{lang === 'bn' ? 'এখন কোনো সেশন নেই।' : 'No session scheduled.'}</Muted>}
      <Text style={styles.section}>{t('upcoming', lang)}</Text>
      {sessions.filter(session => session.status === 'SCHEDULED').map(session => (
        <Card key={session.id}>
          <Text style={{ fontWeight: '700' }}>{tx(session.title, lang)}</Text>
          <Muted>{new Date(session.scheduledStart).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}</Muted>
        </Card>
      ))}
      <Text style={styles.section}>{t('replays', lang)}</Text>
      {replays.map(replay => (
        <Pressable key={replay.id} onPress={() => navigation.navigate('Replay', { id: replay.id })}>
          <Card>
            <View style={styles.row}><Pill text="REPLAY" /><Muted>{replay.viewCount} {lang === 'bn' ? 'বার' : 'views'}</Muted></View>
            <Text style={{ fontWeight: '700' }}>{tx(replay.title, lang)}</Text>
            <Muted>{replay.batch.code} · {replay.serviceDate}</Muted>
          </Card>
        </Pressable>
      ))}
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800' }}>{t('alerts', lang)}</Text>
          <Muted>{t('alertsHint', lang)}</Muted>
        </View>
        <Switch
          value={consent.liveAlerts}
          trackColor={{ true: colors.orange }}
          onValueChange={value => {
            if (!user) {
              notify(t('signInCheckout', lang));
              navigation.navigate('SignIn');
              return;
            }
            setConsent({ liveAlerts: value }).catch(error => notify(error.message));
          }}
        />
      </View>
    </Screen>
  );
}

export function LiveWatchScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'LiveWatch'>) {
  const { lang, viewerKey, addCut, notify, basket, user } = useStore();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [grams, setGrams] = useState<Record<string, number>>({});
  const [question, setQuestion] = useState('');
  const load = () => api.session(route.params.id).then(next => {
    setSession(next);
    setGrams(current => {
      const copy = { ...current };
      for (const pin of next.pins) if (!copy[pin.id]) copy[pin.id] = pin.minGrams;
      return copy;
    });
  });
  useEffect(() => {
    load().catch(error => notify(error instanceof ApiError ? error.message : t('offline', lang)));
    const poll = setInterval(() => {
      api.heartbeat(route.params.id, viewerKey).then(setSession).catch(() => undefined);
    }, 15000);
    api.heartbeat(route.params.id, viewerKey).catch(() => undefined);
    return () => clearInterval(poll);
  }, [route.params.id]);
  if (!session) return <Screen><Muted>…</Muted></Screen>;
  const live = session.status === 'LIVE' || session.status === 'RECONNECTING';
  return (
    <Screen footer={<Button label={`${t('viewBasket', lang)} (${basket.items.length})`} onPress={() => navigation.navigate('Basket')} />}>
      <TopBar title="MANSO Live" onBack={() => navigation.goBack()} />
      <View style={styles.player}>
        {session.posterUrl ? <Image source={{ uri: session.posterUrl }} style={StyleSheet.absoluteFill} /> : null}
        <View style={styles.badges}>
          <Pill text={live ? session.status : session.status} tone="dark" />
          {session.batch ? <Pill text={session.batch.code} /> : null}
        </View>
        <View style={styles.playerFoot}>
          <Text style={{ color: colors.white }}>{session.viewerCount} {lang === 'bn' ? 'দেখছেন' : 'watching'}</Text>
        </View>
      </View>
      {!live ? <Card style={{ backgroundColor: colors.peach }}><Text style={{ fontWeight: '800' }}>{session.status === 'OFFLINE' ? 'Offline' : session.status === 'ENDED' ? (lang === 'bn' ? 'সেশন শেষ' : 'This session has ended') : (lang === 'bn' ? 'সকাল ১০টায় শুরু' : 'Starts at 10 am')}</Text></Card> : null}
      <Text style={styles.section}>{t('orderBatch', lang)}</Text>
      <Muted>🚚 {t('deliveryFrom', lang)}</Muted>
      {session.pins.map(product => (
        <Card key={product.id}>
          <View style={styles.row}>
            {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.mini} /> : <View style={styles.mini} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800' }}>{tx(product.name, lang)}</Text>
              <Text style={styles.price}>{formatTaka(product.pricePerKgPoisha)}{t('perKg', lang)}</Text>
              <Muted>{product.inStock ? product.batch?.code : t('soldOut', lang)}</Muted>
            </View>
          </View>
          <Qty value={grams[product.id] || product.minGrams} step={product.incrementGrams} onChange={value => setGrams(current => ({ ...current, [product.id]: value }))} />
          <Button label={t('add', lang)} disabled={!product.inStock} onPress={() => addCut(product, grams[product.id] || product.minGrams, product.options[0]?.id).then(() => notify(tx(product.name, lang))).catch(error => notify(error.message))} />
        </Card>
      ))}
      <Field label={t('ask', lang)} value={question} onChangeText={setQuestion} placeholder={lang === 'bn' ? 'আপনার প্রশ্ন' : 'Your question'} />
      <Button outline label={t('send', lang)} onPress={() => {
        if (!user) {
          navigation.navigate('SignIn');
          return;
        }
        api.ask(session.id, question).then(() => {
          setQuestion('');
          notify(lang === 'bn' ? 'প্রশ্ন পাঠানো হয়েছে' : 'Question sent privately');
        }).catch(error => notify(error instanceof ApiError ? error.message : 'Could not send'));
      }} />
    </Screen>
  );
}

export function ReplayScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Replay'>) {
  const { lang, notify } = useStore();
  const [replay, setReplay] = useState<Replay | null>(null);
  useEffect(() => {
    api.viewReplay(route.params.id).then(setReplay).catch(error => notify(error instanceof ApiError ? error.message : t('offline', lang)));
  }, [route.params.id]);
  if (!replay) return <Screen><Muted>…</Muted></Screen>;
  const minutes = Math.round(replay.durationSec / 60);
  return (
    <Screen footer={<Button label={`${t('shopCuts', lang)} →`} onPress={() => navigation.navigate('Main', { screen: 'Shop' })} />}>
      <TopBar title={t('replay', lang)} onBack={() => navigation.goBack()} />
      <View style={styles.player}>
        {replay.posterUrl ? <Image source={{ uri: replay.posterUrl }} style={StyleSheet.absoluteFill} /> : null}
        <View style={styles.badges}><Pill text="REPLAY" tone="dark" /><Pill text={t('notLive', lang)} /></View>
      </View>
      <View style={styles.row}>
        <Text style={{ fontWeight: '800' }}>{replay.serviceDate}</Text>
        <Muted>{replay.batch.code}</Muted>
        <Muted>{minutes} min</Muted>
        <Muted>{replay.viewCount}</Muted>
      </View>
      <Text style={styles.title}>{tx(replay.title, lang)}</Text>
      <Muted>{tx(replay.summary, lang)}</Muted>
      {replay.soldOut ? (
        <Card style={{ backgroundColor: colors.peach }}>
          <Text style={{ color: colors.orange, fontWeight: '800' }}>{t('batchSold', lang)}</Text>
          <Muted>{t('batchSoldHint', lang)}</Muted>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.orange, borderRadius: 18, padding: 16 },
  kicker: { color: '#FFE8D7', fontWeight: '700' },
  bannerTitle: { ...serif, color: colors.white, fontSize: 30 },
  thumb: { height: 140, borderRadius: 12, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, flexWrap: 'wrap' },
  title: { ...serif, fontSize: 26, color: colors.dark },
  section: { ...serif, fontSize: 22, marginTop: 12, color: colors.dark },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 8 },
  player: { height: 230, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.dark, justifyContent: 'space-between' },
  badges: { flexDirection: 'row', gap: 6, padding: 12 },
  playerFoot: { padding: 12, backgroundColor: '#11111188' },
  price: { color: colors.orange, fontWeight: '800' },
  mini: { width: 72, height: 64, borderRadius: 10, backgroundColor: colors.peach },
});
