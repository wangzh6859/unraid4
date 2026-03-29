import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack'; // 引入堆栈导航
import { Home, Folder, Film, Settings } from 'lucide-react-native'; 

import DashboardScreen from './screens/DashboardScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// --- 占位二级页面 (下一步我们会把它们抽离成独立文件并完善控制逻辑) ---
function DockerDetailsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Docker 容器管理列表即将在此渲染！</Text>
    </View>
  );
}

function VmDetailsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>虚拟机管理列表即将在此渲染！</Text>
    </View>
  );
}

// --- 将首页和它的二级页面打包成一个“堆栈 (Stack)” ---
function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1f2937' },
        headerTintColor: '#ffffff',
        contentStyle: { backgroundColor: '#111827' }
      }}
    >
      {/* 首页本身不显示顶部导航条，因为我们自己画了 Header */}
      <Stack.Screen name="仪表盘" component={DashboardScreen} options={{ headerShown: false }} />
      {/* 以下是二级页面，会自动带有返回按钮 */}
      <Stack.Screen name="Docker详情" component={DockerDetailsScreen} options={{ title: 'Docker 管理' }} />
      <Stack.Screen name="VM详情" component={VmDetailsScreen} options={{ title: '虚拟机 管理' }} />
    </Stack.Navigator>
  );
}

// 占位页面
function FilesScreen() { return <View style={styles.container}><Text style={styles.text}>WebDAV 管理</Text></View>; }
function MediaScreen() { return <View style={styles.container}><Text style={styles.text}>Emby 影音</Text></View>; }

// --- 底部主导航栏 ---
export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            if (route.name === '首页') return <Home color={color} size={size} />;
            if (route.name === '文件') return <Folder color={color} size={size} />;
            if (route.name === '影音') return <Film color={color} size={size} />;
            if (route.name === '设置') return <Settings color={color} size={size} />;
          },
          tabBarActiveTintColor: '#60a5fa',
          tabBarInactiveTintColor: '#9ca3af',
          headerStyle: { backgroundColor: '#1f2937' },
          headerTintColor: '#ffffff',
          tabBarStyle: { backgroundColor: '#1f2937', borderTopColor: '#374151' },
          sceneContainerStyle: { backgroundColor: '#111827' },
        })}
      >
        {/* 注意：这里的首页绑定的是 HomeStack，而不是单纯的 DashboardScreen 了！ */}
        <Tab.Screen name="首页" component={HomeStack} options={{ headerShown: false }} />
        <Tab.Screen name="文件" component={FilesScreen} />
        <Tab.Screen name="影音" component={MediaScreen} />
        <Tab.Screen name="设置" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' },
  text: { color: '#e5e7eb', fontSize: 16 },
});