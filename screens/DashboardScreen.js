import React, { useState, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Cpu, Database, HardDrive, Box, Activity, Monitor, AlertCircle, Wifi, Zap, Server, Key } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

export default function DashboardScreen({ navigation }) {
  // 💡 状态管理：增加 isLoading 防止首屏空值冲突
  const [isLoading, setIsLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  
  const [inputUrl, setInputUrl] = useState('');
  const [inputToken, setInputToken] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [serverStatus, setServerStatus] = useState('offline');
  const [stats, setStats] = useState({ cpu: 0, memory: 0 });
  const [gpu, setGpu] = useState({ name: 'N/A', usage: 0 });
  const [storage, setStorage] = useState({ percentage: 0, total_used: 0, total_size: 0 });
  const [dockers, setDockers] = useState({ running: 0, total: 0, list: [] });
  const [vms, setVms] = useState({ running: 0, total: 0, list: [] });
  const prevNetwork = useRef({ rx: 0, tx: 0, time: 0 });
  const [netSpeed, setNetSpeed] = useState({ down: 0, up: 0 });

  const fetchServerData = async () => {
    try {
      const savedUrl = await AsyncStorage.getItem('@server_url');
      const savedToken = await AsyncStorage.getItem('@api_token');
      
      if (!savedUrl || !savedToken) { 
        setIsConfigured(false); 
        setIsLoading(false); // 结束加载，进入登录表单
        return; 
      }
      
      setIsConfigured(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 稍微缩短超时到8秒
      
      const response = await fetch(`${savedUrl}/api.php?token=${savedToken}&action=status`, { signal: controller.signal });
      clearTimeout(timeoutId);

      const data = await response.json();
      setServerStatus('online');
      
      // 💡 安全赋值：使用可选链或逻辑判断防止 data 为空
      if (data?.stats) setStats(data.stats);
      if (data?.gpu) setGpu(data.gpu);
      if (data?.storage) setStorage(data.storage);
      if (data?.dockers) setDockers(data.dockers);
      if (data?.vms) setVms(data.vms);
      
      if (data?.network) {
        const now = Date.now();
        if (prevNetwork.current.time > 0) {
          const timeDiff = (now - prevNetwork.current.time) / 1000;
          const rxDiff = data.network.rx_bytes - prevNetwork.current.rx;
          const txDiff = data.network.tx_bytes - prevNetwork.current.tx;
          if (timeDiff > 0 && rxDiff >= 0 && txDiff >= 0) {
            // 💡 容错计算：防止除零或异常导致闪退
            const downSpeed = (rxDiff / timeDiff / 1024).toFixed(1);
            const upSpeed = (txDiff / timeDiff / 1024).toFixed(1);
            setNetSpeed({ down: downSpeed, up: upSpeed });
          }
        }
        prevNetwork.current = { rx: data.network.rx_bytes, tx: data.network.tx_bytes, time: now };
      }
    } catch (error) {
      console.log('Fetch Error:', error);
      setServerStatus('offline');
    } finally {
      setIsLoading(false); // 无论如何，检查配置的流程结束了
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchServerData();
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchServerData();
      const interval = setInterval(() => fetchServerData(), 3000); // 稍微放缓轮询频率，减少压力
      return () => clearInterval(interval);
    }, [])
  );

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSaveConfig = async () => {
    if (!inputUrl || !inputToken) {
      Alert.alert('提示', '请完整填写服务器地址和 API Token');
      return;
    }
    
    let cleanUrl = inputUrl.trim();
    if (!cleanUrl.startsWith('http')) cleanUrl = 'http://' + cleanUrl;
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    
    setIsTesting(true);
    try {
      const response = await fetch(`${cleanUrl}/api.php?token=${inputToken.trim()}&action=status`);
      if (response.ok) {
        await AsyncStorage.setItem('@server_url', cleanUrl);
        await AsyncStorage.setItem('@api_token', inputToken.trim());
        Alert.alert('连接成功', '已接入 Unraid 服务器！');
        setIsConfigured(true);
        fetchServerData();
      } else {
        Alert.alert('连接失败', '服务器无响应或 Token 错误');
      }
    } catch (error) {
      Alert.alert('网络错误', '无法连接到指定的服务器地址');
    } finally {
      setIsTesting(false);
    }
  };

  // ==========================================
  // 💡 分流渲染逻辑：解决闪退的核心
  // ==========================================

  // 第一阶段：还在读存储
  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={{ color: '#9ca3af', marginTop: 16 }}>正在连接服务器...</Text>
      </View>
    );
  }

  // 第二阶段：没配置，看登录页
  if (!isConfigured) {
    return (
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.setupCard}>
          <Server color="#3b82f6" size={48} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.setupTitle}>连接 Unraid</Text>
          <Text style={styles.setupSub}>请输入主服务器的 API 访问凭证</Text>
          
          <View style={styles.inputContainer}>
            <Server color="#9ca3af" size={20} style={styles.inputIcon} />
            <TextInput 
              style={styles.input} 
              placeholder="http://192.168.x.x" 
              placeholderTextColor="#6b7280" 
              value={inputUrl} 
              onChangeText={setInputUrl} 
              autoCapitalize="none" 
              keyboardType="url" 
            />
          </View>

          <View style={styles.inputContainer}>
            <Key color="#9ca3af" size={20} style={styles.inputIcon} />
            <TextInput 
              style={styles.input} 
              placeholder="API Token 密钥" 
              placeholderTextColor="#6b7280" 
              value={inputToken} 
              onChangeText={setInputToken} 
              secureTextEntry={true} 
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveConfig} disabled={isTesting}>
            {isTesting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveBtnText}>接入控制台</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // 第三阶段：已配置，看仪表盘
  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60a5fa" />}
    >
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.statusIndicator, { backgroundColor: serverStatus === 'online' ? '#10b981' : '#ef4444' }]} />
          <Text style={styles.headerText}>Unraid Server</Text>
        </View>
      </View>

      <View style={styles.gridRow}>
        <View style={[styles.card, styles.gridCard, { marginRight: 8 }]}>
          <View style={styles.cardHeader}><Cpu color="#f59e0b" size={20} /><Text style={styles.cardTitle}>CPU</Text></View>
          <Text style={styles.mainNumber}>{stats?.cpu || 0}%</Text>
          <View style={styles.miniTrack}>
            <View style={[styles.miniBar, { width: `${stats?.cpu || 0}%`, backgroundColor: stats?.cpu > 80 ? '#ef4444' : '#f59e0b' }]} />
          </View>
        </View>
        <View style={[styles.card, styles.gridCard, { marginLeft: 8 }]}>
          <View style={styles.cardHeader}><Zap color="#a855f7" size={20} /><Text style={styles.cardTitle}>GPU</Text></View>
          <Text style={styles.mainNumber}>{gpu?.usage || 0}%</Text>
          <Text style={styles.subText} numberOfLines={1}>{gpu?.name || 'N/A'}</Text>
        </View>
      </View>

      <View style={styles.gridRow}>
        <View style={[styles.card, styles.gridCard, { marginRight: 8 }]}>
          <View style={styles.cardHeader}><Database color="#10b981" size={20} /><Text style={styles.cardTitle}>内存</Text></View>
          <Text style={styles.mainNumber}>{stats?.memory || 0}%</Text>
          <View style={styles.miniTrack}>
            <View style={[styles.miniBar, { width: `${stats?.memory || 0}%`, backgroundColor: stats?.memory > 80 ? '#ef4444' : '#10b981' }]} />
          </View>
        </View>
        <View style={[styles.card, styles.gridCard, { marginLeft: 8 }]}>
          <View style={styles.cardHeader}><Wifi color="#3b82f6" size={20} /><Text style={styles.cardTitle}>网络</Text></View>
          <Text style={styles.subText}>↓ {netSpeed.down > 1024 ? (netSpeed.down/1024).toFixed(1) + ' MB/s' : netSpeed.down + ' KB/s'}</Text>
          <Text style={styles.subText}>↑ {netSpeed.up > 1024 ? (netSpeed.up/1024).toFixed(1) + ' MB/s' : netSpeed.up + ' KB/s'}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('存储详情')}>
        <View style={styles.cardHeader}><HardDrive color="#10b981" size={24} /><Text style={styles.cardTitle}>阵列存储</Text></View>
        <Text style={styles.mainNumber}>{storage?.percentage || 0}%</Text>
        <Text style={styles.subText}>已用 {formatBytes(storage?.total_used)} / 总共 {formatBytes(storage?.total_size)}</Text>
        <View style={[styles.track, { marginTop: 12 }]}><View style={[styles.bar, { width: `${storage?.percentage || 0}%`, backgroundColor: storage?.percentage > 80 ? '#ef4444' : '#10b981' }]} /></View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Docker详情')}>
        <View style={styles.cardHeader}><Box color="#3b82f6" size={24} /><Text style={styles.cardTitle}>Docker 容器</Text></View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>运行中: <Text style={{ color: '#10b981', fontWeight: 'bold' }}>{dockers?.running || 0}</Text></Text>
          <Text style={styles.summaryText}>总计: {dockers?.total || 0}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('VM详情')}>
        <View style={styles.cardHeader}><Monitor color="#ec4899" size={24} /><Text style={styles.cardTitle}>虚拟机 (VM)</Text></View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>运行中: <Text style={{ color: '#10b981', fontWeight: 'bold' }}>{vms?.running || 0}</Text></Text>
          <Text style={styles.summaryText}>总计: {vms?.total || 0}</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', padding: 20 },
  setupCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24, width: '100%', elevation: 5 },
  setupTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  setupSub: { color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#ffffff', height: 50, fontSize: 16 },
  saveBtn: { backgroundColor: '#3b82f6', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },

  container: { flex: 1, backgroundColor: '#111827' },
  content: { padding: 16, paddingBottom: 40, paddingTop: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingHorizontal: 4 },
  statusIndicator: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  headerText: { color: '#ffffff', fontSize: 22, fontWeight: 'bold' },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  gridCard: { flex: 1, marginBottom: 0 },
  card: { backgroundColor: '#1f2937', borderRadius: 16, padding: 20, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  mainNumber: { color: '#ffffff', fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  subText: { color: '#9ca3af', fontSize: 13 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  summaryText: { color: '#e5e7eb', fontSize: 16 },
  track: { height: 8, backgroundColor: '#374151', borderRadius: 4, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 },
  miniTrack: { height: 6, backgroundColor: '#374151', borderRadius: 3, marginTop: 12, overflow: 'hidden' },
  miniBar: { height: '100%', borderRadius: 3 },
});