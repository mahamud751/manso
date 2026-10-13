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
import { Button, Card, Field, Muted, Notice, Pill, Qty, Screen, TopBar, tx } from '../ui';

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
        <Card style={{ padding: 10 }}>
          <View style={styles.poster}>
            {current.posterUrl ? <Image source={{ uri: current.posterUrl }} style={StyleSheet.absoluteFill} /> : null}
            <Pill text={current.status === 'LIVE' ? 'LIVE' : current.status} tone="dark" />
          </View>
          <View style={{ padding: 6 }}>
            <Text style={styles.title}>{tx(current.title, lang)}</Text>
            <Muted>{tx(current.summary, lang)}</Muted>
            <Muted>{current.viewerCount} {t('watching', lang)}</Muted>
            <Button label={`${t('watchOrder', lang)} →`} onPress={() => navigation.navigate('LiveWatch', { id: current.id })} />
          </View>
        </Card>
      ) : <Muted>{lang === 'bn' ? 'এখন কোনো সেশন নেই।' : 'No session scheduled.'}</Muted>}
      <Text style={styles.section}>{t('upcoming', lang)}</Text>
      {sessions.filter(session => session.status === 'SCHEDULED').map(session => (
        <Pressable key={session.id} onPress={() => navigation.navigate('LiveWatch', { id: session.id })}>
          <Card style={styles.schedule}>
            <Text style={styles.cal}>📅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{new Date(session.scheduledStart).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short' })}</Text>
              <Muted>{tx(session.title, lang)}</Muted>
            </View>
            <Text style={styles.chev}>›</Text>
          </Card>
        </Pressable>
      ))}
      <Text style={styles.section}>{t('replays', lang)}</Text>
      {replays.map(replay => (
        <Pressable key={replay.id} onPress={() => navigation.navigate('Replay', { id: replay.id })}>
          <Card style={styles.schedule}>
            <View style={styles.replayThumb}>
              {replay.posterUrl ? <Image source={{ uri: replay.posterUrl }} style={StyleSheet.absoluteFill} /> : null}
              <View style={styles.replayBadge}><Text style={styles.replayBadgeText}>REPLAY</Text></View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{replay.serviceDate}</Text>
              <Text style={styles.replayTitle} numberOfLines={1}>{tx(replay.title, lang)}</Text>
              <Muted>{replay.viewCount} {t('views', lang)}</Muted>
            </View>
            <Text style={styles.chev}>›</Text>
          </Card>
        </Pressable>
      ))}
      <Card style={styles.switchRow}>
        <Text style={styles.bell}>🔔</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.strong}>{t('alerts', lang)}</Text>
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
      </Card>
    </Screen>
  );
}

export function LiveWatchScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'LiveWatch'>) {
  const { lang, viewerKey, addCut, changeCut, notify, basket, user } = useStore();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [question, setQuestion] = useState('');
  const load = () => api.session(route.params.id).then(setSession);
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
          <Text style={{ color: colors.white }}>{session.viewerCount} {t('watching', lang)}</Text>
        </View>
      </View>
      {!live ? <Notice title={session.status === 'OFFLINE' ? 'Offline' : session.status === 'ENDED' ? (lang === 'bn' ? 'সেশন শেষ' : 'This session has ended') : (lang === 'bn' ? 'সকাল ১০টায় শুরু' : 'Starts at 10 am')} /> : null}
      <Text style={styles.section}>{t('orderBatch', lang)}</Text>
      <Notice icon="🕒" title={t('deliveryFrom', lang)} />
      {session.pins.map(product => {
        const grams = basket.items.find(item => item.productId === product.id)?.grams || 0;
        return (
          <Card key={product.id}>
            <View style={styles.row}>
              {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={styles.mini} /> : <View style={styles.mini} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.strong}>{tx(product.name, lang)}</Text>
                <Text style={styles.price}>{formatTaka(product.pricePerKgPoisha)}{t('perKg', lang)}</Text>
                <Muted>{product.inStock ? `${product.batch?.code || ''} · ${product.batch?.preparationDate || ''}` : t('soldOut', lang)}</Muted>
              </View>
            </View>
            <Qty
              wide
              value={grams}
              step={product.incrementGrams}
              min={product.minGrams}
              disabled={!product.inStock}
              onChange={next => {
                const capped = next === 0 ? 0 : Math.min(product.maxGrams, next);
                const existing = grams > 0;
                const run = existing || capped === 0 ? changeCut(product.id, capped) : addCut(product, capped, product.options[0]?.id);
                run.then(() => { if (!existing && capped > 0) notify(tx(product.name, lang)); }).catch(error => notify(error.message));
              }}
            />
          </Card>
        );
      })}
      <Text style={styles.section}>{lang === 'bn' ? 'যেভাবে চান' : 'Get it your way'}</Text>
      <View style={styles.wayRow}>
        <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('Basket')}>
          <Card style={styles.way}>
            <Text style={styles.wayIcon}>🚚</Text>
            <Text style={styles.strong}>{t('delivery', lang)}</Text>
            <Muted>{t('toAddress', lang)}</Muted>
          </Card>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('Basket')}>
          <Card style={styles.way}>
            <Text style={styles.wayIcon}>🏪</Text>
            <Text style={styles.strong}>{t('collection', lang)}</Text>
            <Muted>{t('fromBranch', lang)}</Muted>
          </Card>
        </Pressable>
      </View>
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
      <Card>
        <View style={styles.row}>
          <Pill text="REPLAY" tone="dark" />
          <Text style={styles.strong}>{replay.serviceDate}</Text>
          <Muted>{replay.batch.code}</Muted>
          <Pill text={t('notLive', lang)} />
        </View>
        <Text style={styles.title}>{tx(replay.title, lang)}</Text>
        <Muted>{tx(replay.summary, lang)}</Muted>
        <View style={styles.row}>
          <Muted>{replay.viewCount} {t('views', lang)}</Muted>
          <Muted>{minutes} min</Muted>
        </View>
      </Card>
      {replay.soldOut ? <Notice icon="ℹ️" title={t('batchSold', lang)} body={t('batchSoldHint', lang)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.orange, borderRadius: 18, padding: 16 },
  kicker: { color: '#FFE8D7', fontWeight: '700' },
  bannerTitle: { ...serif, color: colors.white, fontSize: 30 },
  poster: { height: 150, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.dark, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, flexWrap: 'wrap' },
  title: { ...serif, fontSize: 24, color: colors.dark, marginTop: 8 },
  section: { ...serif, fontSize: 22, marginTop: 12, color: colors.dark },
  strong: { fontWeight: '800', color: colors.dark },
  schedule: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cal: { fontSize: 18 },
  chev: { fontSize: 26, color: colors.muted },
  replayThumb: { width: 74, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.dark },
  replayBadge: { position: 'absolute', left: 4, bottom: 4, backgroundColor: colors.orange, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  replayBadgeText: { color: colors.white, fontSize: 8, fontWeight: '800' },
  replayTitle: { color: colors.muted, fontSize: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bell: { fontSize: 18 },
  wayRow: { flexDirection: 'row', gap: 8 },
  way: { flex: 1, marginVertical: 0 },
  wayIcon: { fontSize: 18, marginBottom: 4 },
  player: { height: 230, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.dark, justifyContent: 'space-between' },
  badges: { flexDirection: 'row', gap: 6, padding: 12 },
  playerFoot: { padding: 12, backgroundColor: '#11111188' },
  price: { color: colors.orange, fontWeight: '800' },
  mini: { width: 72, height: 64, borderRadius: 10, backgroundColor: colors.peach },
});
