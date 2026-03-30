import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, Image, TouchableOpacity, ActivityIndicator, Dimensions, Platform, Modal, Linking, Alert } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { XMLParser } from 'fast-xml-parser';
import base64 from 'base-64';
import { ChevronLeft, Play, Film, MonitorPlay, X, Settings2, Video as VideoIcon, AudioLines, Subtitles, Info, ExternalLink, CheckCircle2 } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');
const VIDEO_FORMATS = /\.(mkv|mp4|avi|ts|rmvb|flv|wmv|m2ts|vob|mov|webm|iso)$/i;

export default function MediaDetailScreen({ route, navigation }) {
  const movie = route?.params?.movie || {}; 
  
  const [authHeader, setAuthHeader] = useState('');
  const [davOrigin, setDavOrigin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [nfoDetails, setNfoDetails] = useState(movie.nfo || null);
  
  const [activeVideoUrl, setActiveVideoUrl] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackStats, setPlaybackStats] = useState({ position: 0, duration: 0, isBuffering: false });
  
  const videoRef = useRef(null);
  const playbackStatusRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => { 
    isMounted.current = true;
    if (movie.path || movie.videoUrl) loadData(); 
    return () => { isMounted.current = false; };
  }, []);

  const loadData = async () => {
    try {
      const url = await AsyncStorage.getItem('@media_dav_url');
      const user = await AsyncStorage.getItem('@media_dav_user');
      const pass = await AsyncStorage.getItem('@media_dav_pass');
      if (url && user && pass) {
        setUsername(user); setPassword(pass);
        const auth = `Basic ${base64.encode(`${user}:${pass}`)}`;
        setAuthHeader(auth); 
        const origin = url.match(/^(https?:\/\/[^\/]+)/)?.[1] || '';
        setDavOrigin(origin);
        
        if (movie.path) {
          scanEpisodes(origin, auth, movie.path);
          if (!movie.nfo?.fileinfo) fetchDetailedNfo(origin, auth, movie.path);
        } else if (movie.videoUrl) {
          setEpisodes([{ title: movie.title, url: movie.videoUrl, size: 0 }]);
        }
      }
    } catch (error) { console.log('加载凭证失败', error); }
  };

  const fetchDetailedNfo = async (origin, auth, rootPath) => {
    try {
      const res = await fetch(origin + rootPath, { method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': '1' } });
      const items = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true }).parse(await res.text())?.multistatus?.response || [];
      const files = Array.isArray(items) ? items : [items];
      const nfoFile = files.find(i => i.href?.toLowerCase().endsWith('.nfo'));
      if (nfoFile) {
        const nfoRes = await fetch(origin + nfoFile.href, { headers: { 'Authorization': auth }});
        const parsed = new XMLParser({ ignoreAttributes: true }).parse(await nfoRes.text());
        if (isMounted.current) setNfoDetails(parsed.movie || parsed.tvshow || parsed.episodedetails || parsed.video || movie.nfo);
      }
    } catch(e) {}
  };

  const scanEpisodes = async (origin, auth, rootPath) => {
    setLoadingEpisodes(true); let found = []; let queue = [rootPath]; let depthMap = { [rootPath]: 0 }; 
    try {
      while (queue.length > 0) {
        const currentPath = queue.shift(); 
        if (!currentPath) continue;
        const currentDepth = depthMap[currentPath] || 0;
        if (currentDepth > 2) continue; 

        const res = await fetch(origin + currentPath, { method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': '1' } });
        const items = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true }).parse(await res.text())?.multistatus?.response || [];
        const files = Array.isArray(items) ? items : [items];

        files.forEach(i => {
          if (!i.href) return;
          let href = i.href.replace(/https?:\/\/[^\/]+/, '');
          let props = i.propstat?.prop || {}; let isFolder = props.resourcetype?.collection === '';
          
          if (isFolder && href !== currentPath && href !== currentPath.slice(0, -1)) {
            const cleanHref = href.endsWith('/') ? href : href + '/'; 
            queue.push(cleanHref); depthMap[cleanHref] = currentDepth + 1;
          } else if (VIDEO_FORMATS.test(href)) {
            const size = Number(props.getcontentlength || 0);
            if (size >= 100 * 1024 * 1024) { 
              found.push({ title: decodeURIComponent(href.split('/').pop() || '').replace(VIDEO_FORMATS, ''), url: origin + href, size: size });
            }
          }
        });
      }
      if (isMounted.current) setEpisodes(found.sort((a, b) => a.title.localeCompare(b.title)));
    } catch (e) {} finally { if (isMounted.current) setLoadingEpisodes(false); }
  };

  const safeLockLandscape = async () => { try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE); } catch(e){} };
  const safeLockPortrait = async () => { try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch(e){} };

  const onFullscreenUpdate = async ({ fullscreenUpdate }) => {
    if (fullscreenUpdate === 0 || fullscreenUpdate === 1) await safeLockLandscape();
    else if (fullscreenUpdate === 2 || fullscreenUpdate === 3) await safeLockPortrait();
  };

  const closePlayerAndSaveProgress = async () => {
    await safeLockPortrait(); 
    const status = playbackStatusRef.current;
    if (status && activeVideoUrl) {
      const percent = (status.positionMillis / status.durationMillis) * 100;
      if (percent > 1 && percent < 95) {
        const progressRecord = { id: movie.id, title: movie.title, posterUrl: movie.posterUrl, percent: percent.toFixed(1), positionMillis: status.positionMillis, videoUrl: activeVideoUrl };
        try {
          let history = JSON.parse(await AsyncStorage.getItem('@media_playback_progress') || '[]');
          history = history.filter(h => h.id !== movie.id); history.unshift(progressRecord);
          if (history.length > 15) history.pop(); await AsyncStorage.setItem('@media_playback_progress', JSON.stringify(history));
        } catch(e) {}
      }
    }
    setActiveVideoUrl(null); playbackStatusRef.current = null; setShowSettings(false);
  };

  const handleMainPlay = () => {
    if (movie.videoUrl) setActiveVideoUrl(movie.videoUrl);
    else if (episodes.length > 0) setActiveVideoUrl(episodes[0].url); 
    else Alert.alert('提示', '未找到可播放的视频源');
  };

  // 💡 极其硬核的第三方播放器唤醒引擎
  const handleExternalPlay = async () => {
    if (!activeVideoUrl) return;
    
    // 生成带 Basic Auth 认证的直链
    const safeUser = encodeURIComponent(username);
    const safePass = encodeURIComponent(password);
    const cleanOrigin = davOrigin.replace(/^https?:\/\//, '');
    const protocol = davOrigin.startsWith('https') ? 'https://' : 'http://';
    const authOrigin = `${protocol}${safeUser}:${safePass}@${cleanOrigin}`;
    const fullUrl = activeVideoUrl.replace(davOrigin, authOrigin);

    Alert.alert(
      '选择外部播放器',
      '请选择您设备上已安装的专业播放器：',
      [
        { 
          text: 'VLC Player', 
          onPress: () => {
            // VLC 专属协议唤醒
            const vlcUrl = fullUrl.replace(/^https?:\/\//, 'vlc://');
            Linking.openURL(vlcUrl).catch(() => Alert.alert('提示', '您的设备似乎没有安装 VLC 播放器'));
          }
        },
        { 
          text: 'Infuse (iOS/Mac)', 
          onPress: () => {
            // Infuse 专属协议唤醒
            const infuseUrl = `infuse://x-callback-url/play?url=${encodeURIComponent(fullUrl)}`;
            Linking.openURL(infuseUrl).catch(() => Alert.alert('提示', '您的设备似乎没有安装 Infuse 播放器'));
          }
        },
        { 
          text: '系统默认 / 其它播放器', 
          onPress: () => {
            // 交给操作系统去寻找能打开该视频流的 App（例如 Android 的 MX Player 会在这个时候响应）
            Linking.openURL(fullUrl).catch(() => Alert.alert('提示', '无法调用系统播放器'));
          }
        },
        { text: '取消', style: 'cancel' }
      ]
    );
  };

  const handleTrackSelect = (type, name) => {
    Alert.alert(
      `切换${type === 'audio' ? '音轨' : '字幕'}`,
      `您选择了: ${name}\n\n由于系统原生引擎限制，直接在 App 内切换 MKV 内嵌流可能会失效。强烈建议呼叫第三方专业播放器。`,
      [
        { text: '取消', style: 'cancel' },
        { text: '呼叫第三方播放器', onPress: handleExternalPlay, style: 'default' }
      ]
    );
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B'; const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (millis) => {
    if (!millis) return "00:00";
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const renderGeekPanel = () => {
    const stream = nfoDetails?.fileinfo?.streamdetails;
    if (!stream) return null;
    const v = stream.video;
    const aList = Array.isArray(stream.audio) ? stream.audio : (stream.audio ? [stream.audio] : []);
    const sList = Array.isArray(stream.subtitle) ? stream.subtitle : (stream.subtitle ? [stream.subtitle] : []);

    const renderInfoRow = (label, value) => {
      if (!value) return null;
      return (
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          <Text style={{ color: '#9ca3af', width: 80, fontSize: 13 }}>{label}</Text><Text style={{ color: '#e5e7eb', flex: 1, fontSize: 13 }}>{value}</Text>
        </View>
      );
    };

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 15 }}>
        {v && (
          <View style={styles.geekCard}>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}><VideoIcon color="#ffffff" size={18} /><Text style={styles.geekTitle}>视频</Text></View>
            {renderInfoRow('分辨率', `${v.width}x${v.height}`)}
            {renderInfoRow('编码格式', v.codec?.toUpperCase())}
            {renderInfoRow('比特率', v.bitrate ? `${(v.bitrate/1000).toFixed(1)} Mbps` : null)}
            {renderInfoRow('帧速率', v.framerate ? `${v.framerate} fps` : null)}
            {renderInfoRow('宽高比', v.aspect)}
          </View>
        )}
        {aList.length > 0 && (
          <View style={styles.geekCard}>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}><AudioLines color="#ffffff" size={18} /><Text style={styles.geekTitle}>音频</Text></View>
            {aList.map((a, i) => (
              <View key={i} style={{marginBottom: 10, paddingBottom: 10, borderBottomWidth: i===aList.length-1?0:1, borderBottomColor:'#374151'}}>
                {renderInfoRow(`音轨 ${i+1}`, a.language || '未知语言')}
                {renderInfoRow('编码', a.codec?.toUpperCase())}
                {renderInfoRow('声道', a.channels ? `${a.channels} ch` : null)}
              </View>
            ))}
          </View>
        )}
        {sList.length > 0 && (
          <View style={styles.geekCard}>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15}}><Subtitles color="#ffffff" size={18} /><Text style={styles.geekTitle}>字幕</Text></View>
            {sList.map((s, i) => <View key={i} style={{marginBottom: 4}}>{renderInfoRow(`字幕 ${i+1}`, s.language || '未知')}</View>)}
          </View>
        )}
      </ScrollView>
    );
  };

  const renderTrackSelectors = () => {
    const stream = nfoDetails?.fileinfo?.streamdetails;
    if (!stream) return <Text style={styles.consoleText}>当前视频未提供轨道数据</Text>;
    
    const audios = Array.isArray(stream.audio) ? stream.audio : (stream.audio ? [stream.audio] : []);
    const subs = Array.isArray(stream.subtitle) ? stream.subtitle : (stream.subtitle ? [stream.subtitle] : []);

    return (
      <View>
        <View style={styles.consoleRow}><AudioLines color="#9ca3af" size={18} /><Text style={styles.consoleTitle}>选择音轨 ({audios.length})</Text></View>
        {audios.length > 0 ? audios.map((a, i) => (
          <TouchableOpacity key={i} style={styles.trackItem} onPress={() => handleTrackSelect('audio', a.language || `Track ${i+1}`)}>
            <View style={styles.radioCircle}>{i === 0 && <View style={styles.radioInner} />}</View>
            <Text style={styles.trackText}>Track {i+1}: {a.language || '未知语言'} ({a.codec?.toUpperCase()})</Text>
          </TouchableOpacity>
        )) : <Text style={styles.consoleText}>无独立音轨</Text>}

        <View style={[styles.consoleRow, { marginTop: 24 }]}><Subtitles color="#9ca3af" size={18} /><Text style={styles.consoleTitle}>选择字幕 ({subs.length})</Text></View>
        {subs.length > 0 ? (
          <>
            <TouchableOpacity style={styles.trackItem} onPress={() => {}}>
              <View style={styles.radioCircle}></View><Text style={styles.trackText}>关闭字幕</Text>
            </TouchableOpacity>
            {subs.map((s, i) => (
              <TouchableOpacity key={i} style={styles.trackItem} onPress={() => handleTrackSelect('sub', s.language || `Sub ${i+1}`)}>
                <View style={styles.radioCircle}>{i === 0 && <View style={styles.radioInner} />}</View>
                <Text style={styles.trackText}>字幕 {i+1}: {s.language || '未知'} </Text>
              </TouchableOpacity>
            ))}
          </>
        ) : <Text style={styles.consoleText}>无内嵌字幕</Text>}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {activeVideoUrl && (
        <View style={styles.playerWrapper}>
          <View style={styles.playerContainer}>
            <View style={styles.playerTopBar}>
              <TouchableOpacity style={styles.iconBtnLayer} onPress={closePlayerAndSaveProgress}><X color="#ffffff" size={28} /></TouchableOpacity>
              <TouchableOpacity style={styles.iconBtnLayer} onPress={() => setShowSettings(true)}><Settings2 color="#ffffff" size={26} /></TouchableOpacity>
            </View>
            <Video
              ref={videoRef} style={styles.videoView} source={{ uri: activeVideoUrl, headers: { 'Authorization': authHeader } }}
              useNativeControls resizeMode={ResizeMode.CONTAIN} shouldPlay
              onFullscreenUpdate={onFullscreenUpdate}
              onPlaybackStatusUpdate={(status) => { 
                if (status.isLoaded) {
                  playbackStatusRef.current = status;
                  setPlaybackStats({ position: status.positionMillis, duration: status.durationMillis, isBuffering: status.isBuffering });
                } 
              }}
              positionMillis={movie.positionMillis || 0} 
            />
          </View>

          <Modal visible={showSettings} transparent={true} animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.consolePanel}>
                <View style={styles.consoleHeader}>
                  <Text style={{color:'#fff', fontSize:18, fontWeight:'bold'}}>播放设置</Text>
                  <TouchableOpacity onPress={() => setShowSettings(false)}><X color="#9ca3af" size={24} /></TouchableOpacity>
                </View>
                <ScrollView style={{ padding: 20 }}>
                  <View style={styles.statsCard}>
                    <View style={styles.consoleRow}><Info color="#3b82f6" size={18} /><Text style={styles.consoleTitle}>实时状态</Text></View>
                    <Text style={styles.consoleText}>播放进度: {formatTime(playbackStats.position)} / {formatTime(playbackStats.duration)}</Text>
                    <Text style={styles.consoleText}>网络缓冲: {playbackStats.isBuffering ? '🔄 缓冲中...' : '✅ 稳定'}</Text>
                  </View>

                  {renderTrackSelectors()}

                  <View style={styles.divider} />
                  
                  {/* 💡 这里就是全新的外部唤醒引擎按钮 */}
                  <TouchableOpacity style={styles.externalBtn} onPress={handleExternalPlay}>
                    <ExternalLink color="#ffffff" size={18} style={{marginRight: 8}}/>
                    <Text style={{color:'#fff', fontWeight:'bold'}}>使用第三方播放器打开视频</Text>
                  </TouchableOpacity>
                  <Text style={{color:'#6b7280', fontSize: 11, textAlign:'center', marginTop:8, marginBottom:40}}>* 受限于原生流媒体解码器能力，如遇切换失效或无声音，请呼叫第三方专业播放器。</Text>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      )}

      <ScrollView style={styles.scrollView} bounces={false}>
        <View style={styles.heroSection}>
          {movie.posterUrl ? <Image source={{ uri: movie.posterUrl, headers: { 'Authorization': authHeader } }} style={styles.backdropImage} /> : <View style={[styles.backdropImage, { backgroundColor: '#1f2937' }]} />}
          <BlurView intensity={80} tint="dark" style={styles.blurOverlay} />
          <View style={styles.heroGradient} />
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><ChevronLeft color="#ffffff" size={32} /></TouchableOpacity>

          <View style={styles.heroContent}>
            {movie.posterUrl ? <Image source={{ uri: movie.posterUrl, headers: { 'Authorization': authHeader } }} style={styles.mainPoster} /> : <View style={[styles.mainPoster, styles.fallbackPoster]}><Film color="#4b5563" size={48} /></View>}
            <View style={styles.heroTextContainer}>
              <Text style={styles.title} numberOfLines={2}>{nfoDetails?.title || movie.title || '未知影片'}</Text>
              <View style={styles.metaRow}>
                {nfoDetails?.year && <Text style={styles.metaText}>{nfoDetails.year}</Text>}
                {nfoDetails?.rating && nfoDetails.rating !== '0.0' && <View style={styles.ratingBadge}><Text style={styles.ratingText}>{nfoDetails.rating}</Text></View>}
                <Text style={styles.typeBadge}>{movie.type === 'movie' ? '电影' : movie.type === 'tv' ? '剧集' : '动漫'}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.actionSection}>
          <TouchableOpacity style={styles.mainPlayBtn} onPress={handleMainPlay}>
            <Play color="#ffffff" size={22} fill="#ffffff" />
            <Text style={styles.mainPlayText}>立即播放</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.plotTitle}>剧情简介</Text>
          <Text style={styles.plotText}>{nfoDetails?.plot || '暂无简介'}</Text>
          {renderGeekPanel()}
        </View>

        <View style={styles.episodesSection}>
          <Text style={styles.plotTitle}>{movie.type === 'movie' ? '影片源' : '选集播放'}</Text>
          {loadingEpisodes ? (
            <View style={styles.centerBox}><ActivityIndicator color="#3b82f6" size="large" /><Text style={{color:'#9ca3af', marginTop:10}}>正在匹配媒体流...</Text></View>
          ) : episodes.length === 0 ? (
            <View style={styles.centerBox}><MonitorPlay color="#4b5563" size={48} /><Text style={{color:'#9ca3af', marginTop:10}}>未找到支持的视频文件 (可能小于100MB或格式不支持)</Text></View>
          ) : (
            episodes.map((ep, index) => (
              <TouchableOpacity key={index} style={styles.episodeCard} onPress={() => setActiveVideoUrl(ep.url)}>
                <View style={styles.episodeIconBox}><Play color="#ffffff" size={20} fill="#ffffff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.episodeTitle} numberOfLines={2}>{ep.title}</Text>
                  <Text style={styles.episodeSub}>{formatBytes(ep.size)}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' }, scrollView: { flex: 1 },
  heroSection: { height: 350, position: 'relative', justifyContent: 'flex-end', padding: 20, paddingBottom: 10 },
  backdropImage: { position: 'absolute', top: 0, left: 0, width: width, height: 350, resizeMode: 'cover' },
  blurOverlay: { position: 'absolute', top: 0, left: 0, width: width, height: 350 },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, width: width, height: 150, backgroundColor: 'rgba(17, 24, 39, 0.8)' }, 
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, left: 16, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  heroContent: { flexDirection: 'row', alignItems: 'flex-end', zIndex: 5 },
  mainPoster: { width: 120, height: 180, borderRadius: 12, borderWidth: 2, borderColor: '#374151', elevation: 10 },
  fallbackPoster: { backgroundColor: '#1f2937', justifyContent: 'center', alignItems: 'center' },
  heroTextContainer: { flex: 1, marginLeft: 16, marginBottom: 0 },
  title: { color: '#ffffff', fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaText: { color: '#e5e7eb', fontSize: 14, marginRight: 12, fontWeight: 'bold' },
  ratingBadge: { backgroundColor: '#f59e0b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 12 },
  ratingText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  typeBadge: { borderWidth: 1, borderColor: '#6b7280', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, color: '#9ca3af', fontSize: 12 },
  actionSection: { paddingHorizontal: 20, marginTop: 15, marginBottom: 10 },
  mainPlayBtn: { backgroundColor: '#e50914', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 8, elevation: 3 },
  mainPlayText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  infoSection: { padding: 20, paddingTop: 10 },
  plotTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  plotText: { color: '#9ca3af', fontSize: 14, lineHeight: 22 },
  geekCard: { backgroundColor: 'rgba(31, 41, 55, 0.6)', padding: 16, borderRadius: 12, width: 220, marginRight: 12, borderWidth: 1, borderColor: 'rgba(55, 65, 81, 0.8)' },
  geekTitle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  episodesSection: { padding: 20, paddingTop: 0, paddingBottom: 50 },
  centerBox: { padding: 40, alignItems: 'center' },
  episodeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', padding: 16, borderRadius: 12, marginBottom: 12, elevation: 3 },
  episodeIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  episodeTitle: { color: '#e5e7eb', fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  episodeSub: { color: '#6b7280', fontSize: 12 },
  playerWrapper: { position: 'absolute', top: 0, left: 0, width: width, height: height, zIndex: 999, backgroundColor: '#000', justifyContent: 'center' },
  playerContainer: { flex: 1, justifyContent: 'center', position: 'relative' },
  playerTopBar: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, left: 0, width: '100%', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, zIndex: 1000 },
  iconBtnLayer: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  videoView: { width: '100%', height: height * 0.4 }, 
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  consolePanel: { backgroundColor: '#1f2937', height: height * 0.7, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  consoleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#374151' },
  statsCard: { backgroundColor: '#111827', padding: 16, borderRadius: 12, marginBottom: 20 },
  consoleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  consoleTitle: { color: '#e5e7eb', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  consoleText: { color: '#9ca3af', fontSize: 14, marginBottom: 6 },
  trackItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#374151' },
  radioCircle: { height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  radioInner: { height: 10, width: 10, borderRadius: 5, backgroundColor: '#3b82f6' },
  trackText: { color: '#e5e7eb', fontSize: 15 },
  divider: { height: 1, backgroundColor: '#374151', marginVertical: 20 },
  externalBtn: { flexDirection: 'row', backgroundColor: '#8b5cf6', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
});