import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, Image, TouchableOpacity, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { XMLParser } from 'fast-xml-parser';
import base64 from 'base-64';
import { ChevronLeft, Play, Film, MonitorPlay, X } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

export default function MediaDetailScreen({ route, navigation }) {
  // 从路由参数中获取上一个页面传过来的电影对象
  const { movie } = route.params;
  
  const [authHeader, setAuthHeader] = useState('');
  const [davOrigin, setDavOrigin] = useState('');
  
  // 剧集状态
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // 播放器状态
  const [activeVideoUrl, setActiveVideoUrl] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    loadAuthAndEpisodes();
  }, []);

  const loadAuthAndEpisodes = async () => {
    try {
      const url = await AsyncStorage.getItem('@media_dav_url');
      const user = await AsyncStorage.getItem('@media_dav_user');
      const pass = await AsyncStorage.getItem('@media_dav_pass');
      
      if (url && user && pass) {
        const auth = `Basic ${base64.encode(`${user}:${pass}`)}`;
        setAuthHeader(auth);
        const origin = url.match(/^(https?:\/\/[^\/]+)/)[1];
        setDavOrigin(origin);

        // 💡 如果是剧集或动漫，触发子目录深度扫描，找出所有集数
        if (movie.type === 'tv' || movie.type === 'anime') {
          scanEpisodes(origin, auth, movie.path);
        } else if (movie.videoUrl) {
          // 如果是电影且已经有直链，包装成一个假集数方便统一渲染
          setEpisodes([{ title: movie.title, url: movie.videoUrl }]);
        }
      }
    } catch (error) { console.error('加载凭证失败', error); }
  };

  // 🧠 专为剧集打造的集数扫描器 (只往下钻两层，防止卡顿)
  const scanEpisodes = async (origin, auth, rootPath) => {
    setLoadingEpisodes(true);
    let foundEpisodes = [];
    let queue = [rootPath];
    let depthMap = { [rootPath]: 0 }; // 记录目录深度

    try {
      while (queue.length > 0) {
        const currentPath = queue.shift();
        const currentDepth = depthMap[currentPath];
        if (currentDepth > 2) continue; // 最多钻两层 (比如 Season 1 -> S01E01.mkv)

        const res = await fetch(origin + currentPath, { method: 'PROPFIND', headers: { 'Authorization': auth, 'Depth': '1' } });
        const items = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true }).parse(await res.text())?.multistatus?.response || [];
        const files = Array.isArray(items) ? items : [items];

        files.forEach(i => {
          let href = i.href.replace(/https?:\/\/[^\/]+/, '');
          let isFolder = i.propstat?.prop?.resourcetype?.collection === '';
          
          if (isFolder && href !== currentPath && href !== currentPath.slice(0, -1)) {
            const cleanHref = href.endsWith('/') ? href : href + '/';
            queue.push(cleanHref);
            depthMap[cleanHref] = currentDepth + 1;
          } else if (/\.(mkv|mp4|avi|ts|rmvb)$/i.test(href)) {
            // 找到视频文件，当作一集
            let filename = decodeURIComponent(href.split('/').pop());
            foundEpisodes.push({ 
                title: filename.replace(/\.(mkv|mp4|avi|ts|rmvb)$/i, ''), 
                url: origin + href 
            });
          }
        });
      }
      // 按文件名排序 (比如 S01E01, S01E02)
      setEpisodes(foundEpisodes.sort((a, b) => a.title.localeCompare(b.title)));
    } catch (e) {
      console.log('读取集数失败', e);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handlePlay = (videoUrl) => {
    setActiveVideoUrl(videoUrl);
  };

  // --- UI 渲染 ---
  return (
    <View style={styles.container}>
      {/* 💡 播放器遮罩层 */}
      {activeVideoUrl && (
        <View style={styles.playerContainer}>
          <TouchableOpacity style={styles.closePlayerBtn} onPress={() => setActiveVideoUrl(null)}>
            <X color="#ffffff" size={28} />
          </TouchableOpacity>
          <Video
            ref={videoRef}
            style={styles.videoView}
            source={{ uri: activeVideoUrl, headers: { 'Authorization': authHeader } }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
          />
        </View>
      )}

      <ScrollView style={styles.scrollView} bounces={false}>
        {/* 顶部背景与海报区 */}
        <View style={styles.heroSection}>
          {movie.posterUrl ? (
            <Image source={{ uri: movie.posterUrl, headers: { 'Authorization': authHeader } }} style={styles.backdropImage} />
          ) : (
            <View style={[styles.backdropImage, { backgroundColor: '#1f2937' }]} />
          )}
          {/* 高级毛玻璃遮罩，营造氛围 */}
          <BlurView intensity={80} tint="dark" style={styles.blurOverlay} />
          <View style={styles.heroGradient} />

          {/* 返回按钮 */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ChevronLeft color="#ffffff" size={32} />
          </TouchableOpacity>

          {/* 海报与基本信息 */}
          <View style={styles.heroContent}>
            {movie.posterUrl ? (
              <Image source={{ uri: movie.posterUrl, headers: { 'Authorization': authHeader } }} style={styles.mainPoster} />
            ) : (
              <View style={[styles.mainPoster, styles.fallbackPoster]}><Film color="#4b5563" size={48} /></View>
            )}
            <View style={styles.heroTextContainer}>
              <Text style={styles.title} numberOfLines={2}>{movie.title}</Text>
              <View style={styles.metaRow}>
                {movie.nfo?.year && <Text style={styles.metaText}>{movie.nfo.year}</Text>}
                {movie.nfo?.rating && movie.nfo.rating !== '0.0' && (
                  <View style={styles.ratingBadge}><Text style={styles.ratingText}>{movie.nfo.rating}</Text></View>
                )}
                <Text style={styles.typeBadge}>{movie.type === 'movie' ? '电影' : movie.type === 'tv' ? '剧集' : '动漫'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 简介区 */}
        <View style={styles.infoSection}>
          <Text style={styles.plotTitle}>剧情简介</Text>
          <Text style={styles.plotText}>{movie.nfo?.plot || '暂无简介'}</Text>
        </View>

        {/* 剧集/播放列表区 */}
        <View style={styles.episodesSection}>
          <Text style={styles.plotTitle}>{movie.type === 'movie' ? '播放影片' : '选集播放'}</Text>
          
          {loadingEpisodes ? (
            <View style={styles.centerBox}><ActivityIndicator color="#3b82f6" size="large" /><Text style={{color:'#9ca3af', marginTop:10}}>正在扫描视频文件...</Text></View>
          ) : episodes.length === 0 ? (
            <View style={styles.centerBox}><MonitorPlay color="#4b5563" size={48} /><Text style={{color:'#9ca3af', marginTop:10}}>未找到支持的视频文件</Text></View>
          ) : (
            episodes.map((ep, index) => (
              <TouchableOpacity key={index} style={styles.episodeCard} onPress={() => handlePlay(ep.url)}>
                <View style={styles.episodeIconBox}>
                  <Play color="#ffffff" size={20} fill="#ffffff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.episodeTitle} numberOfLines={2}>{ep.title}</Text>
                  <Text style={styles.episodeSub}>WebDAV 直接串流</Text>
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
  container: { flex: 1, backgroundColor: '#111827' },
  scrollView: { flex: 1 },
  
  // 英雄区 (海报与背景)
  heroSection: { height: 350, position: 'relative', justifyContent: 'flex-end', padding: 20 },
  backdropImage: { position: 'absolute', top: 0, left: 0, width: width, height: 350, resizeMode: 'cover' },
  blurOverlay: { position: 'absolute', top: 0, left: 0, width: width, height: 350 },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, width: width, height: 150, backgroundColor: 'rgba(17, 24, 39, 0.8)' }, // 简单的底部渐变过渡
  
  backBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, left: 16, zIndex: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  
  heroContent: { flexDirection: 'row', alignItems: 'flex-end', zIndex: 5 },
  mainPoster: { width: 120, height: 180, borderRadius: 12, borderWidth: 2, borderColor: '#374151', elevation: 10 },
  fallbackPoster: { backgroundColor: '#1f2937', justifyContent: 'center', alignItems: 'center' },
  heroTextContainer: { flex: 1, marginLeft: 16, marginBottom: 10 },
  title: { color: '#ffffff', fontSize: 24, fontWeight: 'bold', marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaText: { color: '#e5e7eb', fontSize: 14, marginRight: 12, fontWeight: 'bold' },
  ratingBadge: { backgroundColor: '#f59e0b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 12 },
  ratingText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
  typeBadge: { borderWidth: 1, borderColor: '#6b7280', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  
  // 简介区
  infoSection: { padding: 20, paddingTop: 10 },
  plotTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  plotText: { color: '#9ca3af', fontSize: 14, lineHeight: 22 },

  // 播放列表区
  episodesSection: { padding: 20, paddingTop: 0, paddingBottom: 50 },
  centerBox: { padding: 40, alignItems: 'center' },
  episodeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', padding: 16, borderRadius: 12, marginBottom: 12, elevation: 3 },
  episodeIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  episodeTitle: { color: '#e5e7eb', fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  episodeSub: { color: '#6b7280', fontSize: 12 },

  // 播放器覆盖层
  playerContainer: { position: 'absolute', top: 0, left: 0, width: width, height: height, backgroundColor: '#000000', zIndex: 999, justifyContent: 'center' },
  closePlayerBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 50 : 30, left: 20, zIndex: 1000, padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 },
  videoView: { width: '100%', height: height * 0.4 }, // 默认竖屏显示宽屏比例，如果横过来就铺满
});