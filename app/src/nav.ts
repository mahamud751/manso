import { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Home: undefined;
  Live: undefined;
  Shop: undefined;
  Orders: undefined;
};

export type RootStackParamList = {
  Welcome: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  SignIn: { next?: 'Fulfil' | 'Main' } | undefined;
  Branch: undefined;
  Product: { id: string };
  LiveWatch: { id: string };
  Replay: { id: string };
  Basket: undefined;
  Fulfil: undefined;
  Payment: { quoteId: string };
  Result: { orderId: string };
  Order: { id: string };
  Track: { id: string };
  Pickup: { id: string };
  Account: undefined;
  Notifications: undefined;
  Help: { orderId?: string } | undefined;
  Receipt: { id: string };
  Policy: { slug: 'terms' | 'privacy' };
};
