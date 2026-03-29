import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Server, Key, Save, Moon, Sun } from 'lucide-react-native';

export default function SettingsScreen() {
  const [serverUrl, setServerUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [theme, setTheme] = useState('dark'); // 'dark' | 'light'

  useEffect(() => {
    const loadSettings = async () => {
      const savedUrl = await AsyncStorage.getItem('@server_url');
      const savedToken = await AsyncStorage.getItem('@api_token');
      const savedTheme = await AsyncStorage.getItem('@app_theme');
      if (savedUrl) setServerUrl(savedUrl);
      if (savedToken) setApiToken(savedToken);
      if (savedTheme) setTheme(savedTheme);
    };
    loadSettings();
  }, []);

  const saveSettings = async () => {
    const cleanUrl = serverUrl.replace(/\/$/, "");
    try {
      await AsyncStorage.setItem('@server_url', cleanUrl);
      await AsyncStorage.setItem('@api_token', apiToken);
      await AsyncStorage.setItem('@app_theme', theme);
      Alert.alert('保存成功', '配置已保存！(主题色全面应用将在后续重构全局路由时生效)');
    } catch (e) {
      Alert.alert('保存失败', '无法保存配置。');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.card}>
        <Text style={styles.headerTitle}>服务器配置</Text>
        
        <View style={styles.inputContainer}>
          <Server color="#9ca3af" size={20} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="http://192.168.1.100:8088"
            placeholderTextColor="#6b7280"
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Key color="#9ca3af" size={20} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="API 专属暗号"
            placeholderTextColor="#6b7280"
            value={apiToken}
            onChangeText={setApiToken}
            secureTextEntry={true}
          />
        </View>

        {/* 主题选择器 */}
        <Text style={[styles.headerTitle, { fontSize: 18, marginTop: 16, marginBottom: 12 }]}>外观主题</Text>
        <View style={styles.themeToggleContainer}>
          <TouchableOpacity 
            style={[styles.themeBtn, theme === 'dark' && styles.themeBtnActive]} 
            onPress={() => setTheme('dark')}
          >
            <Moon color={theme === 'dark' ? '#ffffff' : '#9ca3af'} size={18} />
            <Text style={[styles.themeBtnText, theme === 'dark' && { color: '#ffffff' }]}>暗黑模式</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.themeBtn, theme === 'light' && styles.themeBtnActive]} 
            onPress={() => setTheme('light')}
          >
            <Sun color={theme === 'light' ? '#ffffff' : '#9ca3af'} size={18} />
            <Text style={[styles.themeBtnText, theme === 'light' && { color: '#ffffff' }]}>亮色模式</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
          <Save color="#ffffff" size={20} />
          <Text style={styles.saveButtonText}>保存配置</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24 },
  headerTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#ffffff', height: 50, fontSize: 16 },
  themeToggleContainer: { flexDirection: 'row', backgroundColor: '#374151', borderRadius: 8, padding: 4, marginBottom: 24 },
  themeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 6 },
  themeBtnActive: { backgroundColor: '#4b5563', shadowColor: '#000', elevation: 2 },
  themeBtnText: { color: '#9ca3af', marginLeft: 8, fontWeight: 'bold' },
  saveButton: { flexDirection: 'row', backgroundColor: '#3b82f6', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  saveButtonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
});