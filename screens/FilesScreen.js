import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Folder, Save, Server, Key, User, File, ChevronLeft, LogOut, HardDrive } from 'lucide-react-native';
import base64 from 'base-64';
import { XMLParser } from 'fast-xml-parser'; // 引入强大的 XML 解析器

export default function FilesScreen() {
  const [davUrl, setDavUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 文件列表相关的状态
  const [currentPath, setCurrentPath] = useState(''); // 当前正在浏览的绝对路径 (如 /dav/Movies/)
  const [fileList, setFileList] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // 1. 初始化读取配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const savedUrl = await AsyncStorage.getItem('@dav_url');
        const savedUser = await AsyncStorage.getItem('@dav_user');
        const savedPass = await AsyncStorage.getItem('@dav_pass');
        
        if (savedUrl) setDavUrl(savedUrl);
        if (savedUser) setUsername(savedUser);
        if (savedPass) setPassword(savedPass);
        
        if (savedUrl && savedUser && savedPass) {
          setIsConnected(true);
          // 提取初始路径
          const urlObj = savedUrl.match(/^(https?:\/\/[^\/]+)(.*)$/);
          if (urlObj && urlObj[2]) {
            setCurrentPath(urlObj[2]); 
          } else {
            setCurrentPath('/');
          }
        }
      } catch (e) { console.log(e); } finally { setIsLoading(false); }
    };
    loadConfig();
  }, []);

  // 2. 格式化文件大小
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0 || bytes === '0') return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 3. 核心：发起探测并连接
  const testConnection = async () => {
    if (!davUrl || !username || !password) { Alert.alert('提示', '请完整填写信息'); return; }
    let cleanUrl = davUrl.trim();
    if (!cleanUrl.endsWith('/')) cleanUrl += '/'; 

    setIsTesting(true);
    try {
      const credentials = base64.encode(`${username}:${password}`);
      const headers = { 'Authorization': `Basic ${credentials}`, 'Depth': '1', 'Content-Type': 'application/xml' };

      let response = await fetch(cleanUrl, { method: 'PROPFIND', headers });

      // AList 智能探测引擎
      if (response.status === 405 && !cleanUrl.endsWith('/dav/')) {
        const alistUrl = cleanUrl + 'dav/';
        let retryResponse = await fetch(alistUrl, { method: 'PROPFIND', headers });
        if (retryResponse.status === 200 || retryResponse.status === 207) {
          response = retryResponse;
          cleanUrl = alistUrl;
        }
      }

      if (response.status === 200 || response.status === 207) {
        await AsyncStorage.setItem('@dav_url', cleanUrl); // 这里存的就是包含 /dav/ 的最终地址
        await AsyncStorage.setItem('@dav_user', username);
        await AsyncStorage.setItem('@dav_pass', password);
        
        const urlObj = cleanUrl.match(/^(https?:\/\/[^\/]+)(.*)$/);
        setCurrentPath(urlObj && urlObj[2] ? urlObj[2] : '/');
        
        setIsConnected(true);
      } else {
        Alert.alert('连接失败', `状态码：${response.status}`);
      }
    } catch (error) { Alert.alert('网络错误', '无法连接'); } finally { setIsTesting(false); }
  };

  // 4. 核心：读取目录文件列表 (手撕 XML)
  const fetchDirectory = useCallback(async (targetPath) => {
    setIsLoadingList(true);
    try {
      const originMatch = davUrl.match(/^(https?:\/\/[^\/]+)/);
      const origin = originMatch ? originMatch[1] : '';
      const fullUrl = origin + targetPath;

      const credentials = base64.encode(`${username}:${password}`);
      const response = await fetch(fullUrl, {
        method: 'PROPFIND',
        headers: { 'Authorization': `Basic ${credentials}`, 'Depth': '1', 'Content-Type': 'application/xml' },
      });

      const xmlText = await response.text();

      // 配置 XML 解析器 (移除恶心的 DAV: 命名空间前缀)
      const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
      const result = parser.parse(xmlText);

      let responses = result?.multistatus?.response;
      if (!responses) { setFileList([]); return; }
      if (!Array.isArray(responses)) responses = [responses]; // 如果只有一个文件，转成数组

      let parsedFiles = [];
      responses.forEach((res) => {
        let href = res.href;
        // 兼容处理：有些 WebDAV 返回完整的 url，有些返回绝对路径
        if (href.startsWith('http')) {
          const hMatch = href.match(/^https?:\/\/[^\/]+(.*)$/);
          href = hMatch ? hMatch[1] : href;
        }
        
        // 跳过当前目录自身的节点
        if (href === targetPath || href === targetPath + '/') return;

        // 提取属性
        const props = res.propstat?.prop || (Array.isArray(res.propstat) ? res.propstat[0].prop : {});
        const isFolder = props.resourcetype && props.resourcetype.collection === '';
        let displayName = props.displayname;

        // 如果没有 displayname，从 href 截取最后一段
        if (!displayName) {
          const parts = href.split('/').filter(p => p !== '');
          displayName = parts[parts.length - 1];
          try { displayName = decodeURIComponent(displayName); } catch(e){}
        }

        parsedFiles.push({
          name: displayName,
          href: href,
          isFolder: isFolder,
          size: props.getcontentlength || 0,
          lastModified: props.getlastmodified || ''
        });
      });

      // 排序：文件夹排前面，然后按名字字母排序
      parsedFiles.sort((a, b) => {
        if (a.isFolder === b.isFolder) return a.name.localeCompare(b.name);
        return a.isFolder ? -1 : 1;
      });

      setFileList(parsedFiles);
      setCurrentPath(targetPath);
    } catch (error) {
      console.log('解析文件列表失败', error);
      Alert.alert('错误', '读取目录失败');
    } finally {
      setIsLoadingList(false);
    }
  }, [davUrl, username, password]);

  // 当连接状态变为 true，且 currentPath 有值时，自动抓取列表
  useEffect(() => {
    if (isConnected && currentPath) {
      fetchDirectory(currentPath);
    }
  }, [isConnected]);

  // 返回上一级目录
  const goBack = () => {
    const rootPathMatch = davUrl.match(/^(https?:\/\/[^\/]+)(.*)$/);
    const rootPath = rootPathMatch && rootPathMatch[2] ? rootPathMatch[2] : '/';

    if (currentPath === rootPath || currentPath === rootPath + '/') return; // 已经到顶了

    // 算法：去掉最后的斜杠，然后截取到上一个斜杠
    let p = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
    const lastSlash = p.lastIndexOf('/');
    const parentPath = p.substring(0, lastSlash + 1);
    fetchDirectory(parentPath);
  };

  const disconnect = async () => {
    await AsyncStorage.removeItem('@dav_pass');
    setIsConnected(false);
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  // --- 状态A：连接配置页 ---
  if (!isConnected) {
    return (
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.setupCard}>
          <HardDrive color="#3b82f6" size={48} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.setupTitle}>连接 WebDAV</Text>
          <Text style={styles.setupSub}>请输入 Unraid AList 的 WebDAV 服务详情</Text>
          <View style={styles.inputContainer}>
            <Server color="#9ca3af" size={20} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="https://alist.bbb.ccc:123" placeholderTextColor="#6b7280" value={davUrl} onChangeText={setDavUrl} autoCapitalize="none" keyboardType="url" />
          </View>
          <View style={styles.inputContainer}>
            <User color="#9ca3af" size={20} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="用户名" placeholderTextColor="#6b7280" value={username} onChangeText={setUsername} autoCapitalize="none" />
          </View>
          <View style={styles.inputContainer}>
            <Key color="#9ca3af" size={20} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="密码" placeholderTextColor="#6b7280" value={password} onChangeText={setPassword} secureTextEntry={true} />
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={testConnection} disabled={isTesting}>
            {isTesting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveBtnText}>测试并连接</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // 获取根目录路径，用于判断是否显示返回按钮
  const rootPathMatch = davUrl.match(/^(https?:\/\/[^\/]+)(.*)$/);
  const rootPath = rootPathMatch && rootPathMatch[2] ? rootPathMatch[2] : '/';
  const isAtRoot = currentPath === rootPath || currentPath === rootPath + '/';

  // --- 状态B：文件列表大厅 ---
  return (
    <View style={styles.fileContainer}>
      {/* 顶部路径导航栏 */}
      <View style={styles.header}>
        <View style={styles.pathRow}>
          {!isAtRoot && (
            <TouchableOpacity onPress={goBack} style={styles.backBtn}>
              <ChevronLeft color="#ffffff" size={24} />
            </TouchableOpacity>
          )}
          <Text style={styles.pathText} numberOfLines={1}>
            {decodeURIComponent(currentPath)}
          </Text>
        </View>
        <TouchableOpacity onPress={disconnect} style={styles.logoutBtn}>
          <LogOut color="#ef4444" size={20} />
        </TouchableOpacity>
      </View>

      {/* 文件列表区域 */}
      {isLoadingList ? (
        <View style={styles.listCenter}><ActivityIndicator size="large" color="#3b82f6" /></View>
      ) : (
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
          {fileList.length === 0 ? (
            <View style={styles.listCenter}><Text style={styles.emptyText}>空文件夹</Text></View>
          ) : (
            fileList.map((item, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.fileRow}
                onPress={() => {
                  if (item.isFolder) {
                    fetchDirectory(item.href);
                  } else {
                    Alert.alert('提示', `这是一个文件：\n${item.name}\n大小：${formatBytes(item.size)}`);
                  }
                }}
              >
                <View style={styles.fileIconBox}>
                  {item.isFolder ? <Folder color="#3b82f6" size={24} fill="rgba(59, 130, 246, 0.2)" /> : <File color="#9ca3af" size={24} />}
                </View>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                  {!item.isFolder && <Text style={styles.fileSize}>{formatBytes(item.size)}</Text>}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', padding: 20 },
  setupCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24, elevation: 5 },
  setupTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  setupSub: { color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#ffffff', height: 50, fontSize: 16 },
  saveBtn: { backgroundColor: '#3b82f6', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },

  fileContainer: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1f2937', paddingTop: Platform.OS === 'ios' ? 50 : 20, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#374151' },
  pathRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 16 },
  backBtn: { marginRight: 8, padding: 4 },
  pathText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', flex: 1 },
  logoutBtn: { padding: 6, backgroundColor: '#3f1c1c', borderRadius: 8 },
  
  listCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 300 },
  emptyText: { color: '#6b7280', fontSize: 16 },
  listScroll: { flex: 1 },
  listContent: { padding: 12 },
  fileRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', padding: 12, borderRadius: 12, marginBottom: 8 },
  fileIconBox: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, marginRight: 12 },
  fileInfo: { flex: 1, justifyContent: 'center' },
  fileName: { color: '#e5e7eb', fontSize: 15, fontWeight: '500' },
  fileSize: { color: '#9ca3af', fontSize: 12, marginTop: 4 },
});