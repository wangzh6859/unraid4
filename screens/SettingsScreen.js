import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Server, Key, Save } from 'lucide-react-native';

export default function SettingsScreen() {
  const [serverUrl, setServerUrl] = useState('');
  const [apiToken, setApiToken] = useState('');

  // 1. 页面加载时，尝试读取之前保存的配置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedUrl = await AsyncStorage.getItem('@server_url');
        const savedToken = await AsyncStorage.getItem('@api_token');
        if (savedUrl) setServerUrl(savedUrl);
        if (savedToken) setApiToken(savedToken);
      } catch (e) {
        console.error('读取配置失败', e);
      }
    };
    loadSettings();
  }, []);

  // 2. 点击保存按钮时，将数据存入手机本地
  const saveSettings = async () => {
    // 简单的格式校验
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
      Alert.alert('格式错误', '服务器地址必须以 http:// 或 https:// 开头');
      return;
    }
    
    // 自动去除网址末尾多余的斜杠，防止拼接 API 时出错
    const cleanUrl = serverUrl.replace(/\/$/, "");

    try {
      await AsyncStorage.setItem('@server_url', cleanUrl);
      await AsyncStorage.setItem('@api_token', apiToken);
      setServerUrl(cleanUrl); // 更新输入框显示
      Alert.alert('保存成功', '您的服务器配置已保存！现在可以去首页查看状态了。');
    } catch (e) {
      Alert.alert('保存失败', '无法保存配置到本地。');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.headerTitle}>服务器配置</Text>
        <Text style={styles.subText}>请输入您在 Unraid 上配置的 API 地址和专属暗号。</Text>

        {/* 网址输入框 */}
        <View style={styles.inputContainer}>
          <Server color="#9ca3af" size={20} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="例如: http://192.168.1.100:8088"
            placeholderTextColor="#6b7280"
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        {/* 密码输入框 */}
        <View style={styles.inputContainer}>
          <Key color="#9ca3af" size={20} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="API 专属暗号"
            placeholderTextColor="#6b7280"
            value={apiToken}
            onChangeText={setApiToken}
            secureTextEntry={true} // 密码掩码显示
            autoCapitalize="none"
          />
        </View>

        {/* 保存按钮 */}
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
  card: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24, elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6 },
  headerTitle: { color: '#ffffff', fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subText: { color: '#9ca3af', fontSize: 14, marginBottom: 24, lineHeight: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#ffffff', height: 50, fontSize: 16 },
  saveButton: { flexDirection: 'row', backgroundColor: '#3b82f6', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  saveButtonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
});