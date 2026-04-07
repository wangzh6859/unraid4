import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, FlatList, Image, Alert, Dimensions, TextInput, KeyboardAvoidingView, Platform, Modal, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { XMLParser } from 'fast-xml-parser';
import base64 from 'base-64';
import { PlayCircle, RefreshCw, Film, Server, User, Key, Plus, FolderHeart, LogOut, Folder, ChevronRight, CheckCircle2, X, Search, Clock, Ban, ArrowUpDown } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const POSTER_WIDTH = (width - 48) / 3; 
const POSTER_HEIGHT = POSTER_WIDTH * 1.5; 
const MIN_VIDEO_SIZE = 100 * 1024 * 1024; 

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
  const [isTesting, setIsTesting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // 💡 排序状态
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortType, setSortType] = useState('title_asc'); // 默认按标题 A-Z

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
      const [url, user, pass, libs, cache, progress] = await Promise.all([
        AsyncStorage.getItem('@media_dav_url'), AsyncStorage.getItem('@media_dav_user'), AsyncStorage.getItem('@media_dav_pass'),
        AsyncStorage.getItem('@media_libraries'), AsyncStorage.getItem('@media_movie_cache'), AsyncStorage.getItem('@media_playback_progress')
      ]);
      if (url && user && pass) {
        setDavUrl(url); setUsername(user); setPassword(pass); setIsConfigured(true);
        if (libs) setLibraries(JSON.parse(libs));
        if (cache) setMovieList(JSON.parse(cache));
        if (progress) setContinueWatching(JSON.parse(progress));
      }
    } catch (e) {} finally { if (isMounted.current) setLoading(false); }
  };

  const handleConnect = async () => {
    if (!davUrl || !username || !password) return Alert.alert('提示', '请填写完整');
    setIsTesting(true);
    try {
      let cleanUrl = davUrl.trim(); if (!cleanUrl.endsWith('/')) cleanUrl += '/';
      const auth = `Basic ${base64.encode(`${username}:${password}`)}`;
      let res = await fetch(cleanUrl, { method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': '1' } });
      if (res.status === 405 && !cleanUrl.endsWith('/dav/')) {
        cleanUrl += 'dav/'; res = await fetch(cleanUrl, { method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': '1' } });
      }
      if (res.ok || res.status === 207) {
        await AsyncStorage.multiSet([['@media_dav_url', cleanUrl], ['@media_dav_user', username], ['@media_dav_pass', password]]);
        setDavUrl(cleanUrl); setIsConfigured(true);
      } else { Alert.alert('错误', '验证失败'); }
    } catch (e) { Alert.alert('错误', '无法连接服务器'); } finally { setIsTesting(false); }
  };

  const handleLogout = () => {
    Alert.alert('注销', '确定退出并清除缓存吗？', [
      { text: '取消' }, { text: '注销', style: 'destructive', onPress: async () => {
        await AsyncStorage.multiRemove(['@media_dav_url', '@media_dav_pass', '@media_movie_cache', '@media_libraries']);
        setIsConfigured(false); setMovieList([]); setLibraries([]);
      }}
    ]);
  };

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
      const items = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true }).parse(await res.text())?.multistatus?.response || [];
      const folders = (Array.isArray(items) ? items : [items]).filter(i => {
        let h = i.href.replace(/https?:\/\/[^\/]+/, '');
        return i.propstat?.prop?.resourcetype?.collection === '' && h !== targetPath && h !== targetPath + '/';
      }).map(i => {
        let h = i.href.replace(/https?:\/\/[^\/]+/, '');
        return { name: decodeURIComponent(h.split('/').filter(Boolean).pop()||''), path: h.endsWith('/') ? h : h + '/' };
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

  const handleSaveLibrary = async (isExclude = false) => {
    let updatedLibs = [...libraries];
    if (browserMode === 'create') {
      if (!newLibName.trim()) return Alert.alert('提示', '请输入名称');
      updatedLibs.push({ id: Date.now().toString(), name: newLibName.trim(), type: newLibType, paths: [browserPath], excludes: [] });
    } else {
      updatedLibs = updatedLibs.map(l => {
        if (l.id === targetLibId) {
          if (isExclude) return { ...l, excludes: [...new Set([...(l.excludes||[]), browserPath])] };
          return { ...l, paths: [...new Set([...l.paths, browserPath])] };
        } return l;
      });
    }
    setLibraries(updatedLibs); await AsyncStorage.setItem('@media_libraries', JSON.stringify(updatedLibs));
    setShowAddLibModal(false); startScan(updatedLibs); 
  };

  const deleteLib = (id) => {
    Alert.alert('删除媒体库', '确定要移除此分类吗？', [
      { text: '取消' }, { text: '删除', style: 'destructive', onPress: async () => {
          const updated = libraries.filter(l => l.id !== id);
          setLibraries(updated); await AsyncStorage.setItem('@media_libraries', JSON.stringify(updated));
          const updatedMovies = movieList.filter(m => m.libraryId !== id);
          setMovieList(updatedMovies); await AsyncStorage.setItem('@media_movie_cache', JSON.stringify(updatedMovies));
          if (activeTab === id) setActiveTab('all');
      }}
    ]);
  };

  const parseNfo = (xmlData) => {
    try {
      const result = new XMLParser({ ignoreAttributes: true }).parse(xmlData);
      const meta = result.tvshow || result.movie || result.video || result.episodedetails || {};
      return { title: meta.title || meta.originaltitle || '未知标题', plot: meta.plot || '暂无简介', year: meta.year || '', rating: meta.rating || meta.userrating || '0.0' };
    } catch (e) { return { title: '解析失败', plot: '', year: '', rating: '0.0' }; }
  };

  const startScan = async (libsToScan = libraries) => {
    if (isScanning || !libsToScan.length) return;
    setIsScanning(true); let results = [];
    const auth = `Basic ${base64.encode(`${username}:${password}`)}`;
    const origin = davUrl.match(/^(https?:\/\/[^\/]+)/)[1];
    const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });

    try {
      for (const lib of libsToScan) {
        let queue = [...lib.paths]; const excludes = lib.excludes || [];
        while (queue.length > 0) {
          const currentPath = queue.shift(); const path = currentPath.endsWith('/') ? currentPath : currentPath + '/';
          if (excludes.some(ex => path.startsWith(ex))) continue;

          setScanProgress(`${lib.name}: ${decodeURIComponent(path).split('/').filter(Boolean).pop() || '...'}`);
          try {
            const res = await fetch(origin + path, { method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': '1' } });
            let items = parser.parse(await res.text())?.multistatus?.response || [];
            if (!Array.isArray(items)) items = [items];

            let nfoItem = items.find(i => i.href.toLowerCase().endsWith('.nfo'));
            if (nfoItem) {
              let movie = { id: `${lib.id}-${results.length}`, libraryId: lib.id, type: lib.type, title: decodeURIComponent(path.split('/').filter(Boolean).pop() || '未知'), path: path, videoUrl: null, posterUrl: null, nfo: null };
              try {
                const nfoRes = await fetch(origin + nfoItem.href, { headers: { 'Authorization': auth }});
                movie.nfo = parseNfo(await nfoRes.text());
                if (movie.nfo.title && movie.nfo.title !== '未知标题') movie.title = movie.nfo.title;
              } catch(e){ console.log(`Error parsing NFO for ${path}:`, e); }
              // 尝试在同级目录下寻找海报图片
              const possiblePosterNames = ['poster', 'folder', 'cover', movie.title];
              items.forEach(i => {
                const h = i.href.toLowerCase();
                if (possiblePosterNames.some(name => h.includes(name)) && /\.(jpg|jpeg|png|webp)$/i.test(h)) {
                  movie.posterUrl = origin + i.href;
                }
              });
              if (!movie.posterUrl) {
                // 如果还没有找到海报，尝试找第一个图片文件作为海报
                const firstImage = items.find(i => /\.(jpg|jpeg|png|webp)$/i.test(i.href.toLowerCase()));
                if (firstImage) movie.posterUrl = origin + firstImage.href;
              }
              results.push(movie);
            } else {
              // 如果没有 NFO 文件，尝试从文件名中智能提取标题和寻找海报
              let videoFiles = items.filter(i => {
                if (!/\.(mkv|mp4|avi|iso|ts|rmvb|m2ts|vob|mov|webm)$/i.test(i.href)) return false;
                return Number(i.propstat?.prop?.getcontentlength || 0) >= MIN_VIDEO_SIZE; 
              });

              if (videoFiles.length > 0) {
                // 尝试找一个海报，优先找同级目录下的通用海报名，或者直接以文件夹命名的图片
                let folderName = decodeURIComponent(path.split('/').filter(Boolean).pop() || '未知');
                let bestPoster = null;
                const possiblePosterNames = ['poster', 'folder', 'cover', folderName];

                items.forEach(i => {
                  const h = i.href.toLowerCase();
                  if (!bestPoster && possiblePosterNames.some(name => h.includes(name)) && /\.(jpg|jpeg|png|webp)$/i.test(h)) {
                    bestPoster = origin + i.href;
                  }
                });
                if (!bestPoster) {
                  const firstImage = items.find(i => /\.(jpg|jpeg|png|webp)$/i.test(i.href.toLowerCase()));
                  if (firstImage) bestPoster = origin + firstImage.href;
                }

                videoFiles.forEach(v => {
                  let title = decodeURIComponent(v.href.split('/').pop()).replace(VIDEO_FORMATS, '').trim();
                  if (!title) title = folderName; // 如果视频文件名提取不出标题，使用文件夹名
                  results.push({ id: `${lib.id}-${results.length}`, libraryId: lib.id, type: lib.type, title: title, path: path, videoUrl: origin + v.href, posterUrl: bestPoster, nfo: null });
                });
              }
              items.forEach(i => {
                const h = i.href.replace(/https?:\/\/[^\/]+/, '');
                if (i.propstat?.prop?.resourcetype?.collection === '' && h !== path && h !== path.slice(0,-1)) {
                  if (!excludes.some(ex => h.startsWith(ex))) queue.push(h.endsWith('/') ? h : h+'/');
                }
              });
            }
            await new Promise(r => setTimeout(r, 10)); 
          } catch (e) {}
        }
      }
      setMovieList(results); await AsyncStorage.setItem('@media_movie_cache', JSON.stringify(results));
    } finally { setIsScanning(false); setScanProgress(''); }
  };

  // 💡 数据过滤与终极排序引擎
  const getFilteredAndSortedData = () => {
    let data = [...(movieList || [])]; // 深拷贝防止污染状态
    
    // 1. Tab 分类过滤
    if (activeTab !== 'all') data = data.filter(m => m.libraryId === activeTab);
    
    // 2. 搜索过滤
    if (searchQuery.trim()) data = data.filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // 3. 排序引擎
    data.sort((a, b) => {
      switch (sortType) {
        case 'title_asc': return a.title.localeCompare(b.title);
        case 'title_desc': return b.title.localeCompare(a.title);
        case 'year_desc': return (parseInt(b.nfo?.year) || 0) - (parseInt(a.nfo?.year) || 0); // 最新上映
        case 'year_asc': return (parseInt(a.nfo?.year) || 0) - (parseInt(b.nfo?.year) || 0);   // 最老经典
        case 'rating_desc': return (parseFloat(b.nfo?.rating) || 0) - (parseFloat(a.nfo?.rating) || 0); // 评分最高
        default: return 0;
      }
    });

    return data;
  };

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
                {isScanning && <Text style={{color:'#3b82f6', fontSize:11, marginTop:4}} numberOfLines={1}>⏳ {scanProgress}</Text>}
            </View>
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity onPress={() => setIsSearching(true)} style={styles.iconBtn}><Search color="#ffffff" size={24} /></TouchableOpacity>
              {/* 💡 排序按钮 */}
              <TouchableOpacity onPress={() => setShowSortModal(true)} style={styles.iconBtn}><ArrowUpDown color="#ffffff" size={22} /></TouchableOpacity>
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
          <Text style={{color:'#9ca3af', marginTop: 8}}>点击右上角 + 号添加分类</Text>
        </View>
      ) : (
        <FlatList
          data={getFilteredAndSortedData()} // 💡 使用排序和过滤后的数据
          keyExtractor={item => item.id}
          numColumns={3}
          ListHeaderComponent={
            <>
              {!isSearching && continueWatching.length > 0 && (
                <View style={{ marginTop: 10, marginBottom: 5 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16, marginBottom: 12 }}>
                    <Clock color="#f59e0b" size={18} /><Text style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginLeft: 6 }}>继续观看</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 16 }}>
                    {continueWatching.map((item, idx) => (
                      <TouchableOpacity key={idx} style={{ width: 140, marginRight: 12 }} onPress={() => navigation.navigate('MediaDetail', { movie: item })}>
                        <Image source={{ uri: item.posterUrl, headers: { 'Authorization': `Basic ${base64.encode(`${username}:${password}`)}` } }} style={{ width: 140, height: 80, borderRadius: 8, backgroundColor: '#374151' }} />
                        <View style={{ height: 3, backgroundColor: '#374151', width: '100%', marginTop: 4, borderRadius: 2, overflow: 'hidden' }}><View style={{ height: '100%', backgroundColor: '#f59e0b', width: `${item.percent}%` }} /></View>
                        <Text style={{ color: '#e5e7eb', fontSize: 12, marginTop: 4, fontWeight: '500' }} numberOfLines={1}>{item.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              {!isSearching && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 15, paddingHorizontal: 16, maxHeight: 40 }}>
                  <TouchableOpacity onPress={() => setActiveTab('all')} style={[styles.tab, activeTab === 'all' && styles.tabActive]}><Text style={styles.tabText}>全部</Text></TouchableOpacity>
                  {libraries.map(lib => (
                    <TouchableOpacity key={lib.id} onPress={() => setActiveTab(lib.id)} onLongPress={() => deleteLib(lib.id)} delayLongPress={500} style={[styles.tab, activeTab === lib.id && styles.tabActive]}>
                      <Text style={styles.tabText}>{lib.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {!isSearching && activeTab !== 'all' && (
                <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 15 }}>
                  <TouchableOpacity style={styles.appendBtn} onPress={() => openBrowser('add_path', activeTab)}>
                    <Folder color="#3b82f6" size={16} /><Text style={styles.appendBtnText}>追加目录</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.appendBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)', marginLeft: 10 }]} onPress={() => openBrowser('add_path', activeTab)}>
                    <Ban color="#ef4444" size={16} /><Text style={[styles.appendBtnText, {color: '#ef4444'}]}>排除目录</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.posterCard} onPress={() => navigation.navigate('MediaDetail', { movie: item })}>
              <View style={styles.posterShadow}>
                {item.posterUrl ? <Image source={{ uri: item.posterUrl, headers: { 'Authorization': `Basic ${base64.encode(`${username}:${password}`)}` } }} style={styles.posterImage} /> : <View style={[styles.posterImage, styles.fullCenter]}><Film color="#4b5563" size={32} /></View>}
                {/* 评分角标 (如果排序选了评分，直观显示出来更好) */}
                {item.nfo?.rating && item.nfo?.rating !== '0.0' && <View style={styles.ratingBadge}><Text style={styles.ratingText}>{item.nfo.rating}</Text></View>}
              </View>
              <Text style={{color:'#fff', fontSize:12, marginTop:6}} numberOfLines={1}>{item.title}</Text>
              {sortType.includes('year') && item.nfo?.year && <Text style={{color:'#9ca3af', fontSize:10, marginTop:2}}>{item.nfo.year}</Text>}
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 100 }}
          columnWrapperStyle={{ justifyContent: 'flex-start' }}
        />
      )}

      {/* 💡 排序选项弹窗 (底部面板) */}
      <Modal visible={showSortModal} transparent={true} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSortModal(false)}>
          <View style={styles.sortPanel}>
            <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 12, fontWeight: 'bold' }}>排序依据</Text>
            {[
              { id: 'title_asc', label: '名称 (A-Z)' },
              { id: 'title_desc', label: '名称 (Z-A)' },
              { id: 'year_desc', label: '年份 (最新发行)' },
              { id: 'year_asc', label: '年份 (经典老片)' },
              { id: 'rating_desc', label: '评分 (神作优先)' }
            ].map(opt => (
              <TouchableOpacity 
                key={opt.id} 
                style={[styles.sortItem, sortType === opt.id && { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}
                onPress={() => { setSortType(opt.id); setShowSortModal(false); }}
              >
                <Text style={{ color: sortType === opt.id ? '#3b82f6' : '#e5e7eb', fontSize: 16, fontWeight: sortType === opt.id ? 'bold' : 'normal' }}>
                  {opt.label}
                </Text>
                {sortType === opt.id && <CheckCircle2 color="#3b82f6" size={20} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      
      {/* 📁 浏览器弹窗 */}
      <Modal visible={showAddLibModal} animationType="slide">
          <View style={styles.container}>
              <View style={styles.browserHeader}>
                  <Text style={{color:'#fff', fontSize:18, fontWeight:'bold'}}>{browserMode === 'create' ? '新建媒体库' : '管理目录'}</Text>
                  <TouchableOpacity onPress={() => setShowAddLibModal(false)}><X color="#ffffff" size={28} /></TouchableOpacity>
              </View>
              <View style={{flexDirection:'row', alignItems:'center', padding:15, backgroundColor:'#1f2937'}}>
                <TouchableOpacity onPress={goUpFolder}><ChevronRight color="#3b82f6" size={24} style={{transform:[{rotate:'180deg'}]}}/></TouchableOpacity>
                <Text style={{color:'#3b82f6', marginLeft:8}}>{decodeURIComponent(browserPath)}</Text>
              </View>
              <ScrollView style={{ flex: 1 }}>
                {browserLoading ? <ActivityIndicator size="large" color="#3b82f6" style={{marginTop:40}} /> : 
                  browserFolders.map((f, i) => (
                    <TouchableOpacity key={i} style={{flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#1f2937'}} onPress={() => { setBrowserPath(f.path); fetchBrowserFolders(f.path); }}>
                      <Folder color="#3b82f6" size={22} /><Text style={{color:'#fff', marginLeft:12, fontSize:15}}>{f.name}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
              <View style={{padding:20, backgroundColor:'#1f2937', borderTopWidth:1, borderTopColor:'#374151'}}>
                  {browserMode === 'create' ? (
                    <>
                      <TextInput style={styles.setupInput} placeholder="媒体库名称 (如: 电影)" placeholderTextColor="#6b7280" value={newLibName} onChangeText={setNewLibName} />
                      <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:20}}>
                        {['movie', 'tv', 'anime'].map(t => (
                          <TouchableOpacity key={t} style={[styles.typeBtn, newLibType === t && {backgroundColor:'#8b5cf6'}]} onPress={() => setNewLibType(t)}>
                            {newLibType === t && <CheckCircle2 color="#fff" size={16} style={{marginRight:4}} />}
                            <Text style={{color: newLibType === t ? '#fff' : '#9ca3af', fontWeight: 'bold'}}>{t === 'movie' ? '电影' : t === 'tv' ? '剧集' : '动漫'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity style={styles.primaryBtn} onPress={() => handleSaveLibrary(false)}><Text style={styles.btnText}>保存并扫描</Text></TouchableOpacity>
                    </>
                  ) : (
                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                      <TouchableOpacity style={[styles.primaryBtn, {flex: 1, marginRight: 10}]} onPress={() => handleSaveLibrary(false)}>
                        <Text style={styles.btnText}>包含此目录</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.primaryBtn, {flex: 1, backgroundColor: '#ef4444'}]} onPress={() => handleSaveLibrary(true)}>
                        <Text style={styles.btnText}>设为排除目录</Text>
                      </TouchableOpacity>
                    </View>
                  )}
              </View>
          </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' }, fullCenter: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 55, backgroundColor: '#1f2937', minHeight: 100 },
  headerTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold' }, iconBtn: { marginLeft: 15 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 10, paddingHorizontal: 12, height: 45 },
  searchInput: { flex: 1, color: '#ffffff', marginLeft: 10, fontSize: 16 },
  setupCard: { backgroundColor: '#1f2937', borderRadius: 20, padding: 25, width: '100%' }, setupTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', borderRadius: 10, marginBottom: 15, paddingHorizontal: 15 },
  input: { flex: 1, color: '#ffffff', height: 50, marginLeft: 10 }, primaryBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, alignItems: 'center' }, btnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  tab: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1f2937', marginRight: 10, borderWidth: 1, borderColor: '#374151', justifyContent: 'center' },
  tabActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' }, tabText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  appendBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: 'rgba(59, 130, 246, 0.15)', borderRadius: 8 },
  appendBtnText: { color: '#3b82f6', marginLeft: 6, fontSize: 12, fontWeight: 'bold' },
  posterCard: { width: POSTER_WIDTH, marginBottom: 18, marginRight: 12 }, posterShadow: { elevation: 8, shadowColor: '#000', borderRadius: 10, overflow: 'hidden', position: 'relative' }, posterImage: { width: POSTER_WIDTH, height: POSTER_HEIGHT, backgroundColor: '#1f2937' },
  ratingBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(245, 158, 11, 0.9)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }, ratingText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold' },
  browserHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 50, backgroundColor: '#1f2937' },
  setupInput: { backgroundColor: '#374151', color: '#ffffff', padding: 15, borderRadius: 10, marginBottom: 15 },
  typeBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, backgroundColor: '#374151', borderRadius: 8, marginHorizontal: 4 },
  
  // 💡 排序面板样式
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  sortPanel: { backgroundColor: '#1f2937', borderRadius: 16, padding: 20, elevation: 10 },
  sortItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 8 }
});