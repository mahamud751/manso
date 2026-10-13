import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setToken } from './api';
import { Address, Basket, BasketItem, Branch, Consent, Lang, Product, User } from './types';
import { lineTotal } from './theme';

type GuestLine = { productId: string; grams: number; optionId?: string; note?: string };
type Store = {
  ready: boolean;
  lang: Lang;
  setLang: (lang: Lang) => void;
  user: User | null;
  branch: Branch | null;
  setBranch: (branch: Branch) => Promise<void>;
  basket: Basket;
  basketCount: number;
  refreshBasket: () => Promise<void>;
  addCut: (product: Product, grams: number, optionId?: string, note?: string) => Promise<void>;
  changeCut: (productId: string, grams: number) => Promise<void>;
  updateProfile: (body: { name?: string; language?: 'EN' | 'BN'; preferredBranchId?: string }) => Promise<void>;
  addresses: Address[];
  refreshAddresses: () => Promise<void>;
  addAddress: (body: Record<string, unknown>) => Promise<Address>;
  consent: Consent;
  setConsent: (patch: Partial<Consent>) => Promise<void>;
  signIn: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  toast: string | null;
  notify: (text: string) => void;
  viewerKey: string;
  onboarded: boolean;
  finishOnboarding: () => void;
};

const Ctx = createContext<Store | null>(null);
const blankConsent: Consent = { liveAlerts: false, offers: false, orderUpdates: true };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<Lang>('en');
  const [user, setUser] = useState<User | null>(null);
  const [branch, setBranchState] = useState<Branch | null>(null);
  const [basket, setBasket] = useState<Basket>({ branchId: null, items: [], estimatedSubtotalPoisha: 0 });
  const [guest, setGuest] = useState<GuestLine[]>([]);
  const [guestProducts, setGuestProducts] = useState<Record<string, Product>>({});
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [consent, setConsentState] = useState<Consent>(blankConsent);
  const [toast, setToast] = useState<string | null>(null);
  const [viewerKey, setViewerKey] = useState('viewer-pending');
  const [onboarded, setOnboarded] = useState(false);

  const notify = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(current => (current === text ? null : current)), 2600);
  };

  const paintGuest = (lines: GuestLine[], products: Record<string, Product>, branchId: string | null) => {
    const items: BasketItem[] = lines.map(line => {
      const product = products[line.productId] ?? null;
      const option = product?.options.find(item => item.id === line.optionId);
      return {
        productId: line.productId,
        grams: line.grams,
        optionId: line.optionId,
        optionName: option?.name ?? null,
        note: line.note,
        lineTotalPoisha: product?.pricePerKgPoisha ? lineTotal(line.grams, product.pricePerKgPoisha) : 0,
        available: !!product?.inStock,
        product,
      };
    });
    setBasket({
      branchId,
      items,
      estimatedSubtotalPoisha: items.reduce((sum, item) => sum + item.lineTotalPoisha, 0),
    });
  };

  const refreshBasket = async () => {
    if (!user) {
      paintGuest(guest, guestProducts, branch?.id ?? null);
      return;
    }
    setBasket(await api.basket());
  };

  const refreshAddresses = async () => {
    if (user) setAddresses(await api.addresses());
  };

  useEffect(() => {
    (async () => {
      const [savedLang, savedToken, savedBranch, savedView, savedOnboard, savedGuest] = await Promise.all([
        AsyncStorage.getItem('manso.lang'),
        AsyncStorage.getItem('manso.token'),
        AsyncStorage.getItem('manso.branch'),
        AsyncStorage.getItem('manso.viewer'),
        AsyncStorage.getItem('manso.onboarded'),
        AsyncStorage.getItem('manso.guest'),
      ]);
      if (savedLang === 'bn' || savedLang === 'en') setLangState(savedLang);
      const view = savedView || `viewer-${Math.random().toString(36).slice(2, 12)}`;
      setViewerKey(view);
      if (!savedView) await AsyncStorage.setItem('manso.viewer', view);
      setOnboarded(savedOnboard === '1');
      const guestLines: GuestLine[] = savedGuest ? JSON.parse(savedGuest) : [];
      setGuest(guestLines);
      let nextBranch: Branch | null = savedBranch ? JSON.parse(savedBranch) : null;
      if (nextBranch) setBranchState(nextBranch);
      if (!savedToken && guestLines.length && nextBranch) {
        try {
          const products = await api.products(nextBranch.id);
          const map: Record<string, Product> = {};
          for (const product of products) {
            if (guestLines.some(line => line.productId === product.id)) map[product.id] = product;
          }
          setGuestProducts(map);
          paintGuest(guestLines, map, nextBranch.id);
        } catch {
          paintGuest(guestLines, {}, nextBranch.id);
        }
      }
      if (savedToken) {
        setToken(savedToken);
        try {
          const me = await api.me();
          setUser(me);
          const [nextBasket, nextAddresses, nextConsent] = await Promise.all([
            api.basket(),
            api.addresses(),
            api.consents(),
          ]);
          setBasket(nextBasket);
          setAddresses(nextAddresses);
          setConsentState(nextConsent);
          if (!nextBranch && me.preferredBranchId) {
            const branches = await api.branches();
            nextBranch = branches.find(item => item.id === me.preferredBranchId) ?? null;
            if (nextBranch) {
              setBranchState(nextBranch);
              await AsyncStorage.setItem('manso.branch', JSON.stringify(nextBranch));
            }
          }
          if (me.language === 'BN') setLangState('bn');
        } catch {
          setToken(null);
          await AsyncStorage.removeItem('manso.token');
        }
      }
      setReady(true);
    })();
  }, []);

  const store: Store = {
    ready,
    lang,
    setLang: next => {
      setLangState(next);
      AsyncStorage.setItem('manso.lang', next);
      if (user) api.updateMe({ language: next === 'bn' ? 'BN' : 'EN' }).catch(() => undefined);
    },
    user,
    branch,
    setBranch: async next => {
      setBranchState(next);
      await AsyncStorage.setItem('manso.branch', JSON.stringify(next));
      if (user) await api.updateMe({ preferredBranchId: next.id }).catch(() => undefined);
    },
    basket,
    basketCount: user ? basket.items.length : guest.length,
    refreshBasket,
    addCut: async (product, grams, optionId, note) => {
      if (!branch) throw new Error('Choose a branch first.');
      if (!user) {
        const lines = guest.filter(item => item.productId !== product.id);
        if (grams > 0) lines.push({ productId: product.id, grams, optionId, note });
        const products = { ...guestProducts, [product.id]: product };
        setGuest(lines);
        setGuestProducts(products);
        paintGuest(lines, products, branch.id);
        await AsyncStorage.setItem('manso.guest', JSON.stringify(lines));
        return;
      }
      setBasket(await api.setItem({ branchId: branch.id, productId: product.id, grams, optionId, note }));
    },
    changeCut: async (productId, grams) => {
      if (!branch) return;
      if (!user) {
        const existing = guest.find(item => item.productId === productId);
        const lines = guest.filter(item => item.productId !== productId);
        if (grams > 0) lines.push({ productId, grams, optionId: existing?.optionId, note: existing?.note });
        setGuest(lines);
        paintGuest(lines, guestProducts, branch.id);
        await AsyncStorage.setItem('manso.guest', JSON.stringify(lines));
        return;
      }
      setBasket(await api.setItem({ branchId: branch.id, productId, grams }));
    },
    updateProfile: async body => {
      setUser(await api.updateMe(body));
    },
    addresses,
    refreshAddresses,
    addAddress: async body => {
      const created = await api.addAddress(body);
      setAddresses(await api.addresses());
      return created;
    },
    consent,
    setConsent: async patch => {
      if (!user) {
        setConsentState({ ...consent, ...patch });
        return;
      }
      setConsentState(await api.updateConsents(patch));
    },
    signIn: async (phone, code) => {
      const result = await api.verify(phone, code);
      setToken(result.accessToken);
      await AsyncStorage.setItem('manso.token', result.accessToken);
      setUser(result.user);
      if (branch) {
        for (const item of guest) {
          await api.setItem({
            branchId: branch.id,
            productId: item.productId,
            grams: item.grams,
            optionId: item.optionId,
            note: item.note,
          });
        }
      }
      setGuest([]);
      await AsyncStorage.removeItem('manso.guest');
      setBasket(await api.basket());
      setAddresses(await api.addresses());
      setConsentState(await api.consents());
      if (result.user.language === 'BN') setLangState('bn');
    },
    signOut: async () => {
      setToken(null);
      setUser(null);
      setAddresses([]);
      setBasket({ branchId: branch?.id ?? null, items: [], estimatedSubtotalPoisha: 0 });
      await AsyncStorage.removeItem('manso.token');
    },
    deleteAccount: async () => {
      await api.deleteAccount();
      setToken(null);
      setUser(null);
      setAddresses([]);
      await AsyncStorage.removeItem('manso.token');
    },
    toast,
    notify,
    viewerKey,
    onboarded,
    finishOnboarding: () => {
      setOnboarded(true);
      AsyncStorage.setItem('manso.onboarded', '1');
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('Store missing');
  return ctx;
}
