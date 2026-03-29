import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Home, Folder, Film, Settings } from 'lucide-react-native'; 

// 引入所有子页面
import DashboardScreen from './screens/DashboardScreen';
import SettingsScreen from './screens/SettingsScreen';
import DockerDetailsScreen from './screens/DockerDetailsScreen';
import VmDetailsScreen from './screens/VmDetailsScreen';
import StorageDetailsScreen from './screens/StorageDetailsScreen';
import SmartDetailsScreen from './screens/SmartDetailsScreen';
// 原来的 MediaScreen 可以先注释掉
// import MediaScreen from './screens/MediaScreen';
import MediaGridScreen from './screens/MediaGridScreen';
import FilesScreen from './screens/FilesScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();


// 首页的堆栈路由
function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1f2937' },
        headerTintColor: '#ffffff',
        contentStyle: { backgroundColor: '#111827' }
      }}
    >
      <Stack.Screen name="仪表盘" component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Docker详情" component={DockerDetailsScreen} options={{ title: 'Docker 容器' }} />
      <Stack.Screen name="VM详情" component={VmDetailsScreen} options={{ title: '虚拟机' }} />
      <Stack.Screen name="存储详情" component={StorageDetailsScreen} options={{ title: '磁盘存储详情' }} />
      <Stack.Screen name="SMART详情" component={SmartDetailsScreen} options={{ title: 'S.M.A.R.T. 诊断' }} />
    </Stack.Navigator>
  );
}

// 底部主导航
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
        <Tab.Screen name="首页" component={HomeStack} options={{ headerShown: false }} />
        <Tab.Screen name="文件" component={FilesScreen} />
        {/* 将原来的 MediaScreen 替换为新的 MediaGridScreen */}
<Tab.Screen 
  name="影音" 
  component={MediaGridScreen} 
  options={{ headerShown: false }} 
/>
        <Tab.Screen name="设置" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' },
  text: { color: '#e5e7eb', fontSize: 16 },
});