import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Folder, Save, Server, Key, User } from 'lucide-react-native';
import base64 from 'base-64'; // 刚安装的纯 JS 加密插件

export default function FilesScreen() {
  const [davUrl, setDavUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 1. 页面加载时读取存过的配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const savedUrl = await AsyncStorage.getItem('@dav_url');
        const savedUser = await AsyncStorage.getItem('@dav_user');
        const savedPass = await AsyncStorage.getItem('@dav_pass');
        
        if (savedUrl) setDavUrl(savedUrl);
        if (savedUser) setUsername(savedUser);
        if (savedPass) setPassword(savedPass);
        
        // 如果三个都有，说明之前连成功过，可以直接进入文件列表状态
        if (savedUrl && savedUser && savedPass) {
          setIsConnected(true);
        }
      } catch (e) {
        console.log(e);
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  // 2. 核心：发起真实的 PROPFIND 探测请求！
  const testConnection = async () => {
    if (!davUrl || !username || !password) {
      Alert.alert('提示', '请完整填写地址、账号和密码');
      return;
    }

    let cleanUrl = davUrl.trim();
    if (!cleanUrl.endsWith('/')) cleanUrl += '/'; // 确保以斜杠结尾

    setIsTesting(true);
    try {
      // 将账号密码合并并进行 Base64 编码
      const credentials = base64.encode(`${username}:${password}`);
      
      // 发送极其硬核的 PROPFIND 请求
      const response = await fetch(cleanUrl, {
        method: 'PROPFIND',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Depth': '1', // 告诉服务器：只看当前目录，不要把几万个子文件全发给我
          'Content-Type': 'application/xml',
        },
      });

      // WebDAV 成功的状态码通常是 200 或 207 (Multi-Status)
      if (response.status === 200 || response.status === 207) {
        // 连接成功，保存配置
        await AsyncStorage.setItem('@dav_url', cleanUrl);
        await AsyncStorage.setItem('@dav_user', username);
        await AsyncStorage.setItem('@dav_pass', password);
        setIsConnected(true);
        Alert.alert('连接成功！', '已成功打通 WebDAV 底层通信。');
      } else if (response.status === 401) {
        Alert.alert('拒绝访问', '账号或密码错误 (401)');
      } else {
        Alert.alert('连接失败', `服务器返回异常状态码：${response.status}`);
      }
    } catch (error) {
      Alert.alert('网络错误', '无法连接到服务器，请检查地址是否正确。');
    } finally {
      setIsTesting(false);
    }
  };

  const disconnect = async () => {
    await AsyncStorage.removeItem('@dav_pass'); // 清除密码即可断开
    setIsConnected(false);
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  // --- 状态A：连接配置页 ---
  if (!isConnected) {
    return (
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.setupCard}>
          <Folder color="#3b82f6" size={48} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.setupTitle}>连接 WebDAV</Text>
          <Text style={styles.setupSub}>请输入 Unraid 上配置的 WebDAV 服务详情</Text>
          
          <View style={styles.inputContainer}>
            <Server color="#9ca3af" size={20} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="http://192.168.x.x:端口" placeholderTextColor="#6b7280" value={davUrl} onChangeText={setDavUrl} autoCapitalize="none" keyboardType="url" />
          </View>

          <View style={styles.inputContainer}>
            <User color="#9ca3af" size={20} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="用户名" placeholderTextColor="#6b7280" value={username} onChangeText={setUsername} autoCapitalize="none" />
          </View>

          <View style={styles.inputContainer}>
            <Key color="#9ca3af" size={20} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="密码" placeholderTextColor="#6b7280" value={password} onChangeText={setPassword} secureTextEntry={true} />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={testConnection} disabled={isTesting}>
            {isTesting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveBtnText}>测试并连接</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // --- 状态B：文件列表页 (下一战的目标) ---
  return (
    <View style={styles.fileContainer}>
      <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>WebDAV 已连接 🟢</Text>
      <Text style={{ color: '#9ca3af', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 }}>
        太棒了！你的 App 已经成功通过 HTTP 验证并拿到了第一批 XML 数据。
      </Text>
      
      <TouchableOpacity style={styles.disconnectBtn} onPress={disconnect}>
        <Text style={styles.disconnectBtnText}>断开连接</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', padding: 20 },
  setupCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24, elevation: 5 },
  setupTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  setupSub: { color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#ffffff', height: 50, fontSize: 16 },
  
  saveBtn: { backgroundColor: '#3b82f6', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },

  fileContainer: { flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  disconnectBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#374151', borderRadius: 8 },
  disconnectBtnText: { color: '#ef4444', fontWeight: 'bold' }
});