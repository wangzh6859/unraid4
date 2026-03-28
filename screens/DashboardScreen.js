import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { Cpu, Database, HardDrive, Box, Activity } from 'lucide-react-native';

export default function DashboardScreen() {
  // 1. 模拟服务器资源数据
  const [stats, setStats] = useState({
    cpu: 45,
    memory: 68,
    storage: 82,
  });

  // 2. 模拟 Docker 容器数据
  const [dockers, setDockers] = useState([
    { id: '1', name: 'emby', status: 'running' },
    { id: '2', name: 'nextcloud', status: 'stopped' },
    { id: '3', name: 'qbittorrent', status: 'running' },
  ]);

  // 3. 模拟切换 Docker 状态的函数
  const toggleDocker = (id) => {
    setDockers(dockers.map(docker => {
      if (docker.id === id) {
        return { ...docker, status: docker.status === 'running' ? 'stopped' : 'running' };
      }
      return docker;
    }));
  };

  // 4. 进度条组件封装 (为了代码复用)
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
        <View style={[
          styles.bar, 
          { width: `${percentage}%`, backgroundColor: percentage > 80 ? '#ef4444' : '#60a5fa' } // 超过80%变红警告
        ]} />
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      
      {/* --- 系统资源卡片 --- */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Activity color="#60a5fa" size={24} />
          <Text style={styles.cardTitle}>系统资源</Text>
        </View>
        <ProgressBar title="CPU 使用率" percentage={stats.cpu} icon={Cpu} />
        <ProgressBar title="内存使用率" percentage={stats.memory} icon={Database} />
        <ProgressBar title="阵列存储" percentage={stats.storage} icon={HardDrive} />
      </View>

      {/* --- Docker & VM 管理卡片 --- */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Box color="#60a5fa" size={24} />
          <Text style={styles.cardTitle}>Docker 容器</Text>
        </View>
        
        {dockers.map((docker) => (
          <View key={docker.id} style={styles.dockerRow}>
            <View style={styles.dockerInfo}>
              {/* 状态指示小圆点 */}
              <View style={[styles.statusDot, { backgroundColor: docker.status === 'running' ? '#10b981' : '#ef4444' }]} />
              <Text style={styles.dockerName}>{docker.name}</Text>
            </View>
            <Switch
              trackColor={{ false: '#374151', true: '#34d399' }}
              thumbColor={'#ffffff'}
              onValueChange={() => toggleDocker(docker.id)}
              value={docker.status === 'running'}
            />
          </View>
        ))}
      </View>

    </ScrollView>
  );
}

// 5. 样式表 (暗黑风格)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 4, // 安卓阴影
    shadowColor: '#000', // iOS阴影
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // 元素间距
  },
  progressText: {
    color: '#d1d5db',
    fontSize: 14,
    marginLeft: 8,
  },
  progressPercentage: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  track: {
    height: 8,
    backgroundColor: '#374151',
    borderRadius: 4,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 4,
  },
  dockerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  dockerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  dockerName: {
    color: '#e5e7eb',
    fontSize: 16,
    textTransform: 'capitalize', // 首字母大写
  },
});