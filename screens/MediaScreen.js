import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Film, Save, RefreshCw } from 'lucide-react-native';

export default function MediaScreen() {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [inputUrl, setInputUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // 核心黑科技：智能推算 Emby 地址
  const guessEmbyUrl = (unraidUrl) => {
    if (!unraidUrl) return '';
    
    // 判断是不是纯 IP 地址 (例如 http://192.168.1.100:8088)
    const isIp = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}/.test(unraidUrl);
    
    if (isIp) {
      // 如果是局域网 IP，默认把端口换成 Emby 的默认端口 8096
      return unraidUrl.replace(/:\d+$/, ':8096');
    } else {
      // 如果是域名 (例如 https://aaa.bbb.ccc:123)，用正则把第一段前缀替换为 emby
      // 结果会自动变成 https://emby.bbb.ccc:123
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
          // 如果还没有配置过影音地址，就去读取 Unraid 地址进行推算
          const savedUnraidUrl = await AsyncStorage.getItem('@server_url');
          if (savedUnraidUrl) {
            setInputUrl(guessEmbyUrl(savedUnraidUrl));
          }
        }
      } catch (e) {
        console.log('读取地址失败', e);
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
    try {
      await AsyncStorage.setItem('@media_url', cleanUrl);
      setMediaUrl(cleanUrl);
    } catch (e) {
      console.log('保存失败', e);
    }
  };

  const handleResetUrl = async () => {
    try {
      await AsyncStorage.removeItem('@media_url');
      setMediaUrl(null);
      // 重置时再次自动推算
      const savedUnraidUrl = await AsyncStorage.getItem('@server_url');
      if (savedUnraidUrl) setInputUrl(guessEmbyUrl(savedUnraidUrl));
    } catch (e) {
      console.log('重置失败', e);
    }
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#f59e0b" /></View>;
  }

  // 配置引导页
  if (!mediaUrl) {
    return (
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.setupCard}>
          <Film color="#f59e0b" size={48} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.setupTitle}>私人影音库</Text>
          <Text style={styles.setupSub}>已根据您的 Unraid 服务器地址自动推算出 Emby 地址，请确认：</Text>
          
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
            <Text style={styles.saveBtnText}>进入影音库</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // 影音内嵌页
  return (
    <View style={styles.webViewContainer}>
      {/* 极简顶栏：保留一个退出的后门 */}
      <View style={styles.miniHeader}>
        <Text style={styles.miniHeaderText} numberOfLines={1}>📍 {mediaUrl}</Text>
        <TouchableOpacity onPress={handleResetUrl} style={styles.resetBtn}>
          <RefreshCw color="#9ca3af" size={16} />
          <Text style={styles.resetText}>重新配置</Text>
        </TouchableOpacity>
      </View>
      
      {/* Emby 官方 Web 端将在这里完美呈现 */}
      <WebView 
        source={{ uri: mediaUrl }} 
        style={styles.webView}
        showsVerticalScrollIndicator={false}
        startInLoadingState={true}
        renderLoading={() => <View style={styles.webViewLoader}><ActivityIndicator size="large" color="#f59e0b" /></View>}
      />
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
  
  webViewContainer: { flex: 1, backgroundColor: '#000000' }, // 纯黑背景提升观影沉浸感
  miniHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1f2937', paddingTop: 45, paddingBottom: 10, paddingHorizontal: 16 },
  miniHeaderText: { color: '#6b7280', fontSize: 12, flex: 1, marginRight: 10 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  resetText: { color: '#9ca3af', fontSize: 12, marginLeft: 4 },
  webView: { flex: 1, backgroundColor: '#000000' },
  webViewLoader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }
});