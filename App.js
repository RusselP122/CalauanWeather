import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Linking, SafeAreaView, StatusBar } from 'react-native';

let WebView = null;
try {
  WebView = require('react-native-webview').WebView;
} catch (_) {}

export default function App() {
  // If react-native-webview is installed and configured with a URL, render the web view
  // Otherwise display the helper screen for mobile testing
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a1628" />
      <View style={styles.content}>
        <Text style={styles.badge}>CALAUAN WEATHER</Text>
        <Text style={styles.title}>Vite Mobile Web App</Text>
        <Text style={styles.description}>
          CalauanWeather is a responsive web application built with React DOM &amp; Vite for mobile browsers (Android Chrome &amp; iOS Safari).
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>📱 Testing on your mobile phone:</Text>
          <Text style={styles.cardText}>
            1. In your computer terminal, run:{"\n"}
            {"   "}<Text style={styles.code}>npm run dev</Text>
          </Text>
          <Text style={styles.cardText}>
            2. Open this address in your mobile browser (Android Chrome or iOS Safari):{"\n"}
            {"   "}<Text style={styles.code}>http://192.168.1.2:5173</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            Linking.openURL('http://192.168.1.2:5173').catch(() => {});
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Open in Mobile Browser</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  badge: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 24,
  },
  cardHeader: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  cardText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  code: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  button: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
