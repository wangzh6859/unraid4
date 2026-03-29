import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, FlatList, Image, Alert, Dimensions, TextInput, KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { XMLParser } from 'fast-xml-parser';
import base64 from 'base-64';
import { PlayCircle, RefreshCw, Film, Server, User, Key, Plus, FolderHeart, LogOut, Folder, ChevronRight, CheckCircle2, X, Trash2, Clock, FolderPlus } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const POSTER_WIDTH = (width - 48) / 3; 
const POSTER_HEIGHT = POSTER_WIDTH * 1.5; 

export default function MediaGridScreen({ navigation }) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [davUrl, setDavUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [libraries, setLibraries] = useState([]); 
  const [movieList, setMovieList] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]); 
  const [activeTab, setActiveTab] = useState('all'); 
  
  const [isScanning, setIsScanning] = useState(false); 
  const [scanProgress, setScanProgress] = useState(''); 
  const [loading, setLoading] = useState(true);

  // 弹窗状态
  const [showAddLibModal, setShowAddLibModal] = useState(false);
  const [browserMode, setBrowserMode] = useState('create'); 
  const [targetLibId, setTargetLibId] = useState(null);
  
  const [browserPath, setBrowserPath] = useState('/'); 
  const [browserFolders, setBrowserFolders] = useState([]); 
  const [browserLoading, setBrowserLoading] = useState(false);
  const [newLibName, setNewLibName] = useState('');
  const [newLibType, setNewLibType] = useState('movie'); 

  const isMounted = useRef(true);

  useEffect(() => { 
    isMounted.current = true;
    loadInitialData(); 
    return () => { isMounted.current = false; };
  }, []);

  const loadInitialData = async () => {
    try {
      const savedUrl = await AsyncStorage.getItem('@media_dav_url');
      const savedUser = await AsyncStorage.getItem('@media_dav_user');
      const savedPass = await AsyncStorage.getItem('@media_dav_pass');
      const savedLibs = await AsyncStorage.getItem('@media_libraries');
      const savedCache = await AsyncStorage.getItem('@media_movie_cache');
      const savedProgress = await AsyncStorage.getItem('@media_playback_progress');
      
      if (savedUrl && savedUser && savedPass) {
        setDavUrl(savedUrl); setUsername(savedUser); setPassword(savedPass);
        setIsConfigured(true);
        setLibraries(savedLibs ? JSON.parse(savedLibs) : []);
        setMovieList(savedCache ? JSON.parse(savedCache) : []);
        setContinueWatching(savedProgress ? JSON.parse(savedProgress) : []);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // ==========================================
  // 📁 浏览器逻辑 (修复 XML 解析可能导致的死循环)
  // ==========================================
  const fetchBrowserFolders = async (targetPath) => {
    setBrowserLoading(true);
    try {
      const originMatch = davUrl.match(/^(https?:\/\/[^\/]+)/);
      const auth = `Basic ${base64.encode(`${username}:${password}`)}`;
      const response = await fetch(originMatch[1] + targetPath, { 
        method: 'PROPFIND', 
        headers: { 'Authorization': auth, 'Depth': '1', 'Content-Type': 'application/xml' } 
      });
      const xmlText = await response.text();
      const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
      const result = parser.parse(xmlText);
      let responses = result?.multistatus?.response || [];
      if (!Array.isArray(responses)) responses = [responses];
      
      let folders = [];
      responses.forEach(res => {
        let href = res.href.replace(/https?:\/\/[^\/]+/, '');
        // 修正判断逻辑：跳过当前目录自身
        if (res.propstat?.prop?.resourcetype?.collection === '' && href !== targetPath && href !== targetPath + '/') {
          folders.push({ 
            name: decodeURIComponent(href.split('/').filter(Boolean).pop() || ''), 
            path: href.endsWith('/') ? href : href + '/' 
          });
        }
      });
      setBrowserFolders(folders.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) { console.error(error); } finally { setBrowserLoading(false); }
  };

  // ==========================================
  // 🎬 防爆扫描引擎 (分步执行，防止内存溢出)
  // ==========================================
  const startBackgroundScan = async (libsToScan) => {
    if (isScanning || !isMounted.current) return;
    setIsScanning(true);
    let allMovies = [];
    const authHeader = `Basic ${base64.encode(`${username}:${password}`)}`;
    const origin = davUrl.match(/^(https?:\/\/[^\/]+)/)[1];
    const xmlParser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });

    try {
      for (const lib of libsToScan) {
        for (const path of lib.paths) {
          let queue = [path.endsWith('/') ? path : path + '/'];
          
          while (queue.length > 0) {
            const currentPath = queue.shift();
            const displayName = decodeURIComponent(currentPath).split('/').filter(Boolean).pop() || '...';
            setScanProgress(`${lib.name}: ${displayName}`);
            
            try {
              const res = await fetch(origin + currentPath, { 
                method: 'PROPFIND', 
                headers: { 'Authorization': authHeader, 'Depth': '1', 'Content-Type': 'application/xml' } 
              });
              const xml = await res.text();
              const result = xmlParser.parse(xml);
              let items = result?.multistatus?.response || [];
              if (!Array.isArray(items)) items = [items];

              // 查找当前文件夹里的视频文件
              let videoFile = items.find(i => /\.(mkv|mp4|avi|iso|ts)$/i.test(i.href));
              
              if (videoFile) {
                let movie = { 
                  id: `${lib.id}-${allMovies.length}`, 
                  libraryId: lib.id, 
                  title: decodeURIComponent(currentPath.split('/').filter(Boolean).pop() || '未知'), 
                  videoUrl: origin + videoFile.href, 
                  posterUrl: null 
                };
                
                // 查找同目录下的封面
                items.forEach(i => {
                    const h = i.href.toLowerCase();
                    if ((h.includes('poster') || h.includes('folder') || h.includes('cover')) && /\.(jpg|jpeg|png|webp)$/i.test(h)) {
                        movie.posterUrl = origin + i.href;
                    }
                });
                allMovies.push(movie);
              }

              // 将子目录加入队列
              items.forEach(i => {
                  let href = i.href.replace(/https?:\/\/[^\/]+/, '');
                  if (i.propstat?.prop?.resourcetype?.collection === '' && href !== currentPath && href !== currentPath + '/') {
                    queue.push(href.endsWith('/') ? href : href + '/');
                  }
              });
              
              // 💡 关键：给 UI 线程喘息的机会，每扫一个目录停 10 毫秒，防止由于任务太重导致崩溃
              await new Promise(resolve => setTimeout(resolve, 10));

            } catch (e) { console.log("扫描单项失败", e); }
          }
        }
      }
      setMovieList(allMovies);
      await AsyncStorage.setItem('@media_movie_cache', JSON.stringify(allMovies));
    } catch (globalErr) {
        console.error("全局扫描崩溃", globalErr);
    } finally {
      setIsScanning(false);
      setScanProgress('');
    }
  };

  const handleSaveLibrary = async () => {
    let updatedLibs = [...libraries];
    if (browserMode === 'create') {
      if (!newLibName.trim()) return Alert.alert('提示', '请输入名称');
      updatedLibs.push({ id: Date.now().toString(), name: newLibName.trim(), type: newLibType, paths: [browserPath] });
    } else {
      updatedLibs = updatedLibs.map(lib => lib.id === targetLibId ? { ...lib, paths: [...new Set([...lib.paths, browserPath])] } : lib);
    }
    setLibraries(updatedLibs);
    await AsyncStorage.setItem('@media_libraries', JSON.stringify(updatedLibs));
    setShowAddLibModal(false);
    startBackgroundScan(updatedLibs); 
  };

  const handleLogout = async () => {
    Alert.alert('注销', '确定要断开流媒体连接并清除缓存吗？', [
        { text: '取消' },
        { text: '注销', style: 'destructive', onPress: async () => {
            await AsyncStorage.multiRemove(['@media_dav_url', '@media_dav_pass', '@media_movie_cache']);
            setIsConfigured(false);
            setMovieList([]);
        }}
    ]);
  };

  const renderMovieItem = ({ item }) => (
    <TouchableOpacity style={styles.posterCard} onPress={() => Alert.alert('提示', '播放器正在集成中...')}>
      <View style={styles.posterShadow}>
        {item.posterUrl ? (
            <Image source={{ uri: item.posterUrl, headers: { 'Authorization': `Basic ${base64.encode(`${username}:${password}`)}` } }} style={styles.posterImage} />
        ) : (
            <View style={[styles.posterImage, { justifyContent: 'center', alignItems: 'center' }]}><Film color="#4b5563" size={32} /></View>
        )}
      </View>
      <Text style={styles.movieTitle} numberOfLines={1}>{item.title}</Text>
    </TouchableOpacity>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  if (!isConfigured) {
    return (
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.setupCard}>
          <Film color="#3b82f6" size={48} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.setupTitle}>配置影音中心</Text>
          <View style={styles.inputContainer}><Server color="#9ca3af" size={20} style={{marginRight:10}}/><TextInput style={styles.input} placeholder="AList 地址" value={davUrl} onChangeText={setDavUrl} autoCapitalize="none" /></View>
          <View style={styles.inputContainer}><User color="#9ca3af" size={20} style={{marginRight:10}}/><TextInput style={styles.input} placeholder="用户名" value={username} onChangeText={setUsername} autoCapitalize="none" /></View>
          <View style={styles.inputContainer}><Key color="#9ca3af" size={20} style={{marginRight:10}}/><TextInput style={styles.input} placeholder="密码" value={password} onChangeText={setPassword} secureTextEntry /></View>
          <TouchableOpacity style={styles.saveBtn} onPress={handleConnect} disabled={isTesting}><Text style={styles.saveBtnText}>{isTesting ? '正在验证...' : '开始连接'}</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>我的影音</Text>
            {isScanning && <Text style={styles.scanStatus} numberOfLines={1}>⏳ {scanProgress}</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => { setBrowserMode('create'); openBrowserModal(); }} style={styles.iconBtn}><Plus color="#ffffff" size={24} /></TouchableOpacity>
          <TouchableOpacity onPress={() => startBackgroundScan(libraries)} style={styles.iconBtn}><RefreshCw color="#ffffff" size={22} /></TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.iconBtn}><LogOut color="#ef4444" size={22} /></TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={movieList.filter(m => activeTab === 'all' || m.libraryId === activeTab)}
        renderItem={renderMovieItem}
        keyExtractor={item => item.id}
        numColumns={3}
        ListHeaderComponent={
          <View style={styles.tabContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                <TouchableOpacity onPress={() => setActiveTab('all')} style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}><Text style={styles.tabText}>全部</Text></TouchableOpacity>
                {libraries.map(lib => (
                    <TouchableOpacity key={lib.id} onPress={() => setActiveTab(lib.id)} style={[styles.tabBtn, activeTab === lib.id && styles.tabBtnActive]}><Text style={styles.tabText}>{lib.name}</Text></TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        }
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
      />

      {/* 📁 文件夹选择 Modal */}
      <Modal visible={showAddLibModal} animationType="slide">
        <View style={styles.browserModal}>
          <View style={styles.browserHeader}>
            <Text style={styles.browserTitle}>选择目录</Text>
            <TouchableOpacity onPress={() => setShowAddLibModal(false)}><X color="#ffffff" size={28} /></TouchableOpacity>
          </View>
          <View style={styles.browserPathRow}>
            <TouchableOpacity onPress={goUpFolder}><ChevronRight color="#3b82f6" size={24} style={{ transform: [{ rotate: '180deg' }] }} /></TouchableOpacity>
            <Text style={styles.browserPathText}>{decodeURIComponent(browserPath)}</Text>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {browserLoading ? <ActivityIndicator size="large" color="#3b82f6" style={{marginTop:40}} /> : 
              browserFolders.map((f, i) => (
                <TouchableOpacity key={i} style={styles.browserItem} onPress={() => { setBrowserPath(f.path); fetchBrowserFolders(f.path); }}>
                  <Folder color="#3b82f6" size={22} /><Text style={styles.browserItemText}>{f.name}</Text>
                </TouchableOpacity>
              ))
            }
          </ScrollView>
          <View style={styles.browserFooter}>
             <TextInput style={styles.modalInput} placeholder="媒体库名称" placeholderTextColor="#6b7280" value={newLibName} onChangeText={setNewLibName} />
             <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleSaveLibrary}><Text style={styles.modalConfirmText}>确认并扫描</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  center: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, backgroundColor: '#1f2937' },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  scanStatus: { color: '#3b82f6', fontSize: 11, marginTop: 2 },
  iconBtn: { marginLeft: 16 },
  setupCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24, width: '100%' },
  setupTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, marginBottom: 12, paddingHorizontal: 12 },
  input: { flex: 1, color: '#ffffff', height: 45 },
  saveBtn: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#ffffff', fontWeight: 'bold' },
  tabContainer: { marginVertical: 16 },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1f2937', marginRight: 8 },
  tabBtnActive: { backgroundColor: '#3b82f6' },
  tabText: { color: '#ffffff', fontSize: 13 },
  listContent: { paddingHorizontal: 12, paddingBottom: 100 },
  columnWrapper: { justifyContent: 'flex-start' },
  posterCard: { width: POSTER_WIDTH, marginBottom: 16, marginRight: 12 },
  posterShadow: { elevation: 5, shadowColor: '#000', borderRadius: 8, overflow: 'hidden' },
  posterImage: { width: POSTER_WIDTH, height: POSTER_HEIGHT, backgroundColor: '#1f2937' },
  movieTitle: { color: '#ffffff', fontSize: 12, marginTop: 6 },
  browserModal: { flex: 1, backgroundColor: '#111827' },
  browserHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, backgroundColor: '#1f2937' },
  browserTitle: { color: '#ffffff', fontSize: 18 },
  browserPathRow: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#1f2937' },
  browserPathText: { color: '#3b82f6', marginLeft: 8, fontSize: 14, flex: 1 },
  browserItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  browserItemText: { color: '#ffffff', marginLeft: 12 },
  browserFooter: { padding: 20, backgroundColor: '#1f2937' },
  modalInput: { backgroundColor: '#374151', color: '#ffffff', padding: 12, borderRadius: 8, marginBottom: 12 },
  modalConfirmBtn: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 8, alignItems: 'center' },
  modalConfirmText: { color: '#ffffff', fontWeight: 'bold' }
});