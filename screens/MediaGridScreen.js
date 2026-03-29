import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, FlatList, Image, Alert, Dimensions, TextInput, KeyboardAvoidingView, Platform, Modal, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { XMLParser } from 'fast-xml-parser';
import base64 from 'base-64';
import { PlayCircle, RefreshCw, Film, Server, User, Key, Plus, FolderHeart, LogOut, Folder, ChevronRight, CheckCircle2, X, Search, Clock } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const POSTER_WIDTH = (width - 48) / 3; 
const POSTER_HEIGHT = POSTER_WIDTH * 1.5; 

export default function MediaGridScreen({ navigation }) {
  // --- 状态管理 ---
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
  const [isTesting, setIsTesting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // 弹窗与浏览器状态
  const [showAddLibModal, setShowAddLibModal] = useState(false);
  const [browserMode, setBrowserMode] = useState('create'); // 'create' = 新建, 'add_path' = 给现有库加目录
  const [targetLibId, setTargetLibId] = useState(null);
  
  const [browserPath, setBrowserPath] = useState('/'); 
  const [browserFolders, setBrowserFolders] = useState([]); 
  const [browserLoading, setBrowserLoading] = useState(false);
  const [newLibName, setNewLibName] = useState('');
  const [newLibType, setNewLibType] = useState('movie'); // 电影/剧集/动漫

  const isMounted = useRef(true);

  useEffect(() => { 
    isMounted.current = true;
    loadInitialData(); 
    return () => { isMounted.current = false; };
  }, []);

  const loadInitialData = async () => {
    try {
      const [url, user, pass, libs, cache, progress] = await Promise.all([
        AsyncStorage.getItem('@media_dav_url'), AsyncStorage.getItem('@media_dav_user'),
        AsyncStorage.getItem('@media_dav_pass'), AsyncStorage.getItem('@media_libraries'),
        AsyncStorage.getItem('@media_movie_cache'), AsyncStorage.getItem('@media_playback_progress')
      ]);
      if (url && user && pass) {
        setDavUrl(url); setUsername(user); setPassword(pass); setIsConfigured(true);
        if (libs) setLibraries(JSON.parse(libs));
        if (cache) setMovieList(JSON.parse(cache));
        if (progress) setContinueWatching(JSON.parse(progress));
      }
    } catch (e) { console.error(e); } 
    finally { if (isMounted.current) setLoading(false); }
  };

  // --- 账户连接与注销 ---
  const handleConnect = async () => {
    if (!davUrl || !username || !password) return Alert.alert('提示', '请填写完整');
    setIsTesting(true);
    try {
      let cleanUrl = davUrl.trim();
      if (!cleanUrl.endsWith('/')) cleanUrl += '/';
      const auth = `Basic ${base64.encode(`${username}:${password}`)}`;
      
      let res = await fetch(cleanUrl, { method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': '1' } });
      if (res.status === 405 && !cleanUrl.endsWith('/dav/')) {
        cleanUrl += 'dav/';
        res = await fetch(cleanUrl, { method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': '1' } });
      }

      if (res.ok || res.status === 207) {
        await AsyncStorage.multiSet([['@media_dav_url', cleanUrl], ['@media_dav_user', username], ['@media_dav_pass', password]]);
        setDavUrl(cleanUrl); setIsConfigured(true);
      } else { Alert.alert('错误', '验证失败，请检查账号密码'); }
    } catch (e) { Alert.alert('网络错误', '无法连接服务器'); } 
    finally { setIsTesting(false); }
  };

  const handleLogout = () => {
    Alert.alert('注销', '确定要退出并清除缓存吗？', [
      { text: '取消' },
      { text: '注销', style: 'destructive', onPress: async () => {
          await AsyncStorage.multiRemove(['@media_dav_url', '@media_dav_pass', '@media_movie_cache', '@media_libraries']);
          setIsConfigured(false); setMovieList([]); setLibraries([]);
      }}
    ]);
  };

  // --- 可视化浏览器逻辑 ---
  const openBrowser = (mode = 'create', libId = null) => {
    setBrowserMode(mode); setTargetLibId(libId); setNewLibName(''); setNewLibType('movie');
    const startPath = davUrl.match(/^(https?:\/\/[^\/]+)(.*)$/)?.[2] || '/';
    setBrowserPath(startPath); fetchBrowserFolders(startPath); setShowAddLibModal(true);
  };

  const fetchBrowserFolders = async (targetPath) => {
    setBrowserLoading(true);
    try {
      const origin = davUrl.match(/^(https?:\/\/[^\/]+)/)[1];
      const auth = `Basic ${base64.encode(`${username}:${password}`)}`;
      const res = await fetch(origin + targetPath, { method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': '1' } });
      const xml = await res.text();
      const items = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true }).parse(xml)?.multistatus?.response || [];
      const folders = (Array.isArray(items) ? items : [items]).filter(i => {
        let href = i.href.replace(/https?:\/\/[^\/]+/, '');
        return i.propstat?.prop?.resourcetype?.collection === '' && href !== targetPath && href !== targetPath + '/';
      }).map(i => {
        let h = i.href.replace(/https?:\/\/[^\/]+/, '');
        return { name: decodeURIComponent(h.split('/').filter(Boolean).pop()), path: h.endsWith('/') ? h : h + '/' };
      });
      setBrowserFolders(folders.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {} finally { setBrowserLoading(false); }
  };

  const goUpFolder = () => {
    const root = davUrl.match(/^(https?:\/\/[^\/]+)(.*)$/)?.[2] || '/';
    if (browserPath === root || browserPath === root + '/') return;
    setBrowserPath(browserPath.replace(/\/$/, '').split('/').slice(0, -1).join('/') + '/');
    fetchBrowserFolders(browserPath.replace(/\/$/, '').split('/').slice(0, -1).join('/') + '/');
  };

  const handleSaveLibrary = async () => {
    let updatedLibs = [...libraries];
    if (browserMode === 'create') {
      if (!newLibName.trim()) return Alert.alert('提示', '请输入媒体库名称');
      updatedLibs.push({ id: Date.now().toString(), name: newLibName.trim(), type: newLibType, paths: [browserPath] });
    } else {
      updatedLibs = updatedLibs.map(l => l.id === targetLibId ? { ...l, paths: [...new Set([...l.paths, browserPath])] } : l);
    }
    setLibraries(updatedLibs);
    await AsyncStorage.setItem('@media_libraries', JSON.stringify(updatedLibs));
    setShowAddLibModal(false);
    startScan(updatedLibs); 
  };

  // 💡 删除媒体库逻辑
  const deleteLib = (id) => {
    Alert.alert('删除媒体库', '确定要移除此分类吗？不会删除源文件。', [
      { text: '取消' },
      { text: '删除', style: 'destructive', onPress: async () => {
          const updated = libraries.filter(l => l.id !== id);
          setLibraries(updated);
          await AsyncStorage.setItem('@media_libraries', JSON.stringify(updated));
          const updatedMovies = movieList.filter(m => m.libraryId !== id);
          setMovieList(updatedMovies);
          await AsyncStorage.setItem('@media_movie_cache', JSON.stringify(updatedMovies));
          if (activeTab === id) setActiveTab('all');
      }}
    ]);
  };

  // --- 防爆扫描引擎 ---
  const startScan = async (libsToScan = libraries) => {
    if (isScanning || !libsToScan.length) return;
    setIsScanning(true);
    let results = [];
    const auth = `Basic ${base64.encode(`${username}:${password}`)}`;
    const origin = davUrl.match(/^(https?:\/\/[^\/]+)/)[1];
    const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });

    try {
      for (const lib of libsToScan) {
        let queue = [...lib.paths];
        while (queue.length > 0) {
          const path = queue.shift();
          setScanProgress(`${lib.name}: ${decodeURIComponent(path).split('/').filter(Boolean).pop() || '...'}`);

          try {
            const res = await fetch(origin + path, { method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': '1' } });
            const xml = await res.text();
            let items = parser.parse(xml)?.multistatus?.response || [];
            if (!Array.isArray(items)) items = [items];

            let video = items.find(i => /\.(mkv|mp4|avi|iso|ts)$/i.test(i.href));
            if (video) {
              let movie = { 
                id: `${lib.id}-${results.length}`, libraryId: lib.id, type: lib.type,
                title: decodeURIComponent(path.split('/').filter(Boolean).pop() || '未知'),
                videoUrl: origin + video.href, posterUrl: null
              };
              items.forEach(i => {
                const h = i.href.toLowerCase();
                if ((h.includes('poster') || h.includes('folder') || h.includes('cover')) && /\.(jpg|jpeg|png|webp)$/i.test(h)) movie.posterUrl = origin + i.href;
              });
              results.push(movie);
            }
            items.forEach(i => {
              const href = i.href.replace(/https?:\/\/[^\/]+/, '');
              if (i.propstat?.prop?.resourcetype?.collection === '' && href !== path && href !== path.slice(0,-1)) queue.push(href.endsWith('/') ? href : href+'/');
            });
            await new Promise(r => setTimeout(r, 10)); // 防爆缓冲
          } catch (e) { console.log("跳过", path); }
        }
      }
      setMovieList(results);
      await AsyncStorage.setItem('@media_movie_cache', JSON.stringify(results));
    } finally { setIsScanning(false); setScanProgress(''); }
  };

  // --- 过滤与渲染 ---
  const getFilteredData = () => {
    let data = movieList || [];
    if (activeTab !== 'all') data = data.filter(m => m.libraryId === activeTab);
    if (searchQuery.trim()) data = data.filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return data;
  };

  const renderMovieItem = ({ item }) => (
    <TouchableOpacity style={styles.posterCard} onPress={() => Alert.alert('提示', '播放详情页开发中')}>
      <View style={styles.posterShadow}>
        {item.posterUrl ? (
          <Image source={{ uri: item.posterUrl, headers: { 'Authorization': `Basic ${base64.encode(`${username}:${password}`)}` } }} style={styles.posterImage} />
        ) : (
          <View style={[styles.posterImage, styles.center]}><Film color="#4b5563" size={32} /></View>
        )}
      </View>
      <Text style={styles.movieTitle} numberOfLines={1}>{item.title}</Text>
    </TouchableOpacity>
  );

  if (loading) return <View style={styles.fullCenter}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  if (!isConfigured) {
    return (
      <KeyboardAvoidingView style={styles.fullCenter} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.setupCard}>
          <Film color="#3b82f6" size={48} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.setupTitle}>私人流媒体库</Text>
          <View style={styles.inputBox}><Server color="#9ca3af" size={20}/><TextInput style={styles.input} placeholder="AList 地址" placeholderTextColor="#6b7280" value={davUrl} onChangeText={setDavUrl} autoCapitalize="none" /></View>
          <View style={styles.inputBox}><User color="#9ca3af" size={20}/><TextInput style={styles.input} placeholder="用户名" placeholderTextColor="#6b7280" value={username} onChangeText={setUsername} autoCapitalize="none" /></View>
          <View style={styles.inputBox}><Key color="#9ca3af" size={20}/><TextInput style={styles.input} placeholder="密码" placeholderTextColor="#6b7280" value={password} onChangeText={setPassword} secureTextEntry /></View>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleConnect}><Text style={styles.btnText}>{isTesting ? '正在验证...' : '进入影音中心'}</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      {/* 顶栏与搜索 */}
      <View style={styles.header}>
        {isSearching ? (
          <View style={styles.searchBar}>
            <Search color="#9ca3af" size={20} />
            <TextInput style={styles.searchInput} placeholder="搜索影视..." placeholderTextColor="#6b7280" autoFocus value={searchQuery} onChangeText={setSearchQuery}/>
            <TouchableOpacity onPress={() => { setIsSearching(false); setSearchQuery(''); }}><X color="#ffffff" size={24} /></TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>我的影音</Text>
                {isScanning && <Text style={styles.scanStatus} numberOfLines={1}>⏳ {scanProgress}</Text>}
            </View>
            <View style={styles.headerIcons}>
              <TouchableOpacity onPress={() => setIsSearching(true)} style={styles.iconBtn}><Search color="#ffffff" size={24} /></TouchableOpacity>
              <TouchableOpacity onPress={() => openBrowser('create')} style={styles.iconBtn}><Plus color="#ffffff" size={26} /></TouchableOpacity>
              <TouchableOpacity onPress={() => startScan()} style={styles.iconBtn}><RefreshCw color="#ffffff" size={22} /></TouchableOpacity>
              <TouchableOpacity onPress={handleLogout} style={styles.iconBtn}><LogOut color="#ef4444" size={22} /></TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {libraries.length === 0 ? (
        <View style={styles.fullCenter}>
          <FolderHeart color="#4b5563" size={64} style={{ marginBottom: 16 }} />
          <Text style={{color:'#e5e7eb', fontSize: 18, fontWeight: 'bold'}}>暂无媒体库</Text>
          <Text style={{color:'#9ca3af', marginTop: 8}}>点击右上角 + 号添加你的第一个影视分类</Text>
        </View>
      ) : (
        <FlatList
          data={getFilteredData()}
          renderItem={renderMovieItem}
          keyExtractor={item => item.id}
          numColumns={3}
          ListHeaderComponent={
            <>
              {/* 分类 Tabs (长按删除) */}
              {!isSearching && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
                  <TouchableOpacity onPress={() => setActiveTab('all')} style={[styles.tab, activeTab === 'all' && styles.tabActive]}><Text style={styles.tabText}>全部</Text></TouchableOpacity>
                  {libraries.map(lib => (
                    <TouchableOpacity key={lib.id} onPress={() => setActiveTab(lib.id)} onLongPress={() => deleteLib(lib.id)} delayLongPress={500} style={[styles.tab, activeTab === lib.id && styles.tabActive]}>
                      <Text style={styles.tabText}>{lib.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {/* 针对某个库追加文件夹的功能按钮 */}
              {!isSearching && activeTab !== 'all' && (
                <TouchableOpacity style={styles.appendBtn} onPress={() => openBrowser('add_path', activeTab)}>
                  <Folder color="#3b82f6" size={16} /><Text style={styles.appendBtnText}>为此库追加新目录</Text>
                </TouchableOpacity>
              )}
            </>
          }
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
        />
      )}
      
      {/* 📁 可视化浏览器与配置表单 */}
      <Modal visible={showAddLibModal} animationType="slide">
          <View style={styles.browserContainer}>
              <View style={styles.browserHeader}>
                  <Text style={styles.browserTitle}>{browserMode === 'create' ? '新建媒体库' : '追加文件夹'}</Text>
                  <TouchableOpacity onPress={() => setShowAddLibModal(false)}><X color="#ffffff" size={28} /></TouchableOpacity>
              </View>
              <View style={styles.browserPath}><TouchableOpacity onPress={goUpFolder}><ChevronRight color="#3b82f6" size={24} style={{transform:[{rotate:'180deg'}]}}/></TouchableOpacity><Text style={{color:'#3b82f6', marginLeft:8}}>{decodeURIComponent(browserPath)}</Text></View>
              
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
                  {browserMode === 'create' && (
                    <>
                      <TextInput style={styles.setupInput} placeholder="媒体库名称 (如：电影)" placeholderTextColor="#6b7280" value={newLibName} onChangeText={setNewLibName} />
                      <View style={styles.typeSelector}>
                        {['movie', 'tv', 'anime'].map(t => (
                          <TouchableOpacity key={t} style={[styles.typeBtn, newLibType === t && styles.typeBtnActive]} onPress={() => setNewLibType(t)}>
                            {newLibType === t && <CheckCircle2 color="#fff" size={16} style={{marginRight:4}} />}
                            <Text style={{color: newLibType === t ? '#fff' : '#9ca3af', fontWeight: 'bold'}}>{t === 'movie' ? '电影' : t === 'tv' ? '剧集' : '动漫'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveLibrary}><Text style={styles.btnText}>保存并扫描该目录</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  fullCenter: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', padding: 20 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 55, backgroundColor: '#1f2937', minHeight: 100 },
  headerTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold' },
  headerIcons: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { marginLeft: 15 },
  scanStatus: { color: '#3b82f6', fontSize: 11, marginTop: 4, width: 150 },
  
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 10, paddingHorizontal: 12, height: 45 },
  searchInput: { flex: 1, color: '#ffffff', marginLeft: 10, fontSize: 16 },

  setupCard: { backgroundColor: '#1f2937', borderRadius: 20, padding: 25, width: '100%', elevation: 10 },
  setupTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 10, marginBottom: 15, paddingHorizontal: 15 },
  input: { flex: 1, color: '#ffffff', height: 50, marginLeft: 10 },
  primaryBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },

  tabScroll: { marginVertical: 15, paddingHorizontal: 16, maxHeight: 40 },
  tab: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1f2937', marginRight: 10, borderWidth: 1, borderColor: '#374151', justifyContent: 'center' },
  tabActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  tabText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  appendBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: 16, marginBottom: 15, padding: 8, backgroundColor: 'rgba(59, 130, 246, 0.15)', borderRadius: 8 },
  appendBtnText: { color: '#3b82f6', marginLeft: 6, fontSize: 12, fontWeight: 'bold' },

  listContent: { paddingHorizontal: 12, paddingBottom: 100 },
  columnWrapper: { justifyContent: 'flex-start' },
  posterCard: { width: POSTER_WIDTH, marginBottom: 18, marginRight: 12 },
  posterShadow: { elevation: 8, shadowColor: '#000', borderRadius: 10, overflow: 'hidden' },
  posterImage: { width: POSTER_WIDTH, height: POSTER_HEIGHT, backgroundColor: '#1f2937' },
  movieTitle: { color: '#ffffff', fontSize: 12, marginTop: 8, paddingHorizontal: 4 },

  browserContainer: { flex: 1, backgroundColor: '#111827' },
  browserHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, backgroundColor: '#1f2937' },
  browserTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  browserPath: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#1f2937', borderBottomWidth: 1, borderBottomColor: '#374151' },
  browserItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  browserItemText: { color: '#ffffff', marginLeft: 12, fontSize: 15 },
  
  browserFooter: { padding: 20, backgroundColor: '#1f2937', borderTopWidth: 1, borderTopColor: '#374151' },
  setupInput: { backgroundColor: '#374151', color: '#ffffff', padding: 15, borderRadius: 10, marginBottom: 15 },
  typeSelector: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  typeBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, backgroundColor: '#374151', borderRadius: 8, marginHorizontal: 4 },
  typeBtnActive: { backgroundColor: '#8b5cf6' }
});