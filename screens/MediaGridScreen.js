import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, FlatList, Image, Alert, Dimensions, TextInput, KeyboardAvoidingView, Platform, Modal, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { XMLParser } from 'fast-xml-parser';
import base64 from 'base-64';
import { PlayCircle, RefreshCw, Film, Server, User, Key, Plus, FolderHeart, X } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const POSTER_WIDTH = (width - 48) / 3; 
const POSTER_HEIGHT = POSTER_WIDTH * 1.5; 

export default function MediaGridScreen({ navigation }) {
  // 基础认证状态
  const [isConfigured, setIsConfigured] = useState(false);
  const [davUrl, setDavUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  // 媒体库状态
  const [libraries, setLibraries] = useState([]); // 存储如 ['/media/movies', '/media/anime']
  const [movieList, setMovieList] = useState([]);
  
  // 扫描与UI状态
  const [loading, setLoading] = useState(true);
  const [scanningInfo, setScanningInfo] = useState('');
  const [showAddLibModal, setShowAddLibModal] = useState(false);
  const [newLibPath, setNewLibPath] = useState('/media/movies');

  // 1. 初始化：读取配置和缓存
  useEffect(() => {
    loadConfigAndCache();
  }, []);

  const loadConfigAndCache = async () => {
    try {
      const savedUrl = await AsyncStorage.getItem('@media_dav_url');
      const savedUser = await AsyncStorage.getItem('@media_dav_user');
      const savedPass = await AsyncStorage.getItem('@media_dav_pass');
      const savedLibs = await AsyncStorage.getItem('@media_libraries');
      const savedCache = await AsyncStorage.getItem('@media_movie_cache');
      
      if (savedUrl && savedUser && savedPass) {
        setDavUrl(savedUrl);
        setUsername(savedUser);
        setPassword(savedPass);
        setIsConfigured(true);

        const parsedLibs = savedLibs ? JSON.parse(savedLibs) : [];
        setLibraries(parsedLibs);

        // 如果有本地缓存，直接秒开海报墙！
        if (savedCache) {
          setMovieList(JSON.parse(savedCache));
          setLoading(false);
        } else if (parsedLibs.length > 0) {
          scanAllLibraries(savedUrl, savedUser, savedPass, parsedLibs);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (e) { console.error(e); setLoading(false); }
  };

  // 2. 独立认证逻辑 (智能追加 /dav/)
  const handleConnect = async () => {
    if (!davUrl || !username || !password) { Alert.alert('提示', '请完整填写信息'); return; }
    let cleanUrl = davUrl.trim();
    if (!cleanUrl.endsWith('/')) cleanUrl += '/'; 

    setIsTesting(true);
    try {
      const credentials = base64.encode(`${username}:${password}`);
      const headers = { 'Authorization': `Basic ${credentials}`, 'Depth': '1' };
      
      let response = await fetch(cleanUrl, { method: 'PROPFIND', headers });
      // AList 智能嗅探
      if (response.status === 405 && !cleanUrl.endsWith('/dav/')) {
        const alistUrl = cleanUrl + 'dav/';
        let retryResponse = await fetch(alistUrl, { method: 'PROPFIND', headers });
        if (retryResponse.status === 200 || retryResponse.status === 207) {
          response = retryResponse;
          cleanUrl = alistUrl;
        }
      }

      if (response.status === 200 || response.status === 207) {
        await AsyncStorage.setItem('@media_dav_url', cleanUrl);
        await AsyncStorage.setItem('@media_dav_user', username);
        await AsyncStorage.setItem('@media_dav_pass', password);
        setDavUrl(cleanUrl);
        setIsConfigured(true);
        Alert.alert('连接成功', '现在请添加您的媒体库路径 (例如 /media/movies)');
      } else {
        Alert.alert('连接失败', `状态码：${response.status}`);
      }
    } catch (error) { Alert.alert('网络错误', '无法连接到服务器'); } finally { setIsTesting(false); }
  };

  // 3. 添加媒体库
  const handleAddLibrary = async () => {
    if (!newLibPath.startsWith('/media/')) {
      Alert.alert('格式错误', '路径必须以 /media/ 开头');
      return;
    }
    const updatedLibs = [...libraries, newLibPath];
    setLibraries(updatedLibs);
    await AsyncStorage.setItem('@media_libraries', JSON.stringify(updatedLibs));
    setShowAddLibModal(false);
    
    // 添加后立刻开始扫描新库
    scanAllLibraries(davUrl, username, password, updatedLibs);
  };

  // ==========================================
  // 核心引擎：解析挂载点与智能扫描
  // ==========================================
  const webdavFetch = async (fullUrl, method = 'PROPFIND', isText = false, authHeader) => {
    const response = await fetch(fullUrl, { method: method, headers: { 'Authorization': authHeader, 'Depth': '1' } });
    return isText ? await response.text() : response;
  };

  const parseNfo = (xmlData) => {
    try {
      const parser = new XMLParser({ ignoreAttributes: true });
      const result = parser.parse(xmlData);
      const meta = result.movie || result.video || result.tvshow || {};
      return {
        title: meta.title || meta.originaltitle || '未知标题',
        plot: meta.plot || '暂无简介',
        year: meta.year || '',
        rating: meta.rating || meta.userrating || '0.0',
      };
    } catch (e) { return { title: '解析失败', plot: '', year: '', rating: '' }; }
  };

  const scanAllLibraries = async (url, user, pass, libs) => {
    if (libs.length === 0) return;
    setLoading(true);
    let allMovies = [];
    const auth = `Basic ${base64.encode(`${user}:${pass}`)}`;
    
    // 获取根域名 (例如 http://alist.bbb.ccc:123) 和 真实根路径 (例如 /dav)
    const urlMatch = url.match(/^(https?:\/\/[^\/]+)(.*)$/);
    const origin = urlMatch ? urlMatch[1] : '';
    const realDavRoot = urlMatch && urlMatch[2] ? urlMatch[2] : '/';

    try {
      for (const libPath of libs) {
        // 关键挂载逻辑：将 /media/movies 替换为真实路径 (例如 /dav/movies/)
        const targetRelativePath = libPath.replace('/media', ''); // 变成 /movies
        let realWebDavPath = realDavRoot.replace(/\/$/, '') + targetRelativePath; // 变成 /dav/movies
        if (!realWebDavPath.endsWith('/')) realWebDavPath += '/';

        setScanningInfo(`正在读取目录: ${libPath}...`);
        
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
          
          setScanningInfo(`正在刮削 [${i + 1}/${movieFolders.length}]: ${folderName}`);

          try {
            const folderXml = await webdavFetch(origin + folderHref, 'PROPFIND', true, auth);
            const folderResult = parser.parse(folderXml);
            let files = folderResult?.multistatus?.response || [];
            if (!Array.isArray(files)) files = [files];

            let movieData = { id: `${libPath}-${i}`, title: folderName, posterUrl: null, videoUrl: null, nfo: null };

            for (const file of files) {
              let fileHref = file.href.replace(/https?:\/\/[^\/]+/, '');
              const fileName = decodeURIComponent(fileHref.split('/').pop());
              const directUrl = origin + fileHref;
              const lowerName = fileName.toLowerCase();

              // 读取 NFO
              if (lowerName.endsWith('.nfo') && !movieData.nfo) {
                const nfoContent = await webdavFetch(directUrl, 'GET', true, auth);
                movieData.nfo = parseNfo(nfoContent);
                movieData.title = movieData.nfo.title; 
              }
              // 读取海报
              if ((lowerName.includes('poster.') || lowerName.includes('folder.')) && /\.(jpg|jpeg|png|webp)$/i.test(lowerName) && !movieData.posterUrl) {
                movieData.posterUrl = directUrl;
              }
              // 读取视频实体
              if (/\.(mkv|mp4|avi|mov|m4v|iso)$/i.test(lowerName) && !movieData.videoUrl) {
                movieData.videoUrl = directUrl;
              }
            }

            if (movieData.videoUrl) allMovies.push(movieData);
          } catch (err) { console.log(`跳过 ${folderName}`, err); }
        }
      }

      setMovieList(allMovies);
      // 写入本地缓存，下次秒开
      await AsyncStorage.setItem('@media_movie_cache', JSON.stringify(allMovies));
    } catch (error) {
      Alert.alert('扫描失败', '无法读取指定路径，请检查目录是否存在。');
    } finally {
      setLoading(false);
    }
  };

  // 渲染单个海报卡片
  const renderMovieItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.posterCard}
      onPress={() => Alert.alert('电影详情', `名称：${item.title}\n年份：${item.nfo?.year || '未知'}\n\n简介：${item.nfo?.plot?.substring(0, 100)}...`)}
    >
      <View style={styles.posterShadow}>
        {item.posterUrl ? (
          <Image 
            source={{ uri: item.posterUrl, headers: { 'Authorization': `Basic ${base64.encode(`${username}:${password}`)}` } }} 
            style={styles.posterImage}
          />
        ) : (
          <View style={[styles.posterImage, styles.posterFallback]}><Film color="#4b5563" size={40} /><Text style={styles.fallbackText}>{item.title}</Text></View>
        )}
        {item.nfo?.rating && item.nfo?.rating !== '0.0' && (
          <View style={styles.ratingBadge}><Text style={styles.ratingText}>{item.nfo.rating}</Text></View>
        )}
      </View>
      <Text style={styles.movieTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.movieYear}>{item.nfo?.year}</Text>
    </TouchableOpacity>
  );

  // ==========================================
  // 状态 A：未配置服务器，渲染独立登录页
  // ==========================================
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

  // ==========================================
  // 状态 B：扫描加载中
  // ==========================================
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginBottom: 20 }} />
        <Text style={styles.loadingText}>元数据引擎运转中...</Text>
        <Text style={styles.loadingSub}>{scanningInfo}</Text>
      </View>
    );
  }

  // ==========================================
  // 状态 C：渲染 Emby 风格海报墙
  // ==========================================
  return (
    <View style={styles.container}>
      {/* 顶部栏 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>我的媒体库</Text>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={() => setShowAddLibModal(true)} style={styles.iconBtn}><Plus color="#ffffff" size={24} /></TouchableOpacity>
          <TouchableOpacity onPress={() => scanAllLibraries(davUrl, username, password, libraries)} style={styles.iconBtn}><RefreshCw color="#ffffff" size={22} /></TouchableOpacity>
        </View>
      </View>

      {libraries.length === 0 ? (
        <View style={styles.emptyState}>
          <FolderHeart color="#4b5563" size={64} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>暂无媒体库</Text>
          <Text style={styles.emptySub}>点击右上角的 + 号，添加例如 /media/movies 的路径来开始刮削。</Text>
        </View>
      ) : (
        <FlatList
          data={movieList}
          renderItem={renderMovieItem}
          keyExtractor={item => item.id.toString()}
          numColumns={3}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 弹窗：添加媒体库路径 */}
      <Modal visible={showAddLibModal} transparent={true} animationType="fade">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>添加媒体库</Text>
            <Text style={styles.modalSub}>内部根目录为 /media，请基于此结构填写绝对路径：</Text>
            <TextInput style={styles.modalInput} value={newLibPath} onChangeText={setNewLibPath} autoCapitalize="none" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAddLibModal(false)}><Text style={styles.modalCancelText}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleAddLibrary}><Text style={styles.modalConfirmText}>添加并扫描</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { flex: 1, backgroundColor: '#111827' },
  
  // 登录表单样式
  setupCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24, elevation: 5, width: '100%' },
  setupTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  setupSub: { color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 8, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#ffffff', height: 50, fontSize: 16 },
  saveBtn: { backgroundColor: '#3b82f6', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },

  // 加载页
  loadingText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  loadingSub: { color: '#9ca3af', fontSize: 13, marginTop: 10, textAlign: 'center', paddingHorizontal: 20 },

  // 顶栏
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 30, backgroundColor: '#1f2937', borderBottomWidth: 1, borderBottomColor: '#374151' },
  headerTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold' },
  iconBtn: { padding: 8, marginLeft: 8 },

  // 空状态
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  emptyTitle: { color: '#e5e7eb', fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  emptySub: { color: '#9ca3af', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // 海报网格
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

  // 弹窗
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 24 },
  modalTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  modalSub: { color: '#9ca3af', fontSize: 13, marginBottom: 20 },
  modalInput: { backgroundColor: '#374151', color: '#ffffff', borderRadius: 8, height: 50, paddingHorizontal: 16, fontSize: 16, marginBottom: 24 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalCancelBtn: { paddingHorizontal: 16, paddingVertical: 10, marginRight: 12 },
  modalCancelText: { color: '#9ca3af', fontSize: 16 },
  modalConfirmBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  modalConfirmText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});