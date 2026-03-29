import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView, Modal, BackHandler, Pressable, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Folder, Save, Server, Key, User, File, ChevronLeft, LogOut, HardDrive, Plus, ArrowDownUp, FolderPlus, FilePlus, UploadCloud, DownloadCloud } from 'lucide-react-native';
import base64 from 'base-64';
import { XMLParser } from 'fast-xml-parser';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

export default function FilesScreen({ navigation }) {
  const [davUrl, setDavUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPath, setCurrentPath] = useState(''); 
  const [fileList, setFileList] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  
  // 💡 新增：下拉刷新的状态
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 弹窗与传输状态
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isTransferVisible, setIsTransferVisible] = useState(false);
  const [transfers, setTransfers] = useState([]); 

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
          const urlObj = savedUrl.match(/^(https?:\/\/[^\/]+)(.*)$/);
          setCurrentPath(urlObj && urlObj[2] ? urlObj[2] : '/');
        }
      } catch (e) { console.log(e); } finally { setIsLoading(false); }
    };
    loadConfig();
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0 || bytes === '0') return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const testConnection = async () => {
    if (!davUrl || !username || !password) { Alert.alert('提示', '请完整填写信息'); return; }
    let cleanUrl = davUrl.trim();
    if (!cleanUrl.endsWith('/')) cleanUrl += '/'; 

    setIsTesting(true);
    try {
      const credentials = base64.encode(`${username}:${password}`);
      const headers = { 'Authorization': `Basic ${credentials}`, 'Depth': '1', 'Content-Type': 'application/xml' };
      let response = await fetch(cleanUrl, { method: 'PROPFIND', headers });

      if (response.status === 405 && !cleanUrl.endsWith('/dav/')) {
        const alistUrl = cleanUrl + 'dav/';
        let retryResponse = await fetch(alistUrl, { method: 'PROPFIND', headers });
        if (retryResponse.status === 200 || retryResponse.status === 207) {
          response = retryResponse;
          cleanUrl = alistUrl;
        }
      }

      if (response.status === 200 || response.status === 207) {
        await AsyncStorage.setItem('@dav_url', cleanUrl); 
        await AsyncStorage.setItem('@dav_user', username);
        await AsyncStorage.setItem('@dav_pass', password);
        const urlObj = cleanUrl.match(/^(https?:\/\/[^\/]+)(.*)$/);
        setCurrentPath(urlObj && urlObj[2] ? urlObj[2] : '/');
        setIsConnected(true);
      } else { Alert.alert('连接失败', `状态码：${response.status}`); }
    } catch (error) { Alert.alert('网络错误', '无法连接'); } finally { setIsTesting(false); }
  };

  const fetchDirectory = useCallback(async (targetPath) => {
    setIsLoadingList(true);
    try {
      const originMatch = davUrl.match(/^(https?:\/\/[^\/]+)/);
      const fullUrl = (originMatch ? originMatch[1] : '') + targetPath;
      const credentials = base64.encode(`${username}:${password}`);
      const response = await fetch(fullUrl, {
        method: 'PROPFIND',
        headers: { 'Authorization': `Basic ${credentials}`, 'Depth': '1', 'Content-Type': 'application/xml' },
      });

      const xmlText = await response.text();
      const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
      const result = parser.parse(xmlText);

      let responses = result?.multistatus?.response;
      if (!responses) { setFileList([]); setCurrentPath(targetPath); return; }
      if (!Array.isArray(responses)) responses = [responses]; 

      let parsedFiles = [];
      responses.forEach((res) => {
        let href = res.href;
        if (href.startsWith('http')) {
          const hMatch = href.match(/^https?:\/\/[^\/]+(.*)$/);
          href = hMatch ? hMatch[1] : href;
        }
        if (href === targetPath || href === targetPath + '/') return;

        const props = res.propstat?.prop || (Array.isArray(res.propstat) ? res.propstat[0].prop : {});
        const isFolder = props.resourcetype && props.resourcetype.collection === '';
        let displayName = props.displayname;

        if (!displayName) {
          const parts = href.split('/').filter(p => p !== '');
          displayName = parts[parts.length - 1];
          try { displayName = decodeURIComponent(displayName); } catch(e){}
        }

        parsedFiles.push({ name: displayName, href: href, isFolder: isFolder, size: props.getcontentlength || 0 });
      });

      parsedFiles.sort((a, b) => {
        if (a.isFolder === b.isFolder) return a.name.localeCompare(b.name);
        return a.isFolder ? -1 : 1;
      });

      setFileList(parsedFiles);
      setCurrentPath(targetPath);
    } catch (error) { Alert.alert('错误', '读取目录失败'); } finally { setIsLoadingList(false); }
  }, [davUrl, username, password]);

  useEffect(() => {
    if (isConnected && currentPath) fetchDirectory(currentPath);
  }, [isConnected]);

  // 💡 新增：下拉刷新处理函数
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchDirectory(currentPath);
    setIsRefreshing(false);
  }, [currentPath, fetchDirectory]);

  const rootPathMatch = davUrl.match(/^(https?:\/\/[^\/]+)(.*)$/);
  const rootPath = rootPathMatch && rootPathMatch[2] ? rootPathMatch[2] : '/';
  const isAtRoot = currentPath === rootPath || currentPath === rootPath + '/';

  const goBack = useCallback(() => {
    if (isAtRoot) return;
    let p = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
    fetchDirectory(p.substring(0, p.lastIndexOf('/') + 1));
  }, [currentPath, isAtRoot, fetchDirectory]);

  useEffect(() => {
    const onBackPress = () => {
      if (isConnected && !isAtRoot) { goBack(); return true; }
      return false; 
    };
    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [isConnected, isAtRoot, goBack]);

  const disconnect = async () => {
    await AsyncStorage.removeItem('@dav_pass');
    setIsMenuVisible(false);
    setIsConnected(false);
  };

  // ==========================================
  // 🚀 核心上传逻辑：彻底修复 URL 拼接错误
  // ==========================================
  const handleUpload = async () => {
    setIsMenuVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        
        const newTransfer = { id: Date.now(), name: file.name, type: '上传', status: '正在传输...' };
        setTransfers(prev => [newTransfer, ...prev]);
        setIsTransferVisible(true);

        // 💡 修复拼接逻辑：获取根域名 + 绝对路径 + 文件名
        const originMatch = davUrl.match(/^(https?:\/\/[^\/]+)/);
        const origin = originMatch ? originMatch[1] : '';
        const targetDir = currentPath.endsWith('/') ? currentPath : currentPath + '/';
        const uploadUrl = origin + targetDir + encodeURIComponent(file.name);
        
        const credentials = base64.encode(`${username}:${password}`);

        const uploadRes = await FileSystem.uploadAsync(uploadUrl, file.uri, {
          httpMethod: 'PUT',
          headers: { 'Authorization': `Basic ${credentials}` },
        });

        if (uploadRes.status === 201 || uploadRes.status === 204 || uploadRes.status === 200) {
          setTransfers(prev => prev.map(t => t.id === newTransfer.id ? { ...t, status: '✅ 成功' } : t));
          fetchDirectory(currentPath); // 上传完立刻刷新列表
        } else {
          setTransfers(prev => prev.map(t => t.id === newTransfer.id ? { ...t, status: `❌ 失败 (${uploadRes.status})` } : t));
        }
      }
    } catch (error) {
      Alert.alert('上传失败', error.message);
    }
  };

  const handleDownload = async (item) => {
    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        Alert.alert('已取消', '你需要授权一个文件夹才能保存文件');
        return;
      }

      const newTransfer = { id: Date.now(), name: item.name, type: '下载', status: '正在传输...' };
      setTransfers(prev => [newTransfer, ...prev]);
      setIsTransferVisible(true);

      const originMatch = davUrl.match(/^(https?:\/\/[^\/]+)/);
      const downloadUrl = (originMatch ? originMatch[1] : '') + item.href;
      const credentials = base64.encode(`${username}:${password}`);

      const localUri = FileSystem.cacheDirectory + encodeURIComponent(item.name);
      const downloadRes = await FileSystem.downloadAsync(downloadUrl, localUri, {
        headers: { 'Authorization': `Basic ${credentials}` }
      });

      const base64Data = await FileSystem.readAsStringAsync(downloadRes.uri, { encoding: FileSystem.EncodingType.Base64 });
      const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, item.name, 'application/octet-stream');
      await FileSystem.writeAsStringAsync(newFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });

      setTransfers(prev => prev.map(t => t.id === newTransfer.id ? { ...t, status: '✅ 成功' } : t));
    } catch (error) {
      Alert.alert('下载失败', '文件可能过大或网络连接中断');
      setTransfers(prev => prev.map(t => t.name === item.name && t.status === '正在传输...' ? { ...t, status: '❌ 失败' } : t));
    }
  };

  // 💡 新增：核心删除逻辑 (WebDAV DELETE 协议)
  const handleDelete = (item) => {
    Alert.alert('确认删除', `确定要彻底删除 ${item.isFolder ? '文件夹' : '文件'} \n"${item.name}" 吗？\n此操作不可恢复！`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
          try {
            const originMatch = davUrl.match(/^(https?:\/\/[^\/]+)/);
            const origin = originMatch ? originMatch[1] : '';
            const deleteUrl = origin + item.href;
            const credentials = base64.encode(`${username}:${password}`);

            const res = await fetch(deleteUrl, {
              method: 'DELETE',
              headers: { 'Authorization': `Basic ${credentials}` }
            });

            if (res.status === 200 || res.status === 204) {
              fetchDirectory(currentPath); // 删完立刻刷新列表
            } else {
              Alert.alert('删除失败', `服务器拒绝执行 (HTTP ${res.status})\n请检查 AList 中该存储是否开启了写入权限。`);
            }
          } catch (error) {
            Alert.alert('删除出错', error.message);
          }
        }
      }
    ]);
  };

  const handleFileClick = (item) => {
    if (item.isFolder) {
      fetchDirectory(item.href);
    } else {
      Alert.alert('文件操作', `名称：${item.name}\n大小：${formatBytes(item.size)}`, [
        { text: '取消', style: 'cancel' },
        { text: '下载到手机', onPress: () => handleDownload(item) }
      ]);
    }
  };

  useLayoutEffect(() => {
    if (!isConnected) {
      navigation.setOptions({ title: '连接文件库', headerLeft: null, headerRight: null });
      return;
    }

    const pathParts = currentPath.split('/').filter(Boolean);
    const titleName = isAtRoot ? '根目录' : decodeURIComponent(pathParts[pathParts.length - 1]);

    navigation.setOptions({
      title: titleName,
      headerLeft: () => (
        !isAtRoot ? (
          <TouchableOpacity onPress={goBack} style={styles.headerBtnLeft}>
            <ChevronLeft color="#ffffff" size={28} />
          </TouchableOpacity>
        ) : null
      ),
      headerRight: () => (
        <View style={styles.headerBtnGroupRight}>
          <TouchableOpacity onPress={() => setIsTransferVisible(true)} style={styles.transferIconBtn}>
            <ArrowDownUp color="#3b82f6" size={20} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsMenuVisible(true)} style={{ marginLeft: 16 }}>
            <Plus color="#ffffff" size={28} />
          </TouchableOpacity>
        </View>
      )
    });
  }, [navigation, isConnected, currentPath, isAtRoot, goBack]);

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

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

  return (
    <View style={styles.fileContainer}>
      {isLoadingList && !isRefreshing ? (
        <View style={styles.listCenter}><ActivityIndicator size="large" color="#3b82f6" /></View>
      ) : (
        <ScrollView 
          style={styles.listScroll} 
          contentContainerStyle={styles.listContent}
          /* 💡 新增：原生下拉刷新控件 */
          refreshControl={
            <RefreshControl 
              refreshing={isRefreshing} 
              onRefresh={onRefresh} 
              tintColor="#3b82f6" 
              colors={['#3b82f6']} 
            />
          }
        >
          {fileList.length === 0 ? (
            <View style={styles.listCenter}><Text style={styles.emptyText}>空文件夹，下拉可刷新</Text></View>
          ) : (
            fileList.map((item, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.fileRow} 
                onPress={() => handleFileClick(item)}
                onLongPress={() => handleDelete(item)} // 💡 新增：长按触发删除
                delayLongPress={500}
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

      {/* --- 右上角下拉菜单 --- */}
      <Modal visible={isMenuVisible} transparent={true} animationType="fade" onRequestClose={() => setIsMenuVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsMenuVisible(false)}>
          <View style={styles.dropdownMenu}>
            <TouchableOpacity style={styles.menuItem} onPress={handleUpload}>
              <UploadCloud color="#e5e7eb" size={20} /><Text style={styles.menuText}>上传文件</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setIsMenuVisible(false); Alert.alert('提示', '新建文件夹功能开发中'); }}>
              <FolderPlus color="#e5e7eb" size={20} /><Text style={styles.menuText}>新建文件夹</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setIsMenuVisible(false); Alert.alert('提示', '新建文件功能开发中'); }}>
              <FilePlus color="#e5e7eb" size={20} /><Text style={styles.menuText}>新建文件</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.menuItem} onPress={disconnect}>
              <LogOut color="#ef4444" size={20} /><Text style={[styles.menuText, { color: '#ef4444' }]}>断开 WebDAV 连接</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* --- 传输任务中心 --- */}
      <Modal visible={isTransferVisible} animationType="slide" onRequestClose={() => setIsTransferVisible(false)}>
        <View style={styles.transferModal}>
          <View style={styles.transferHeader}>
            <Text style={styles.transferTitle}>传输任务</Text>
            <TouchableOpacity onPress={() => setIsTransferVisible(false)}><Text style={styles.closeText}>关闭</Text></TouchableOpacity>
          </View>
          
          <ScrollView contentContainerStyle={styles.transferContent}>
            {transfers.length === 0 ? (
              <View style={[styles.listCenter, { marginTop: 100 }]}>
                <ArrowDownUp color="#374151" size={48} style={{ marginBottom: 16 }} />
                <Text style={styles.emptyText}>当前没有正在进行的传输任务</Text>
              </View>
            ) : (
              transfers.map((item) => (
                <View key={item.id} style={styles.transferRow}>
                  <View style={styles.transferIconBox}>
                    {item.type === '上传' ? <UploadCloud color="#f59e0b" size={20} /> : <DownloadCloud color="#10b981" size={20} />}
                  </View>
                  <View style={styles.transferInfo}>
                    <Text style={styles.transferName} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.transferStatus, 
                      { color: item.status.includes('成功') ? '#10b981' : item.status.includes('失败') ? '#ef4444' : '#3b82f6' }
                    ]}>{item.type} - {item.status}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
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

  headerBtnLeft: { marginLeft: 8, padding: 4 },
  headerBtnGroupRight: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  transferIconBtn: { backgroundColor: 'rgba(59, 130, 246, 0.15)', padding: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' },

  fileContainer: { flex: 1, backgroundColor: '#111827' },
  listCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 300 },
  emptyText: { color: '#6b7280', fontSize: 16 },
  listScroll: { flex: 1 },
  listContent: { padding: 12 },
  fileRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', padding: 12, borderRadius: 12, marginBottom: 8 },
  fileIconBox: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, marginRight: 12 },
  fileInfo: { flex: 1, justifyContent: 'center' },
  fileName: { color: '#e5e7eb', fontSize: 15, fontWeight: '500' },
  fileSize: { color: '#9ca3af', fontSize: 12, marginTop: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  dropdownMenu: { position: 'absolute', top: Platform.OS === 'ios' ? 100 : 60, right: 16, backgroundColor: '#1f2937', borderRadius: 12, padding: 8, width: 200, elevation: 5 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuText: { color: '#e5e7eb', fontSize: 16, marginLeft: 12 },
  divider: { height: 1, backgroundColor: '#374151', marginVertical: 4 },

  transferModal: { flex: 1, backgroundColor: '#111827' },
  transferHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 20, backgroundColor: '#1f2937', borderBottomWidth: 1, borderBottomColor: '#374151' },
  transferTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  closeText: { color: '#3b82f6', fontSize: 16 },
  transferContent: { padding: 16 },
  transferRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  transferIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#374151', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  transferInfo: { flex: 1 },
  transferName: { color: '#e5e7eb', fontSize: 16, fontWeight: '500', marginBottom: 4 },
  transferStatus: { fontSize: 13, fontWeight: 'bold' },
});