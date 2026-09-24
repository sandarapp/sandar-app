import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from '../../../packages/auth-client/src/client';
const key = 'sandar.auth.refresh.v1';
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
/** Never falls back to AsyncStorage or web storage. Access tokens stay in memory. */
export const tokenStore: TokenStore = {
  async get() { if (!(await SecureStore.isAvailableAsync())) throw new Error('Secure storage unavailable');return SecureStore.getItemAsync(key,options); },
  async set(value) { if (!(await SecureStore.isAvailableAsync())) throw new Error('Secure storage unavailable');await SecureStore.setItemAsync(key,value,options); },
  async remove() { await SecureStore.deleteItemAsync(key,options); }
};
