import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { Cpu, Database, HardDrive, Box, Activity, Monitor, AlertCircle, Wifi, Zap } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

export default function DashboardScreen({ navigation }) { // 注意这里加了 navigation，为下一步跳转做准备
  const [isConfigured, setIsConfigured] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // --- 全新状态管理 ---
  const [serverStatus, setServerStatus] = useState('offline'); // offline | online
  const [stats, setStats] = useState({ cpu: 0, memory: 0 });
  const [gpu, setGpu] = useState({ name: 'N/A', usage: 0 });
  const [storage, setStorage] = useState({ percentage: 0, total_used: 0, total_size: 0 });
  const [dockers, setDockers] = useState({ running: 0, total: 0, list: [] });
  const [vms, setVms] = useState({ running: 0, total: 0, list: [] });
  
  // 网速计算 (使用 useRef 保存上一次的数据，不触发重新渲染)
  const prevNetwork = useRef({ rx: 0, tx: 0, time: 0 });
  const [netSpeed, setNetSpeed] = useState({ down: 0, up: 0 }); // 单位 KB/s

  // 1. 核心抓取逻辑
  const fetchServerData = async () => {
    try {
      const savedUrl = await AsyncStorage.getItem('@server_url');
      const savedToken = await AsyncStorage.getItem('@api_token');
      if (!savedUrl || !savedToken) { setIsConfigured(false); return; }
      setIsConfigured(true);

      const response = await fetch(`${savedUrl}/api.php?token=${savedToken}&action=status`);
      const data = await response.json();
      
      if (data.server_status) setServerStatus(data.server_status);
      if (data.stats) setStats(data.stats);
      if (data.gpu) setGpu(data.gpu);
      if (data.storage) setStorage(data.storage);
      if (data.dockers) setDockers(data.dockers);
      if (data.vms) setVms(data.vms);

      // 计算网速逻辑
      if (data.network) {
        const now = Date.now();
        if (prevNetwork.current.time > 0) {
          const timeDiff = (now - prevNetwork.current.time) / 1000; // 秒
          const rxDiff = data.network.rx_bytes - prevNetwork.current.rx;
          const txDiff = data.network.tx_bytes - prevNetwork.current.tx;
          
          if (timeDiff > 0 && rxDiff >= 0 && txDiff >= 0) {
            setNetSpeed({
              down: (rxDiff / timeDiff / 1024).toFixed(1), // 转为 KB/s
              up: (txDiff / timeDiff / 1024).toFixed(1)
            });
          }
        }
        prevNetwork.current = { rx: data.network.rx_bytes, tx: data.network.tx_bytes, time: now };
      }
    } catch (error) {
      console.error(error);
      setServerStatus('offline'); // 连接失败则亮红灯
    }
  };

  // 2. 完美的 2 秒自动刷新机制
  useFocusEffect(
    useCallback(() => {
      fetchServerData(); // 页面出现时立刻抓取一次
      // 设置定时器，每 2000 毫秒 (2秒) 执行一次
      const interval = setInterval(() => {
        fetchServerData();
      }, 2000);
      
      // 页面离开时，清理定时器，节省手机电量
      return () => clearInterval(interval);
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchServerData();
    setRefreshing(false);
  }, []);

  // --- UI 组件封装 ---
  const ProgressBar = ({ title, percentage, icon: Icon }) => (
    <View style={styles.progressContainer}>
      <View style={styles.progressHeader}>
        <View style={styles.progressTitle}>
          <Icon color="#9ca3af" size={18} />
          <Text style={styles.progressText}>{title}</Text>
        </View>
        <Text style={styles.progressPercentage}>{percentage}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.bar, { width: `${percentage}%`, backgroundColor: percentage > 80 ? '#ef4444' : '#60a5fa' }]} />
      </View>
    </View>
  );

  // 格式化字节大小 (KB, MB, GB, TB)
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isConfigured) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <AlertCircle color="#9ca3af" size={64} style={{ marginBottom: 20 }} />
        <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>未配置服务器</Text>
        <Text style={{ color: '#9ca3af', textAlign: 'center' }}>请先点击底部的“设置”面板进行配置。</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60a5fa" />}
    >
      {/* 顶部指示灯与总览 */}
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.statusIndicator, { backgroundColor: serverStatus === 'online' ? '#10b981' : '#ef4444' }]} />
          <Text style={styles.headerText}>Unraid Server</Text>
        </View>
      </View>

      {/* GPU 与 网速双拼卡片 */}
      <View style={styles.row}>
        <View style={[styles.card, { flex: 1, marginRight: 8 }]}>
          <View style={styles.cardHeader}><Zap color="#a855f7" size={20} /><Text style={styles.cardTitle}>GPU</Text></View>
          <Text style={styles.mainNumber}>{gpu.usage}%</Text>
          <Text style={styles.subText} numberOfLines={1}>{gpu.name}</Text>
        </View>
        <View style={[styles.card, { flex: 1, marginLeft: 8 }]}>
          <View style={styles.cardHeader}><Wifi color="#3b82f6" size={20} /><Text style={styles.cardTitle}>网络</Text></View>
          <Text style={styles.subText}>↓ {netSpeed.down > 1024 ? (netSpeed.down/1024).toFixed(1) + ' MB/s' : netSpeed.down + ' KB/s'}</Text>
          <Text style={styles.subText}>↑ {netSpeed.up > 1024 ? (netSpeed.up/1024).toFixed(1) + ' MB/s' : netSpeed.up + ' KB/s'}</Text>
        </View>
      </View>

      {/* CPU 与 内存 */}
      <View style={styles.card}>
        <ProgressBar title="CPU 使用率" percentage={stats.cpu} icon={Cpu} />
        <ProgressBar title="内存使用率" percentage={stats.memory} icon={Database} />
      </View>

      {/* 存储总览 (可点击进入二级页面) */}
      <TouchableOpacity style={styles.card} onPress={() => Alert.alert('提示', '存储二级页面即将到来！')}>
        <View style={styles.cardHeader}>
          <HardDrive color="#10b981" size={24} />
          <Text style={styles.cardTitle}>阵列存储</Text>
        </View>
        <Text style={styles.mainNumber}>{storage.percentage}%</Text>
        <Text style={styles.subText}>已用 {formatBytes(storage.total_used)} / 总共 {formatBytes(storage.total_size)}</Text>
        <View style={[styles.track, { marginTop: 12 }]}>
          <View style={[styles.bar, { width: `${storage.percentage}%`, backgroundColor: storage.percentage > 80 ? '#ef4444' : '#10b981' }]} />
        </View>
      </TouchableOpacity>

      {/* Docker 入口卡片 */}
      <TouchableOpacity style={styles.card} onPress={() => Alert.alert('提示', 'Docker 二级页面即将到来！')}>
        <View style={styles.cardHeader}>
          <Box color="#f59e0b" size={24} />
          <Text style={styles.cardTitle}>Docker 容器</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>运行中: <Text style={{ color: '#10b981', fontWeight: 'bold' }}>{dockers.running}</Text></Text>
          <Text style={styles.summaryText}>总计: {dockers.total}</Text>
        </View>
        <Text style={styles.clickHint}>点击查看详情并控制 ❯</Text>
      </TouchableOpacity>

      {/* VM 入口卡片 */}
      <TouchableOpacity style={styles.card} onPress={() => Alert.alert('提示', 'VM 虚拟机二级页面即将到来！')}>
        <View style={styles.cardHeader}>
          <Monitor color="#ec4899" size={24} />
          <Text style={styles.cardTitle}>虚拟机 (VM)</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>运行中: <Text style={{ color: '#10b981', fontWeight: 'bold' }}>{vms.running}</Text></Text>
          <Text style={styles.summaryText}>总计: {vms.total}</Text>
        </View>
        <Text style={styles.clickHint}>点击查看详情并控制 ❯</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 },
  statusIndicator: { width: 12, height: 12, borderRadius: 6, marginRight: 8, shadowColor: '#10b981', shadowOpacity: 0.8, shadowRadius: 8 },
  headerText: { color: '#ffffff', fontSize: 22, fontWeight: 'bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  card: { backgroundColor: '#1f2937', borderRadius: 16, padding: 20, marginBottom: 20, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  mainNumber: { color: '#ffffff', fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  subText: { color: '#9ca3af', fontSize: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  summaryText: { color: '#e5e7eb', fontSize: 16 },
  clickHint: { color: '#6b7280', fontSize: 12, textAlign: 'right', marginTop: 16 },
  progressContainer: { marginBottom: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressText: { color: '#d1d5db', fontSize: 14, marginLeft: 8 },
  progressPercentage: { color: '#ffffff', fontWeight: 'bold' },
  track: { height: 8, backgroundColor: '#374151', borderRadius: 4, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 },
});