import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { StoreProvider, useStore } from './src/store';
import { colors } from './src/theme';
import { t } from './src/i18n';
import { RootStackParamList, TabParamList } from './src/nav';
import { BranchScreen, SignInScreen, WelcomeScreen } from './src/screens/entry';
import { HomeScreen, ProductScreen, ShopScreen } from './src/screens/browse';
import { LiveHubScreen, LiveWatchScreen, ReplayScreen } from './src/screens/live';
import { BasketScreen, FulfilScreen, PaymentScreen, ResultScreen } from './src/screens/checkout';
import { OrderScreen, OrdersScreen, PickupScreen, ReceiptScreen, TrackScreen } from './src/screens/orders';
import { AccountScreen, HelpScreen, NotificationsScreen, PolicyScreen } from './src/screens/account';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.paper, card: colors.paper, primary: colors.orange, text: colors.dark, border: colors.line },
};

function Icon({ name, color }: { name: keyof TabParamList; color: string }) {
  if (name === 'Home') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z" fill={color} />
      </Svg>
    );
  }
  if (name === 'Live') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="4" fill={color} />
        <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth="2" fill="none" />
      </Svg>
    );
  }
  if (name === 'Shop') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M6 8 H18 L17 20 H7 Z" fill={color} />
        <Path d="M9 8 V7 a3 3 0 0 1 6 0 V8" stroke={colors.paper} strokeWidth="1.6" fill="none" />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Rect x="5" y="4" width="14" height="16" rx="2" fill={color} />
      <Path d="M8 9 H16 M8 13 H16 M8 17 H13" stroke={colors.paper} strokeWidth="1.6" />
    </Svg>
  );
}

function MainTabs() {
  const { lang } = useStore();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.orange,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line, height: 62 },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11 },
        tabBarIcon: ({ color }) => <Icon name={route.name} color={color} />,
      })}>
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: t('home', lang) }} />
      <Tabs.Screen name="Live" component={LiveHubScreen} options={{ title: t('live', lang) }} />
      <Tabs.Screen name="Shop" component={ShopScreen} options={{ title: t('shop', lang) }} />
      <Tabs.Screen name="Orders" component={OrdersScreen} options={{ title: t('orders', lang) }} />
    </Tabs.Navigator>
  );
}

function RootNav() {
  const { ready, onboarded, branch } = useStore();
  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.orange} />
        <Text style={styles.bootText}>MANSO</Text>
      </View>
    );
  }
  const initial = !onboarded ? 'Welcome' : branch ? 'Main' : 'Branch';
  return (
    <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="Branch" component={BranchScreen} />
      <Stack.Screen name="Product" component={ProductScreen} />
      <Stack.Screen name="LiveWatch" component={LiveWatchScreen} />
      <Stack.Screen name="Replay" component={ReplayScreen} />
      <Stack.Screen name="Basket" component={BasketScreen} />
      <Stack.Screen name="Fulfil" component={FulfilScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="Result" component={ResultScreen} />
      <Stack.Screen name="Order" component={OrderScreen} />
      <Stack.Screen name="Track" component={TrackScreen} />
      <Stack.Screen name="Pickup" component={PickupScreen} />
      <Stack.Screen name="Account" component={AccountScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="Receipt" component={ReceiptScreen} />
      <Stack.Screen name="Policy" component={PolicyScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <NavigationContainer theme={navTheme}>
          <RootNav />
        </NavigationContainer>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', gap: 12 },
  bootText: { color: colors.orange, fontWeight: '800', letterSpacing: 2 },
});
