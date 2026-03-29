import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Film, Save, RefreshCw } from 'lucide-react-native';

export default function MediaScreen({ navigation }) {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [inputUrl, setInputUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // 智能推算 Emby 地址
  const guessEmbyUrl = (unraidUrl) => {
    if (!unraidUrl) return '';
    const isIp = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(unraidUrl);
    if (isIp) {
      return unraidUrl.replace(/:\d+$/, ':8096');
    } else {
      return unraidUrl.replace(/^(https?:\/\/)([^.:\/]+)/, '$1emby');
    }
  };

  useEffect(() => {
    const initializeMedia = async () => {
      try {
        const savedMediaUrl = await AsyncStorage.getItem('@media_url');
        if (savedMediaUrl) {
          setMediaUrl(savedMediaUrl);
        } else {
          const savedUnraidUrl = await AsyncStorage.getItem('@server_url');
          if (savedUnraidUrl) setInputUrl(guessEmbyUrl(savedUnraidUrl));
        }
      } catch (e) {
        console.log(e);
      } finally {
        setIsLoading(false);
      }
    };
    initializeMedia();
  }, []);

  const handleSaveUrl = async () => {
    if (!inputUrl) return;
    let cleanUrl = inputUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'http://' + cleanUrl;
    }
    await AsyncStorage.setItem('@media_url', cleanUrl);
    setMediaUrl(cleanUrl);
  };

  const handleResetUrl = async () => {
    await AsyncStorage.removeItem('@media_url');
    setMediaUrl(null);
    const savedUnraidUrl = await AsyncStorage.getItem('@server_url');
    if (savedUnraidUrl) setInputUrl(guessEmbyUrl(savedUnraidUrl));
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#f59e0b" /></View>;

  // 引导配置页
  if (!mediaUrl) {
    return (
      <View style={styles.center}>
        <View style={styles.setupCard}>
          <Film color="#f59e0b" size={48} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.setupTitle}>私人影音库</Text>
          <Text style={styles.setupSub}>已根据您的 Unraid 地址自动推算出 Emby 地址，请确认：</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="例如: https://emby.bbb.ccc:123"
              placeholderTextColor="#6b7280"
              value={inputUrl}
              onChangeText={setInputUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveUrl}>
            <Save color="#ffffff" size={20} />
            <Text style={styles.saveBtnText}>进入全屏影院</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.navigate('首页')}>
          <Text style={styles.cancelBtnText}>暂不配置，返回首页</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // WebView 渲染页
  return (
    <View style={styles.webViewContainer}>
      <WebView 
        source={{ uri: mediaUrl }} 
        style={styles.webView}
        showsVerticalScrollIndicator={false}
        startInLoadingState={true}
        renderLoading={() => <View style={styles.webViewLoader}><ActivityIndicator size="large" color="#f59e0b" /></View>}
      />
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={handleResetUrl}>
          <RefreshCw color="#ffffff" size={18} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', padding: 20 },
  setupCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24, elevation: 5 },
  setupTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  setupSub: { color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  inputContainer: { backgroundColor: '#374151', borderRadius: 8, marginBottom: 20, paddingHorizontal: 12 },
  input: { color: '#ffffff', height: 50, fontSize: 16 },
  saveBtn: { flexDirection: 'row', backgroundColor: '#f59e0b', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  cancelBtn: { marginTop: 20, alignSelf: 'center', padding: 10 },
  cancelBtnText: { color: '#9ca3af', fontSize: 14 },
  
  webViewContainer: { flex: 1, backgroundColor: '#000000' },
  webView: { flex: 1, backgroundColor: '#000000', marginTop: Platform.OS === 'ios' ? 40 : 25 }, 
  webViewLoader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' },
  fabContainer: { position: 'absolute', right: 16, bottom: 80, alignItems: 'center' }, // 悬浮球完美避开底栏
  fab: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(31, 41, 55, 0.7)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', elevation: 5 }
});