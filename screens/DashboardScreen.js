import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Cpu, Database, HardDrive, Box, Activity, Monitor, AlertCircle, Wifi, Zap } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

export default function DashboardScreen({ navigation }) {
  const [isConfigured, setIsConfigured] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serverStatus, setServerStatus] = useState('offline');

  // 数据状态
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
      if (!savedUrl || !savedToken) { setIsConfigured(false); return; }
      setIsConfigured(true);

      // 加了超时机制防止请求无限挂起
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${savedUrl}/api.php?token=${savedToken}&action=status`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      
      setServerStatus('online'); // 只要成功解析 JSON，就亮绿灯
      if (data.stats) setStats(data.stats);
      if (data.gpu) setGpu(data.gpu);
      if (data.storage) setStorage(data.storage);
      if (data.dockers) setDockers(data.dockers);
      if (data.vms) setVms(data.vms);

      if (data.network) {
        const now = Date.now();
        if (prevNetwork.current.time > 0) {
          const timeDiff = (now - prevNetwork.current.time) / 1000;
          const rxDiff = data.network.rx_bytes - prevNetwork.current.rx;
          const txDiff = data.network.tx_bytes - prevNetwork.current.tx;
          if (timeDiff > 0 && rxDiff >= 0 && txDiff >= 0) {
            setNetSpeed({ down: (rxDiff / timeDiff / 1024).toFixed(1), up: (txDiff / timeDiff / 1024).toFixed(1) });
          }
        }
        prevNetwork.current = { rx: data.network.rx_bytes, tx: data.network.tx_bytes, time: now };
      }
    } catch (error) {
      console.log('抓取失败:', error);
      setServerStatus('offline'); // 失败亮红灯
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchServerData();
      const interval = setInterval(() => fetchServerData(), 2000);
      return () => clearInterval(interval);
    }, [])
  );

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isConfigured) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <AlertCircle color="#9ca3af" size={64} style={{ marginBottom: 20 }} />
        <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: 'bold' }}>未配置服务器</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 顶部标题与指示灯 */}
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.statusIndicator, { backgroundColor: serverStatus === 'online' ? '#10b981' : '#ef4444' }]} />
          <Text style={styles.headerText}>Unraid Server</Text>
        </View>
      </View>

      {/* 四宫格数据区：GPU / 网络 */}
      <View style={styles.gridRow}>
        <View style={[styles.card, styles.gridCard, { marginRight: 8 }]}>
          <View style={styles.cardHeader}><Zap color="#a855f7" size={20} /><Text style={styles.cardTitle}>GPU</Text></View>
          <Text style={styles.mainNumber}>{gpu.usage}%</Text>
          <Text style={styles.subText} numberOfLines={1}>{gpu.name}</Text>
        </View>
        <View style={[styles.card, styles.gridCard, { marginLeft: 8 }]}>
          <View style={styles.cardHeader}><Wifi color="#3b82f6" size={20} /><Text style={styles.cardTitle}>网络</Text></View>
          <Text style={styles.subText}>↓ {netSpeed.down > 1024 ? (netSpeed.down/1024).toFixed(1) + ' MB/s' : netSpeed.down + ' KB/s'}</Text>
          <Text style={styles.subText}>↑ {netSpeed.up > 1024 ? (netSpeed.up/1024).toFixed(1) + ' MB/s' : netSpeed.up + ' KB/s'}</Text>
        </View>
      </View>

      {/* 四宫格数据区：CPU / 内存 (全新方块设计) */}
      <View style={styles.gridRow}>
        <View style={[styles.card, styles.gridCard, { marginRight: 8 }]}>
          <View style={styles.cardHeader}><Cpu color="#f59e0b" size={20} /><Text style={styles.cardTitle}>CPU</Text></View>
          <Text style={styles.mainNumber}>{stats.cpu}%</Text>
          <View style={styles.miniTrack}>
            <View style={[styles.miniBar, { width: `${stats.cpu}%`, backgroundColor: stats.cpu > 80 ? '#ef4444' : '#f59e0b' }]} />
          </View>
        </View>
        <View style={[styles.card, styles.gridCard, { marginLeft: 8 }]}>
          <View style={styles.cardHeader}><Database color="#10b981" size={20} /><Text style={styles.cardTitle}>内存</Text></View>
          <Text style={styles.mainNumber}>{stats.memory}%</Text>
          <View style={styles.miniTrack}>
            <View style={[styles.miniBar, { width: `${stats.memory}%`, backgroundColor: stats.memory > 80 ? '#ef4444' : '#10b981' }]} />
          </View>
        </View>
      </View>

      {/* 阵列存储 */}
      <TouchableOpacity style={styles.card} onPress={() => Alert.alert('提示', '即将进入存储详情页')}>
        <View style={styles.cardHeader}><HardDrive color="#10b981" size={24} /><Text style={styles.cardTitle}>阵列存储</Text></View>
        <Text style={styles.mainNumber}>{storage.percentage}%</Text>
        <Text style={styles.subText}>已用 {formatBytes(storage.total_used)} / 总共 {formatBytes(storage.total_size)}</Text>
        <View style={[styles.track, { marginTop: 12 }]}><View style={[styles.bar, { width: `${storage.percentage}%`, backgroundColor: storage.percentage > 80 ? '#ef4444' : '#10b981' }]} /></View>
      </TouchableOpacity>

      {/* Docker 容器 */}
      <TouchableOpacity style={styles.card} onPress={() => Alert.alert('提示', '即将进入 Docker 详情页')}>
        <View style={styles.cardHeader}><Box color="#3b82f6" size={24} /><Text style={styles.cardTitle}>Docker 容器</Text></View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>运行中: <Text style={{ color: '#10b981', fontWeight: 'bold' }}>{dockers.running}</Text></Text>
          <Text style={styles.summaryText}>总计: {dockers.total}</Text>
        </View>
      </TouchableOpacity>

      {/* 虚拟机 */}
      <TouchableOpacity style={styles.card} onPress={() => Alert.alert('提示', '即将进入 VM 详情页')}>
        <View style={styles.cardHeader}><Monitor color="#ec4899" size={24} /><Text style={styles.cardTitle}>虚拟机 (VM)</Text></View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>运行中: <Text style={{ color: '#10b981', fontWeight: 'bold' }}>{vms.running}</Text></Text>
          <Text style={styles.summaryText}>总计: {vms.total}</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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