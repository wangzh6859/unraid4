import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Folder, Film, Settings } from 'lucide-react-native'; // 引入图标
import DashboardScreen from './screens/DashboardScreen';

// --- 1. 定义四大基础板块 (目前为占位页面) ---



function FilesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>文件：WebDAV 管理</Text>
    </View>
  );
}

function MediaScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>影音：Emby Webview 将在这里显示</Text>
    </View>
  );
}

function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>设置：服务器 IP、API、账号配置</Text>
    </View>
  );
}

// --- 2. 创建底部导航器 ---
const Tab = createBottomTabNavigator();

// --- 3. App 主组件 ---
export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          // 动态设置底部图标
          tabBarIcon: ({ color, size }) => {
            if (route.name === '首页') return <Home color={color} size={size} />;
            if (route.name === '文件') return <Folder color={color} size={size} />;
            if (route.name === '影音') return <Film color={color} size={size} />;
            if (route.name === '设置') return <Settings color={color} size={size} />;
          },
          // UI 主题配置 (暗黑风格)
          tabBarActiveTintColor: '#60a5fa', // 选中的颜色 (亮蓝色)
          tabBarInactiveTintColor: '#9ca3af', // 未选中的颜色 (灰色)
          headerStyle: { backgroundColor: '#1f2937' }, // 顶部标题栏背景色
          headerTintColor: '#ffffff', // 顶部标题文字颜色
          tabBarStyle: { backgroundColor: '#1f2937', borderTopColor: '#374151' }, // 底部导航栏背景色
          sceneContainerStyle: { backgroundColor: '#111827' }, // 每个页面的整体背景色
        })}
      >
        <Tab.Screen name="首页" component={DashboardScreen} />
        <Tab.Screen name="文件" component={FilesScreen} />
        <Tab.Screen name="影音" component={MediaScreen} />
        <Tab.Screen name="设置" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// --- 4. 样式表 ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#e5e7eb', // 浅灰色文字
    fontSize: 18,
    fontWeight: 'bold',
  },
});