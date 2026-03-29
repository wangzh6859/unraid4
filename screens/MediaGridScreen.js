import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, FlatList, Image, Alert, Dimensions, TextInput, KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { XMLParser } from 'fast-xml-parser';
import base64 from 'base-64';
import { PlayCircle, RefreshCw, Film, Server, User, Key, Plus, FolderHeart, LogOut, Folder, ChevronRight, CheckCircle2, X } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const POSTER_WIDTH = (width - 48) / 3; 
const POSTER_HEIGHT = POSTER_WIDTH * 1.5; 

export default function MediaGridScreen({ navigation }) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [davUrl, setDavUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  // 媒体库状态：存储对象数组 [{ id, name, type, path }]
  const [libraries, setLibraries] = useState([]); 
  const [movieList, setMovieList] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // 当前选中的分类 Tab
  
  const [loading, setLoading] = useState(true);
  const [scanningInfo, setScanningInfo] = useState('');

  // 💡 可视化文件夹浏览器状态
  const [showAddLibModal, setShowAddLibModal] = useState(false);
  const [browserPath, setBrowserPath] = useState('/'); // 浏览器当前路径
  const [browserFolders, setBrowserFolders] = useState([]); // 当前路径下的子文件夹
  const [browserLoading, setBrowserLoading] = useState(false);
  
  // 新建媒体库的表单状态
  const [newLibName, setNewLibName] = useState('');
  const [newLibType, setNewLibType] = useState('movie'); // 'movie' | 'tv' | 'anime'

  useEffect(() => { loadConfigAndCache(); }, []);

  const loadConfigAndCache = async () => {
    try {
      const savedUrl = await AsyncStorage.getItem('@media_dav_url');
      const savedUser = await AsyncStorage.getItem('@media_dav_user');
      const savedPass = await AsyncStorage.getItem('@media_dav_pass');
      const savedLibs = await AsyncStorage.getItem('@media_libraries');
      const savedCache = await AsyncStorage.getItem('@media_movie_cache');
      
      if (savedUrl && savedUser && savedPass) {
        setDavUrl(savedUrl); setUsername(savedUser); setPassword(savedPass);
        setIsConfigured(true);

        const parsedLibs = savedLibs ? JSON.parse(savedLibs) : [];
        setLibraries(parsedLibs);

        if (savedCache) {
          setMovieList(JSON.parse(savedCache));
          setLoading(false);
        } else if (parsedLibs.length > 0) {
          scanAllLibraries(savedUrl, savedUser, savedPass, parsedLibs);
        } else { setLoading(false); }
      } else { setLoading(false); }
    } catch (e) { console.error(e); setLoading(false); }
  };

  const webdavFetch = async (fullUrl, method = 'PROPFIND', isText = false, authHeader) => {
    const response = await fetch(fullUrl, { method: method, headers: { 'Authorization': authHeader, 'Depth': '1', 'Content-Type': 'application/xml' } });
    return isText ? await response.text() : response;
  };

  const handleConnect = async () => {
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
        if (retryResponse.status === 200 || retryResponse.status === 207) { response = retryResponse; cleanUrl = alistUrl; }
      }

      if (response.status === 200 || response.status === 207) {
        await AsyncStorage.setItem('@media_dav_url', cleanUrl);
        await AsyncStorage.setItem('@media_dav_user', username);
        await AsyncStorage.setItem('@media_dav_pass', password);
        setDavUrl(cleanUrl); setIsConfigured(true);
        Alert.alert('连接成功', '请点击右上角 + 号，通过浏览器选择文件夹来添加媒体库。');
      } else { Alert.alert('连接失败', `状态码：${response.status}`); }
    } catch (error) { Alert.alert('网络错误', '无法连接到服务器'); } finally { setIsTesting(false); }
  };

  // 💡 注销并切换账号
  const handleLogout = () => {
    Alert.alert('切换账号', '确定要断开当前流媒体库并重新配置吗？这会清除本地缓存。', [
      { text: '取消', style: 'cancel' },
      { text: '确定注销', style: 'destructive', onPress: async () => {
          await AsyncStorage.removeItem('@media_dav_url');
          await AsyncStorage.removeItem('@media_dav_pass');
          await AsyncStorage.removeItem('@media_movie_cache');
          // 可选：是否清空已有的媒体库配置？一般切换服务器路径就变了，建议清空
          await AsyncStorage.removeItem('@media_libraries');
          setLibraries([]); setMovieList([]); setIsConfigured(false);
      }}
    ]);
  };

  // ==========================================
  // 📁 可视化浏览器逻辑
  // ==========================================
  const openBrowserModal = () => {
    setNewLibName(''); setNewLibType('movie');
    const rootPathMatch = davUrl.match(/^(https?:\/\/[^\/]+)(.*)$/);
    const startPath = rootPathMatch && rootPathMatch[2] ? rootPathMatch[2] : '/';
    setBrowserPath(startPath);
    fetchBrowserFolders(startPath);
    setShowAddLibModal(true);
  };

  const fetchBrowserFolders = async (targetPath) => {
    setBrowserLoading(true);
    try {
      const originMatch = davUrl.match(/^(https?:\/\/[^\/]+)/);
      const origin = originMatch ? originMatch[1] : '';
      const auth = `Basic ${base64.encode(`${username}:${password}`)}`;
      
      const xmlText = await webdavFetch(origin + targetPath, 'PROPFIND', true, auth);
      const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
      const result = parser.parse(xmlText);
      let responses = result?.multistatus?.response || [];
      if (!Array.isArray(responses)) responses = [responses];

      let folders = [];
      responses.forEach(res => {
        let href = res.href.replace(/https?:\/\/[^\/]+/, '');
        const isFolder = res.propstat?.prop?.resourcetype?.collection === '';
        if (isFolder && href !== targetPath && href !== targetPath + '/') {
          folders.push({ name: decodeURIComponent(href.split('/').filter(Boolean).pop()), path: href });
        }
      });
      setBrowserFolders(folders.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) { Alert.alert('读取目录失败', '请检查网络'); } finally { setBrowserLoading(false); }
  };

  const goUpFolder = () => {
    const rootPathMatch = davUrl.match(/^(https?:\/\/[^\/]+)(.*)$/);
    const rootPath = rootPathMatch && rootPathMatch[2] ? rootPathMatch[2] : '/';
    if (browserPath === rootPath || browserPath === rootPath + '/') return;
    let p = browserPath.endsWith('/') ? browserPath.slice(0, -1) : browserPath;
    const parentPath = p.substring(0, p.lastIndexOf('/') + 1);
    setBrowserPath(parentPath);
    fetchBrowserFolders(parentPath);
  };

  // 保存新建的媒体库
  const handleSaveLibrary = async () => {
    if (!newLibName.trim()) { Alert.alert('提示', '请给媒体库起个名字'); return; }
    
    const newLib = { id: Date.now().toString(), name: newLibName.trim(), type: newLibType, path: browserPath };
    const updatedLibs = [...libraries, newLib];
    setLibraries(updatedLibs);
    await AsyncStorage.setItem('@media_libraries', JSON.stringify(updatedLibs));
    setShowAddLibModal(false);
    
    scanAllLibraries(davUrl, username, password, updatedLibs);
  };

  // ==========================================
  // 🎬 核心刮削引擎
  // ==========================================
  const parseNfo = (xmlData) => {
    try {
      const parser = new XMLParser({ ignoreAttributes: true });
      const result = parser.parse(xmlData);
      const meta = result.movie || result.video || result.tvshow || {};
      return { title: meta.title || meta.originaltitle || '未知标题', plot: meta.plot || '暂无简介', year: meta.year || '', rating: meta.rating || meta.userrating || '0.0' };
    } catch (e) { return { title: '解析失败', plot: '', year: '', rating: '' }; }
  };

  const scanAllLibraries = async (url, user, pass, libs) => {
    if (libs.length === 0) return;
    setLoading(true);
    let allMovies = [];
    const auth = `Basic ${base64.encode(`${user}:${pass}`)}`;
    const originMatch = url.match(/^(https?:\/\/[^\/]+)/);
    const origin = originMatch ? originMatch[1] : '';

    try {
      for (const lib of libs) {
        let realWebDavPath = lib.path;
        if (!realWebDavPath.endsWith('/')) realWebDavPath += '/';
        setScanningInfo(`正在读取 ${lib.name} (${lib.type})...`);
        
        const xmlText = await webdavFetch(origin + realWebDavPath, 'PROPFIND', true, auth);
        const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
        const result = parser.parse(xmlText);
        let responses = result?.multistatus?.response || [];
        if (!Array.isArray(responses)) responses = [responses];

        const movieFolders = responses.filter(res => {
          let href = res.href.replace(/https?:\/\/[^\/]+/, '');
          const isFolder = res.propstat?.prop?.resourcetype?.collection === '';
          return isFolder && href !== realWebDavPath;
        });

        for (let i = 0; i < movieFolders.length; i++) {
          let folderHref = movieFolders[i].href.replace(/https?:\/\/[^\/]+/, '');
          if (!folderHref.endsWith('/')) folderHref += '/';
          const folderName = decodeURIComponent(folderHref.split('/').filter(Boolean).pop());
          setScanningInfo(`[${lib.name}] 正在刮削: ${folderName}`);

          try {
            const folderXml = await webdavFetch(origin + folderHref, 'PROPFIND', true, auth);
            const folderResult = parser.parse(folderXml);
            let files = folderResult?.multistatus?.response || [];
            if (!Array.isArray(files)) files = [files];

            // 💡 记录它属于哪个媒体库
            let movieData = { id: `${lib.id}-${i}`, libraryId: lib.id, type: lib.type, title: folderName, posterUrl: null, videoUrl: null, nfo: null };

            for (const file of files) {
              let fileHref = file.href.replace(/https?:\/\/[^\/]+/, '');
              const fileName = decodeURIComponent(fileHref.split('/').pop());
              const directUrl = origin + fileHref;
              const lowerName = fileName.toLowerCase();

              if (lowerName.endsWith('.nfo') && !movieData.nfo) {
                const nfoContent = await webdavFetch(directUrl, 'GET', true, auth);
                movieData.nfo = parseNfo(nfoContent);
                movieData.title = movieData.nfo.title; 
              }
              if ((lowerName.includes('poster.') || lowerName.includes('folder.')) && /\.(jpg|jpeg|png|webp)$/i.test(lowerName) && !movieData.posterUrl) {
                movieData.posterUrl = directUrl;
              }
              if (/\.(mkv|mp4|avi|mov|m4v|iso)$/i.test(lowerName) && !movieData.videoUrl) {
                movieData.videoUrl = directUrl;
              }
            }
            if (movieData.videoUrl) allMovies.push(movieData);
          } catch (err) { console.log(`跳过 ${folderName}`, err); }
        }
      }
      setMovieList(allMovies);
      await AsyncStorage.setItem('@media_movie_cache', JSON.stringify(allMovies));
    } catch (error) { Alert.alert('扫描失败', '请检查目录权限。'); } finally { setLoading(false); }
  };

  // 💡 获取当前选中的内容列表
  const filteredMovies = movieList.filter(m => activeTab === 'all' || m.libraryId === activeTab);

  const renderMovieItem = ({ item }) => (
    <TouchableOpacity style={styles.posterCard} onPress={() => Alert.alert('即将到来', '播放器页面准备就绪！')}>
      <View style={styles.posterShadow}>
        {item.posterUrl ? (
          <Image source={{ uri: item.posterUrl, headers: { 'Authorization': `Basic ${base64.encode(`${username}:${password}`)}` } }} style={styles.posterImage} />
        ) : (
          <View style={[styles.posterImage, styles.posterFallback]}><Film color="#4b5563" size={40} /><Text style={styles.fallbackText}>{item.title}</Text></View>
        )}
        {item.nfo?.rating && item.nfo?.rating !== '0.0' && <View style={styles.ratingBadge}><Text style={styles.ratingText}>{item.nfo.rating}</Text></View>}
      </View>
      <Text style={styles.movieTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.movieYear}>{item.nfo?.year}</Text>
    </TouchableOpacity>
  );

  if (!loading && !isConfigured) {
    return (
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.setupCard}>
          <Film color="#3b82f6" size={48} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.setupTitle}>私人流媒体库</Text>
          <Text style={styles.setupSub}>请输入媒体服务器的 WebDAV 地址</Text>
          <View style={styles.inputContainer}><Server color="#9ca3af" size={20} style={styles.inputIcon} /><TextInput style={styles.input} placeholder="https://alist.bbb.ccc:123" placeholderTextColor="#6b7280" value={davUrl} onChangeText={setDavUrl} autoCapitalize="none" keyboardType="url" /></View>
          <View style={styles.inputContainer}><User color="#9ca3af" size={20} style={styles.inputIcon} /><TextInput style={styles.input} placeholder="用户名" placeholderTextColor="#6b7280" value={username} onChangeText={setUsername} autoCapitalize="none" /></View>
          <View style={styles.inputContainer}><Key color="#9ca3af" size={20} style={styles.inputIcon} /><TextInput style={styles.input} placeholder="密码" placeholderTextColor="#6b7280" value={password} onChangeText={setPassword} secureTextEntry={true} /></View>
          <TouchableOpacity style={styles.saveBtn} onPress={handleConnect} disabled={isTesting}>{isTesting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveBtnText}>连接媒体库</Text>}</TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginBottom: 20 }} />
        <Text style={styles.loadingText}>元数据引擎运转中...</Text>
        <Text style={styles.loadingSub}>{scanningInfo}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 顶栏 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>我的媒体库</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={openBrowserModal} style={styles.iconBtn}><Plus color="#ffffff" size={24} /></TouchableOpacity>
          <TouchableOpacity onPress={() => scanAllLibraries(davUrl, username, password, libraries)} style={styles.iconBtn}><RefreshCw color="#ffffff" size={22} /></TouchableOpacity>
          {/* 💡 切换账号按钮 */}
          <TouchableOpacity onPress={handleLogout} style={styles.iconBtn}><LogOut color="#ef4444" size={22} /></TouchableOpacity>
        </View>
      </View>

      {/* 💡 分类 Tabs */}
      {libraries.length > 0 && (
        <View style={styles.tabContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            <TouchableOpacity onPress={() => setActiveTab('all')} style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}>
              <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>全部</Text>
            </TouchableOpacity>
            {libraries.map(lib => (
              <TouchableOpacity key={lib.id} onPress={() => setActiveTab(lib.id)} style={[styles.tabBtn, activeTab === lib.id && styles.tabBtnActive]}>
                <Text style={[styles.tabText, activeTab === lib.id && styles.tabTextActive]}>{lib.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 列表 */}
      {libraries.length === 0 ? (
        <View style={styles.emptyState}>
          <FolderHeart color="#4b5563" size={64} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>暂无媒体库</Text>
          <Text style={styles.emptySub}>点击右上角的 + 号，浏览并选择一个包含电影的文件夹来开始刮削。</Text>
        </View>
      ) : (
        <FlatList
          data={filteredMovies}
          renderItem={renderMovieItem}
          keyExtractor={item => item.id.toString()}
          numColumns={3}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ========================================== */}
      {/* 📁 可视化浏览器弹窗 */}
      {/* ========================================== */}
      <Modal visible={showAddLibModal} animationType="slide" onRequestClose={() => setShowAddLibModal(false)}>
        <View style={styles.browserModal}>
          <View style={styles.browserHeader}>
            <Text style={styles.browserTitle}>选择媒体库目录</Text>
            <TouchableOpacity onPress={() => setShowAddLibModal(false)}><X color="#9ca3af" size={28} /></TouchableOpacity>
          </View>
          
          <View style={styles.browserPathRow}>
            <TouchableOpacity onPress={goUpFolder} style={{ padding: 4 }}><ChevronRight color="#3b82f6" size={24} style={{ transform: [{ rotate: '180deg' }] }} /></TouchableOpacity>
            <Text style={styles.browserPathText} numberOfLines={1}>{decodeURIComponent(browserPath)}</Text>
          </View>

          <ScrollView style={styles.browserList}>
            {browserLoading ? (
              <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 50 }} />
            ) : (
              browserFolders.map((folder, index) => (
                <TouchableOpacity key={index} style={styles.browserItem} onPress={() => { setBrowserPath(folder.path); fetchBrowserFolders(folder.path); }}>
                  <Folder color="#3b82f6" size={24} fill="rgba(59, 130, 246, 0.2)" />
                  <Text style={styles.browserItemText} numberOfLines={1}>{folder.name}</Text>
                  <ChevronRight color="#4b5563" size={20} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* 底部配置表单 */}
          <View style={styles.browserFooter}>
            <Text style={styles.footerLabel}>将当前目录 <Text style={{color:'#3b82f6'}}>{decodeURIComponent(browserPath)}</Text> 添加为：</Text>
            
            <TextInput style={styles.modalInput} placeholder="媒体库名称 (如: 我的电影)" placeholderTextColor="#6b7280" value={newLibName} onChangeText={setNewLibName} />
            
            <View style={styles.typeSelector}>
              {['movie', 'tv', 'anime'].map(type => (
                <TouchableOpacity key={type} style={[styles.typeBtn, newLibType === type && styles.typeBtnActive]} onPress={() => setNewLibType(type)}>
                  {newLibType === type && <CheckCircle2 color="#ffffff" size={16} style={{ marginRight: 4 }} />}
                  <Text style={[styles.typeText, newLibType === type && styles.typeTextActive]}>
                    {type === 'movie' ? '电影' : type === 'tv' ? '剧集' : '动漫'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleSaveLibrary}>
              <Text style={styles.modalConfirmText}>保存媒体库并扫描</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { flex: 1, backgroundColor: '#111827' },
  
  setupCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24, elevation: 5, width: '100%' },
  setupTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  setupSub: { color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#ffffff', height: 50, fontSize: 16 },
  saveBtn: { backgroundColor: '#3b82f6', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },

  loadingText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  loadingSub: { color: '#9ca3af', fontSize: 13, marginTop: 10, textAlign: 'center', paddingHorizontal: 20 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 30, backgroundColor: '#1f2937' },
  headerTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold' },
  iconBtn: { padding: 8, marginLeft: 8 },

  // Tabs 分类
  tabContainer: { backgroundColor: '#1f2937', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#374151' },
  tabScroll: { paddingHorizontal: 16, alignItems: 'center' },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#374151', marginRight: 10 },
  tabBtnActive: { backgroundColor: '#3b82f6' },
  tabText: { color: '#9ca3af', fontSize: 14, fontWeight: 'bold' },
  tabTextActive: { color: '#ffffff' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { color: '#e5e7eb', fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  emptySub: { color: '#9ca3af', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  listContent: { padding: 12, paddingBottom: 100 },
  columnWrapper: { justifyContent: 'flex-start' },
  posterCard: { width: POSTER_WIDTH, marginBottom: 20, marginRight: 12 },
  posterShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 5, elevation: 8, borderRadius: 8, backgroundColor: '#1f2937' },
  posterImage: { width: POSTER_WIDTH, height: POSTER_HEIGHT, borderRadius: 8, backgroundColor: '#374151' },
  posterFallback: { justifyContent: 'center', alignItems: 'center', padding: 8 },
  fallbackText: { color: '#9ca3af', fontSize: 12, textAlign: 'center', marginTop: 8 },
  movieTitle: { color: '#e5e7eb', fontSize: 14, fontWeight: 'bold', marginTop: 8, marginLeft: 4 },
  movieYear: { color: '#9ca3af', fontSize: 12, marginLeft: 4 },
  ratingBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(245, 158, 11, 0.9)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ratingText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },

  // 可视化浏览器样式
  browserModal: { flex: 1, backgroundColor: '#111827' },
  browserHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 20, backgroundColor: '#1f2937' },
  browserTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  browserPathRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', padding: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  browserPathText: { color: '#60a5fa', fontSize: 15, marginLeft: 8, flex: 1 },
  browserList: { flex: 1 },
  browserItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  browserItemText: { color: '#e5e7eb', fontSize: 16, flex: 1, marginLeft: 16 },
  
  browserFooter: { backgroundColor: '#1f2937', padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, borderTopWidth: 1, borderTopColor: '#374151' },
  footerLabel: { color: '#9ca3af', fontSize: 14, marginBottom: 12 },
  modalInput: { backgroundColor: '#374151', color: '#ffffff', borderRadius: 8, height: 50, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  typeSelector: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  typeBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, backgroundColor: '#374151', borderRadius: 8, marginHorizontal: 4 },
  typeBtnActive: { backgroundColor: '#8b5cf6' },
  typeText: { color: '#9ca3af', fontSize: 14, fontWeight: 'bold' },
  typeTextActive: { color: '#ffffff' },
  modalConfirmBtn: { backgroundColor: '#3b82f6', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  modalConfirmText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});