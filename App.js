import React from 'react';
import { StyleSheet, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// 💡 修正图标引入：如果解构报错，这种方式更稳
import * as LucideIcons from 'lucide-react-native'; 

import DashboardScreen from './screens/DashboardScreen';
import SettingsScreen from './screens/SettingsScreen';
import DockerDetailsScreen from './screens/DockerDetailsScreen';
import VmDetailsScreen from './screens/VmDetailsScreen';
import StorageDetailsScreen from './screens/StorageDetailsScreen';
import SmartDetailsScreen from './screens/SmartDetailsScreen';
import MediaGridScreen from './screens/MediaGridScreen';
import MediaDetailScreen from './screens/MediaDetailScreen';
import FilesScreen from './screens/FilesScreen';

// 忽略某些不重要的警告，防止干扰渲染
LogBox.ignoreLogs(['Sending `onAnimatedValueUpdate` with no listeners registered']);

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          // 💡 容错处理：确保图标组件存在
          const iconName = {
            '首页': 'Home',
            '文件': 'Folder',
            '影音': 'Film',
            '设置': 'Settings'
          }[route.name];
          
          const IconComponent = LucideIcons[iconName];
          return IconComponent ? <IconComponent color={color} size={size} /> : null;
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
      <Tab.Screen name="影音" component={MediaGridScreen} options={{ headerShown: false }} />
      <Tab.Screen name="设置" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="MediaDetail" component={MediaDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}