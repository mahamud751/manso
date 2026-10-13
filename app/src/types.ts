export type Localized = { en: string; bn: string };
export type Lang = 'en' | 'bn';

export type Branch = {
  id: string;
  slug: string;
  name: string;
  area: string;
  addressLine: string;
  city: string;
  phone: string;
  lat: number;
  lng: number;
  opensAt: string;
  closesAt: string;
  collectionOpensAt: string;
  deliveryStartsAt: string;
  deliveryFeePoisha: number;
  minOrderPoisha: number;
  timezone: string;
  imageUrl: string | null;
  zones: { id: string; name: string; feePoisha: number }[];
};

export type Product = {
  id: string;
  slug: string;
  kind: 'BEEF' | 'BONELESS' | 'MINCE';
  name: Localized;
  description: Localized;
  boneContent: string;
  imageUrl: string | null;
  pricePerKgPoisha: number | null;
  incrementGrams: number;
  minGrams: number;
  maxGrams: number;
  availableGrams: number;
  inStock: boolean;
  batch: { id: string; code: string; preparationDate: string; releaseStatus: string } | null;
  options: { id: string; name: Localized }[];
};

export type User = {
  id: string;
  role: string;
  name: string;
  phone: string | null;
  language: 'EN' | 'BN';
  preferredBranchId: string | null;
};

export type Address = {
  id: string;
  label: string;
  line1: string;
  line2?: string | null;
  area: string;
  city: string;
  postcode?: string | null;
  isDefault: boolean;
};

export type BasketItem = {
  productId: string;
  grams: number;
  optionId?: string | null;
  optionName?: Localized | null;
  note?: string | null;
  lineTotalPoisha: number;
  available: boolean;
  product: Product | null;
};

export type Basket = {
  id?: string;
  branchId: string | null;
  items: BasketItem[];
  estimatedSubtotalPoisha: number;
};

export type SlotOffer = {
  branchId: string;
  mode: 'DELIVERY' | 'COLLECTION';
  timezone: string;
  serviceDate: string;
  movedToNextDay: boolean;
  deliveryStartsAt: string;
  collectionOpensAt: string;
  minOrderPoisha: number;
  slots: {
    id: string;
    label: string;
    startMinutes: number;
    endMinutes: number;
    remaining: number;
    mode: string;
    serviceDate: string;
  }[];
};

export type Quote = {
  id: string;
  mode: 'DELIVERY' | 'COLLECTION';
  serviceDate: string;
  slotLabel: string;
  subtotalPoisha: number;
  feePoisha: number;
  totalPoisha: number;
  currency: string;
  expiresAt: string;
  holdMinutes: number;
  address: Record<string, string | null>;
  lines: {
    productId: string;
    productName: string;
    batchCode: string;
    imageUrl: string | null;
    grams: number;
    unitPricePerKgPoisha: number;
    lineTotalPoisha: number;
    optionName: string | null;
    note: string | null;
  }[];
};

export type Order = {
  id: string;
  number: number;
  branchId: string;
  branch?: { name: string; area: string; addressLine: string; phone: string; lat: number; lng: number };
  mode: 'DELIVERY' | 'COLLECTION';
  status: string;
  paymentState: string;
  paymentMethod: string;
  serviceDate: string;
  slotLabel: string;
  address: Record<string, string | null>;
  subtotalPoisha: number;
  feePoisha: number;
  totalPoisha: number;
  collectionCode?: string;
  createdAt: string;
  lines: {
    productId: string;
    productName: string;
    batchCode: string;
    imageUrl: string | null;
    orderedGrams: number;
    unitPricePerKgPoisha: number;
    lineTotalPoisha: number;
    optionName: string | null;
    note: string | null;
  }[];
  events?: { status: string; note: string | null; createdAt: string }[];
  payments?: { id: string; method: string; amountPoisha: number; state: string; transactionId: string | null; createdAt: string }[];
  refunds?: { id: string; amountPoisha: number; reason: string; status: string; createdAt: string }[];
  driver?: { assignmentId: string; name?: string; phone?: string | null; status: string };
};

export type LiveSession = {
  id: string;
  branchId: string;
  title: Localized;
  summary: Localized;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  posterUrl: string | null;
  playbackUrl: string | null;
  viewerCount: number;
  batch: { id: string; code: string; releaseStatus: string; preparationDate: string } | null;
  pins: Product[];
};

export type Replay = {
  id: string;
  branchId: string;
  title: Localized;
  summary: Localized;
  recordedAt: string;
  serviceDate: string;
  durationSec: number;
  viewCount: number;
  posterUrl: string | null;
  orderable: boolean;
  soldOut: boolean;
  batch: { id: string; code: string; releaseStatus: string; preparationDate: string };
};

export type Notice = {
  id: string;
  type: string;
  title: Localized;
  body: Localized;
  deepLink: string;
  sessionId: string | null;
  orderId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type Consent = {
  liveAlerts: boolean;
  offers: boolean;
  orderUpdates: boolean;
};
