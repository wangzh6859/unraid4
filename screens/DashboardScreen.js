import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, Switch, RefreshControl, Alert } from 'react-native';
import { Cpu, Database, HardDrive, Box, Activity, Monitor, AlertCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native'; // 引入这个可以监听页面切换

export default function DashboardScreen() {
  const [stats, setStats] = useState({ cpu: 0, memory: 0, storage: 0 });
  const [dockers, setDockers] = useState([]);
  const [vms, setVms] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // 记录是否已经配置了服务器
  const [isConfigured, setIsConfigured] = useState(true);

  // 1. 获取服务器数据的核心逻辑
  const fetchServerData = async () => {
    try {
      // 每次请求前，先从手机本地读取用户在“设置”里填写的 IP 和密码
      const savedUrl = await AsyncStorage.getItem('@server_url');
      const savedToken = await AsyncStorage.getItem('@api_token');

      if (!savedUrl || !savedToken) {
        setIsConfigured(false);
        return;
      }
      setIsConfigured(true);

      const response = await fetch(`${savedUrl}/api.php?token=${savedToken}&action=status`);
      const data = await response.json();
      
      if (data.stats) setStats(data.stats);
      if (data.dockers) setDockers(data.dockers);
      if (data.vms) setVms(data.vms);
    } catch (error) {
      console.error(error);
      Alert.alert('连接失败', '无法获取数据，请检查您的服务器配置以及网络连接。');
    }
  };

  // 2. 页面获得焦点时（比如从设置页切回来），自动刷新数据
  useFocusEffect(
    useCallback(() => {
      fetchServerData();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchServerData();
    setRefreshing(false);
  }, []);

  const toggleItem = async (name, currentStatus, type) => {
    try {
      const savedUrl = await AsyncStorage.getItem('@server_url');
      const savedToken = await AsyncStorage.getItem('@api_token');
      if (!savedUrl || !savedToken) return;

      const action = currentStatus === 'running' ? `stop_${type}` : `start_${type}`;
      const response = await fetch(`${savedUrl}/api.php?token=${savedToken}&action=${action}&target=${name}`);
      const result = await response.json();
      
      if (result.status === 'success') {
        fetchServerData();
      } else {
        Alert.alert('操作失败', result.message || '未知错误');
      }
    } catch (error) {
      Alert.alert('请求失败', '无法发送控制指令');
    }
  };

  // UI 组件封装
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

  // --- 如果用户还没配置，显示友好提示 ---
  if (!isConfigured) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <AlertCircle color="#9ca3af" size={64} style={{ marginBottom: 20 }} />
        <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: 'bold', marginBottom: 10 }}>未配置服务器</Text>
        <Text style={{ color: '#9ca3af', textAlign: 'center', fontSize: 16 }}>请先点击底部的“设置”面板，填写您的 Unraid 服务器地址和 API 暗号。</Text>
      </View>
    );
  }

  // --- 正常的数据展示界面 ---
  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60a5fa" colors={['#60a5fa']} />}
    >
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Activity color="#60a5fa" size={24} />
          <Text style={styles.cardTitle}>系统资源</Text>
        </View>
        <ProgressBar title="CPU 使用率" percentage={stats.cpu} icon={Cpu} />
        <ProgressBar title="内存使用率" percentage={stats.memory} icon={Database} />
        <ProgressBar title="阵列存储" percentage={stats.storage} icon={HardDrive} />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Box color="#60a5fa" size={24} />
          <Text style={styles.cardTitle}>Docker 容器</Text>
        </View>
        {dockers.map((docker, index) => (
          <View key={index} style={styles.listRow}>
            <View style={styles.itemInfo}>
              <View style={[styles.statusDot, { backgroundColor: docker.status === 'running' ? '#10b981' : '#ef4444' }]} />
              <Text style={styles.itemName}>{docker.name}</Text>
            </View>
            <Switch
              trackColor={{ false: '#374151', true: '#34d399' }}
              thumbColor={'#ffffff'}
              onValueChange={() => toggleItem(docker.name, docker.status, 'docker')}
              value={docker.status === 'running'}
            />
          </View>
        ))}
      </View>

      {vms.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Monitor color="#60a5fa" size={24} />
            <Text style={styles.cardTitle}>虚拟机 (VM)</Text>
          </View>
          {vms.map((vm, index) => (
            <View key={index} style={styles.listRow}>
              <View style={styles.itemInfo}>
                <View style={[styles.statusDot, { backgroundColor: vm.status === 'running' ? '#10b981' : '#ef4444' }]} />
                <Text style={styles.itemName}>{vm.name}</Text>
              </View>
              <Switch
                trackColor={{ false: '#374151', true: '#34d399' }}
                thumbColor={'#ffffff'}
                onValueChange={() => toggleItem(vm.name, vm.status, 'vm')}
                value={vm.status === 'running'}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#1f2937', borderRadius: 16, padding: 20, marginBottom: 20, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  cardTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
  progressContainer: { marginBottom: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressText: { color: '#d1d5db', fontSize: 14, marginLeft: 8 },
  progressPercentage: { color: '#ffffff', fontWeight: 'bold' },
  track: { height: 8, backgroundColor: '#374151', borderRadius: 4, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#374151' },
  itemInfo: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  itemName: { color: '#e5e7eb', fontSize: 16 },
});