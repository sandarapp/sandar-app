import React from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {FoundationApp} from './src/foundation/FoundationApp';
export default function App(){return <SafeAreaProvider><FoundationApp/></SafeAreaProvider>;}
// Retain the named native root export for existing consumers.
export const AuthApp=FoundationApp;
