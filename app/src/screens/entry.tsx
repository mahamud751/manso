import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, API_URL, ApiError } from '../api';
import { t } from '../i18n';
import { RootStackParamList } from '../nav';
import { useStore } from '../store';
import { colors, serif } from '../theme';
import { Branch } from '../types';
import { Bull, Button, Card, Field, H1, Muted, Screen } from '../ui';

export function WelcomeScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Welcome'>) {
  const { lang, setLang, finishOnboarding } = useStore();
  const go = (name: 'SignIn' | 'Branch') => {
    finishOnboarding();
    navigation.replace(name);
  };
  return (
    <Screen footer={<Button label={`${t('getStarted', lang)} →`} onPress={() => go('SignIn')} />}>
      <View style={{ alignItems: 'center', paddingTop: 24 }}>
        <Bull size={72} />
        <Text style={styles.word}>MANSO</Text>
        <H1>
          {t('freshToday', lang)}
          {'\n'}
          <Text style={{ color: colors.orange }}>{t('deliveredToday', lang)}</Text>
        </H1>
        <Muted>{t('tagline', lang)}</Muted>
        <Image source={{ uri: `${API_URL}/media/hero.jpg` }} style={styles.hero} />
        <View style={styles.langRow}>
          <Pressable onPress={() => setLang('en')} style={[styles.lang, lang === 'en' && styles.langOn]}>
            <Text style={[styles.langText, lang === 'en' && styles.langTextOn]}>English</Text>
          </Pressable>
          <Pressable onPress={() => setLang('bn')} style={[styles.lang, lang === 'bn' && styles.langOn]}>
            <Text style={[styles.langText, lang === 'bn' && styles.langTextOn]}>বাংলা</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => go('Branch')}>
          <Text style={styles.link}>{t('browseFirst', lang)}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

export function SignInScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'SignIn'>) {
  const { lang, signIn, notify, branch } = useStore();
  const [phone, setPhone] = useState('01712345678');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState('');
  const [wait, setWait] = useState(0);
  const [debug, setDebug] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!wait) return;
    const timer = setTimeout(() => setWait(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = async () => {
    setBusy(true);
    try {
      const result = await api.otp(phone);
      setSent(result.phone);
      setWait(result.resendAfterSeconds);
      setDebug(result.debugCode);
      notify(lang === 'bn' ? 'কোড তৈরি হয়েছে' : 'Code created');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not send a code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      await signIn(phone, code);
      if (route.params?.next === 'Fulfil') navigation.replace('Fulfil');
      else if (!branch) navigation.replace('Branch');
      else navigation.replace('Main');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not verify');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Pressable onPress={() => navigation.goBack()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
      <H1>{t('signIn', lang)}</H1>
      <Muted>{t('phoneHint', lang)}</Muted>
      <Field label={lang === 'bn' ? 'মোবাইল' : 'Mobile number'} value={phone} onChangeText={setPhone} keyboard="phone-pad" placeholder="+880 17XX XXXXXX" />
      <Button label={t('sendCode', lang)} onPress={send} loading={busy && !sent} disabled={wait > 0 && !!sent} />
      {sent ? (
        <Card>
          <Text style={styles.blockTitle}>{t('enterCode', lang)}</Text>
          <Muted>{sent}</Muted>
          {debug ? <Text style={styles.debug}>Local code {debug}</Text> : null}
          <Field value={code} onChangeText={setCode} keyboard="number-pad" placeholder="••••••" />
          <Button label={lang === 'bn' ? 'যাচাই করুন' : 'Verify'} onPress={verify} loading={busy} />
          <Pressable disabled={wait > 0} onPress={send}>
            <Text style={styles.link}>{t('resend', lang)}{wait ? ` ${wait}s` : ''}</Text>
          </Pressable>
        </Card>
      ) : null}
      <Pressable onPress={() => navigation.navigate('Main')}>
        <Text style={styles.link}>{t('browseFirst', lang)}</Text>
      </Pressable>
    </Screen>
  );
}

export function BranchScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Branch'>) {
  const { lang, setBranch, notify } = useStore();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Branch[]>([]);
  const [picked, setPicked] = useState<Branch | null>(null);

  useEffect(() => {
    api.branches(q).then(setRows).catch(error => notify(error instanceof ApiError ? error.message : 'Offline'));
  }, [q, notify]);

  return (
    <Screen footer={<Button label={t('selectBranch', lang)} disabled={!picked} onPress={async () => {
      if (!picked) return;
      await setBranch(picked);
      navigation.replace('Main');
    }} />}>
      <Pressable onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Main')} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
      <H1>{t('yourBranch', lang)}</H1>
      <Muted>{t('branchHint', lang)}</Muted>
      <Field value={q} onChangeText={setQ} placeholder={t('searchArea', lang)} />
      <Card style={styles.map}>
        <Text style={styles.mapPin}>📍 {picked ? `${picked.area}, ${picked.city}` : 'Sylhet'}</Text>
      </Card>
      <Muted>{t('locationNote', lang)}</Muted>
      {rows.map(branch => (
        <Pressable key={branch.id} onPress={() => setPicked(branch)}>
          <Card style={picked?.id === branch.id ? styles.picked : undefined}>
            {branch.imageUrl ? <Image source={{ uri: branch.imageUrl }} style={styles.shop} /> : null}
            <Text style={styles.blockTitle}>{branch.name}</Text>
            <Muted>{branch.addressLine}</Muted>
            <Muted>{lang === 'bn' ? 'ডেলিভারি ও সংগ্রহ' : 'Delivery and collection'}</Muted>
            <Text style={styles.hours}>{branch.opensAt}–{branch.closesAt}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  word: { ...serif, color: colors.orange, fontSize: 40, marginTop: 8 },
  hero: { width: '100%', height: 230, borderRadius: 18, marginVertical: 16, backgroundColor: colors.peach },
  langRow: { flexDirection: 'row', backgroundColor: '#F2E9DE', borderRadius: 13, padding: 4, gap: 4, marginVertical: 8 },
  lang: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  langOn: { backgroundColor: colors.orange },
  langText: { fontWeight: '700', color: colors.dark },
  langTextOn: { color: colors.white },
  link: { color: colors.orange, fontWeight: '700', textAlign: 'center', padding: 12 },
  back: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: colors.dark, marginTop: -4 },
  blockTitle: { fontWeight: '800', fontSize: 16, color: colors.dark, marginTop: 8 },
  debug: { color: colors.orange, fontWeight: '800', marginTop: 8 },
  map: { height: 150, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E7EFE0' },
  mapPin: { backgroundColor: colors.white, color: colors.orange, fontWeight: '800', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, overflow: 'hidden' },
  shop: { width: '100%', height: 120, borderRadius: 12 },
  picked: { borderColor: colors.orange, borderWidth: 2 },
  hours: { marginTop: 6, color: colors.muted },
});
