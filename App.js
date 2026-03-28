import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Folder, Film, Settings } from 'lucide-react-native'; 

// 1. 引入我们刚刚在 screens 文件夹里写好的真实页面
import DashboardScreen from './screens/DashboardScreen';
import SettingsScreen from './screens/SettingsScreen';

// 2. 占位页面：文件和影音（因为我们还没写，先用假页面顶替，防止报错）
function FilesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>文件：WebDAV 管理页面即将到来</Text>
    </View>
  );
}

function MediaScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>影音：Emby 页面即将到来</Text>
    </View>
  );
}

// 3. 创建底部导航器
const Tab = createBottomTabNavigator();

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
        {/* 4. 将底部的 Tab 绑定到对应的真实组件上 */}
        <Tab.Screen name="首页" component={DashboardScreen} />
        <Tab.Screen name="文件" component={FilesScreen} />
        <Tab.Screen name="影音" component={MediaScreen} />
        <Tab.Screen name="设置" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// 样式表 (用于占位页面)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  text: {
    color: '#e5e7eb',
    fontSize: 18,
    fontWeight: 'bold',
  },
});