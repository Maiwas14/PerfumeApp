import 'react-native-url-polyfill/auto';
import { StyleSheet, Text, View, Image, ScrollView, Alert, ActivityIndicator, TouchableOpacity, TextInput, SafeAreaView, StatusBar, Dimensions, Modal, Share, KeyboardAvoidingView, Platform, RefreshControl, Animated } from 'react-native';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { createClient } from '@supabase/supabase-js';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://yyrkvbwtnuzkizjrgdiv.supabase.co';
const SUPABASE_ANON_KEY = 'ApiKey';
// IMPORTANTE: API Key de Google Gemini
// IMPORTANTE: Para producción o compartir en GitHub, usa variables de entorno (.env)
// Si usas Expo, puedes configurar esto en app.config.js o usar un archivo .env
const GOOGLE_API_KEY = 'TU_API_KEY_AQUI'; // Reemplaza con tu llave de Google Gemini

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: undefined,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [currentTab, setCurrentTab] = useState<'home' | 'search' | 'profile'>('home');
  const [showProfile, setShowProfile] = useState(false);
  const [view, setView] = useState<'scan' | 'result' | 'main'>('main');
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [aiData, setAiData] = useState<any>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [expertModalVisible, setExpertModalVisible] = useState(false);
  const [expertPerfumes, setExpertPerfumes] = useState<any>(null);
  const [expertInitialQuestion, setExpertInitialQuestion] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [wishlist, setWishlist] = useState<any[]>([]);

  // Theme support
  const colors = {
    background: 'transparent',
    surface: darkMode ? 'rgba(31, 41, 55, 0.7)' : 'rgba(255, 255, 255, 0.85)',
    text: darkMode ? '#F9FAFB' : '#111827',
    textSecondary: darkMode ? '#9CA3AF' : '#6B7280',
    border: darkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)',
    primary: '#A855F7',
    accent: darkMode ? '#C084FC' : '#A855F7',
    card: darkMode ? 'rgba(31, 41, 55, 0.6)' : 'rgba(249, 250, 251, 0.8)',
  };

  useEffect(() => {
    loadPrefs();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkUserStatus(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkUserStatus(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadPrefs = async () => {
    const dm = await AsyncStorage.getItem('darkMode');
    if (dm === 'true') setDarkMode(true);
  };

  const toggleDarkMode = async (val: boolean) => {
    setDarkMode(val);
    await AsyncStorage.setItem('darkMode', val ? 'true' : 'false');
  };

  const checkUserStatus = async (sess: any) => {
    const meta = sess.user.user_metadata;
    if (!meta?.onboarding_done && !meta?.setup_done) {
      // Prioritize setup if missing age/gender
      if (!meta?.age) {
        setShowSetup(true);
      } else {
        checkOnboarding();
      }
    }
    // Cargar perfil real desde la tabla profiles
    fetchUserProfile(sess.user.id);
    fetchWishlist(sess.user.id);
  };

  const fetchWishlist = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_wishlist')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setWishlist(data);
      }
    } catch (e) {
      console.log("Error loading wishlist", e);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        setUserProfile(data);
      }
    } catch (e) {
      console.log("Error loading profile", e);
    }
  };

  const isPremium = userProfile?.subscription_status === 'pro';

  const checkOnboarding = async () => {
    const hasOnboarded = await AsyncStorage.getItem('hasOnboarded');
    if (hasOnboarded !== 'true') {
      setShowOnboarding(true);
    }
  };

  const finishOnboarding = async () => {
    await AsyncStorage.setItem('hasOnboarded', 'true');
    // Also update supabase metadata to sync across devices if possible
    await supabase.auth.updateUser({ data: { onboarding_done: true } });
    setShowOnboarding(false);
  };

  const finishSetup = async (age: string, gender: string, fullName: string, imageUri: string | null) => {
    setLoading(true);
    let avatarUrl = session?.user?.user_metadata?.avatar_url || null;

    if (imageUri) {
      try {
        const fileExt = imageUri.split('.').pop();
        const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
        const { error: uploadError } = await supabase.storage
          .from('perfume_gallery')
          .upload(filePath, decode(base64), { contentType: `image/${fileExt}` });

        if (uploadError) {
          console.error("Upload error:", uploadError);
        } else {
          const { data: { publicUrl } } = supabase.storage.from('perfume_gallery').getPublicUrl(filePath);
          avatarUrl = publicUrl;
        }
      } catch (e) {
        console.error("Avatar upload failed", e);
      }
    }

    const { error } = await supabase.auth.updateUser({
      data: { age, gender, full_name: fullName, avatar_url: avatarUrl, setup_done: true }
    });
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setShowSetup(false);
      checkOnboarding();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setShowOnboarding(false);
    setShowSetup(false);
    setImage(null);
    setAiData(null);
  };

  const startScan = () => {
    setView('scan');
  };

  const resetFlow = () => {
    setImage(null);
    setAiData(null);
    setPhotoUrl(null);
    setView('main');
  };

  const openExpertConsultation = (item: any, question?: string) => {
    setExpertInitialQuestion(question || null);
    setExpertPerfumes(item);
    setExpertModalVisible(true);
  };

  const handleToggleWishlist = async (perfume: any) => {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    const inWishlist = wishlist.find(w => (w.brand === perfume.brand && w.perfume_name === perfume.name));
    
    try {
      if (inWishlist) {
        const { error } = await supabase.from('user_wishlist').delete().eq('id', inWishlist.id);
        if (!error) setWishlist(prev => prev.filter(w => w.id !== inWishlist.id));
      } else {
        const { data, error } = await supabase.from('user_wishlist').insert({
          user_id: userId,
          perfume_name: perfume.name,
          brand: perfume.brand,
          photo_url: perfume.photo_url || image,
          ai_data: perfume.ai_data || perfume
        }).select().single();
        if (!error && data) setWishlist(prev => [data, ...prev]);
      }
    } catch (e) {
      console.error("Error toggling wishlist", e);
    }
  };

  const handleDeletePerfume = (id: string, name: string) => {
    Alert.alert(
      "Eliminar perfume",
      `¿Estás seguro que deseas eliminar "${name}" de tu colección?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Eliminar", 
          style: "destructive", 
          onPress: async () => {
             const { error, count } = await supabase
               .from('user_collections')
               .delete({ count: 'exact' })
               .eq('id', id);

             if(error || count === 0) {
               Alert.alert("Error", "No se pudo eliminar el perfume.");
             } else {
               Alert.alert("Éxito", "Perfume eliminado.");
               setView('main');
             }
          }
        }
      ]
    );
  };

  const handleOpenDetail = (item: any) => {
    // Inyectamos el ID en aiData si viene de la colección
    const dataWithId = { ...item.ai_data, id: item.id };
    setAiData(dataWithId);
    setPhotoUrl(item.photo_url);
    setImage(item.photo_url);
    setView('result');
  };

  if (!session) {
    return <AuthScreen colors={colors} darkMode={darkMode} />;
  }

  if (showSetup) {
    return (
      <SetupProfileScreen 
        onFinish={finishSetup} 
        loading={loading} 
        colors={colors} 
        darkMode={darkMode}
        currentName={session?.user?.user_metadata?.full_name}
      />
    );
  }

  if (showOnboarding) {
    return <OnboardingScreen onFinish={finishOnboarding} colors={colors} />;
  }

  return (
    <LinearGradient 
      colors={darkMode ? ['#0F0A1A', '#2E1065'] : ['#F3E8FF', '#FFFFFF']} 
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
      
      {view === 'main' ? (
        <>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.contentContainer}>
            {currentTab === 'home' && (
              <HomeScreen 
                colors={colors} 
                darkMode={darkMode} 
                session={session} 
                onShowProfile={() => setCurrentTab('profile')} 
                setCurrentTab={setCurrentTab}
                openPerfumeDetail={handleOpenDetail}
                isPremium={isPremium}
                onExpertConsult={(perfumes: any) => openExpertConsultation(perfumes, "Elige mi perfume para hoy basándote en mi colección. Dime cuál debería usar y por qué (ocasión, clima, etc.).")}
              />
            )}
              {currentTab === 'search' && (
                <SearchCollectionScreen 
                  colors={colors} 
                  darkMode={darkMode} 
                  session={session}
                  openPerfumeDetail={handleOpenDetail}
                  onExpertConsult={openExpertConsultation}
                  onUpdateCollection={() => {}} // Optional: for triggering reloads
                  wishlist={wishlist}
                  onToggleWishlist={handleToggleWishlist}
                />
              )}
            {currentTab === 'profile' && (
              <ProfileScreen 
                session={session} 
                onLogout={handleLogout} 
                colors={colors} 
                darkMode={darkMode} 
                onToggleDarkMode={toggleDarkMode}
                userProfile={userProfile}
                onUpgrade={() => {/* Navegar a checkout o mostrar modal */}}
              />
            )}
            <View style={{height: 70}} /> 
          </View>
        </SafeAreaView>
        <TabBar activeTab={currentTab} onTabPress={setCurrentTab} onScanPress={startScan} colors={colors} darkMode={darkMode} />
        </>
      ) : (
        <View style={{ flex: 1 }}>
          {view === 'scan' && (
            <ScanScreen 
              setLoading={setLoading} 
              setImage={setImage} 
              setAiData={setAiData} 
              setView={setView}
              userId={session?.user?.id} 
              onClose={resetFlow}
              colors={colors}
              setPhotoUrl={setPhotoUrl}
            />
          )}

          {view === 'result' && (
            <ResultScreen 
              image={image} 
              aiData={aiData} 
              loading={loading} 
              onReset={resetFlow} 
              colors={colors}
              userId={session?.user?.id}
              photoUrl={photoUrl}
              onDelete={handleDeletePerfume}
              session={session}
              onToggleWishlist={handleToggleWishlist}
              wishlist={wishlist}
            />
          )}
        </View>
      )}

      {/* Modal de Consulta al Experto desde Colección */}
      <AIExpertModal 
        visible={expertModalVisible} 
        onClose={() => {
          setExpertModalVisible(false);
          setExpertPerfumes(null);
        }}
        perfumes={expertPerfumes}
        colors={colors}
        darkMode={darkMode}
        isPremium={isPremium}
        userId={session?.user?.id}
        initialQuestion={expertInitialQuestion}
      />
    </LinearGradient>
  );
}

// --- COMPONENTS ---

function TabBar({ activeTab, onTabPress, onScanPress, colors, darkMode }: any) {
  return (
    <View style={[styles.tabBarWrapper, { 
      shadowColor: "#000", 
      shadowOffset: { width: 0, height: -4 }, 
      shadowOpacity: 0.1, 
      shadowRadius: 10,
      elevation: 10 
    }]}>
      {/* Background with blur effect simulation using RGBA */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: darkMode ? 'rgba(15, 10, 26, 0.95)' : 'rgba(255,255,255,0.95)' }]} />
      <View style={[
        styles.tabBar, 
        { 
          backgroundColor: colors.surface, 
          borderTopWidth: 0,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          elevation: 10
        }
      ]}>
        <TouchableOpacity style={styles.tabItem} onPress={() => onTabPress('home')}>
          <Feather 
            name="compass" 
            size={28} 
            color={activeTab === 'home' ? colors.primary : colors.textSecondary} 
          />
        </TouchableOpacity>

        <View style={styles.fabSpace} />

        <TouchableOpacity style={styles.tabItem} onPress={() => onTabPress('search')}>
          <Feather 
            name="grid" 
            size={28} 
            color={activeTab === 'search' ? colors.primary : colors.textSecondary} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.fabContainer}>
        <TouchableOpacity 
          style={[styles.fabButton, { 
            shadowColor: colors.primary, 
            shadowOffset: { width: 0, height: 4 }, 
            shadowOpacity: 0.4, 
            shadowRadius: 8, 
            elevation: 8 
          }]} 
          onPress={onScanPress}
        >
          <LinearGradient
            colors={['#C084FC', '#A855F7']}
            style={styles.fabGradient}
          >
            <MaterialCommunityIcons name="barcode-scan" size={32} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const StyledButton = ({ title, onPress, variant = 'primary', disabled = false, icon, loading, colors }: any) => {
  const isPrimary = variant === 'primary';
  
  return (
    <TouchableOpacity 
      onPress={onPress} 
      disabled={disabled || loading}
      style={[
        styles.button, 
        !isPrimary && { backgroundColor: 'transparent', borderColor: colors?.primary || '#A855F7' },
        disabled && styles.buttonDisabled
      ]}
    >
      <LinearGradient
        colors={isPrimary ? ['#C084FC', '#A855F7'] : ['transparent', 'transparent']}
        style={styles.buttonInner}
      >
        {loading ? (
          <ActivityIndicator color={isPrimary ? "#FFF" : "#A855F7"} />
        ) : (
          <>
            {icon && <Feather name={icon} size={20} color={isPrimary ? "#FFF" : "#A855F7"} style={{marginRight: 8}} />}
            <Text style={[styles.buttonText, !isPrimary && { color: colors?.primary || '#A855F7' }]}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

// --- SCREENS ---

function HomeScreen({ colors, darkMode, session, onShowProfile, setCurrentTab, openPerfumeDetail, isPremium, onExpertConsult }: any) {
  const user = session?.user;
  const avatarUrl = user?.user_metadata?.avatar_url;
  const fullName = user?.user_metadata?.full_name || 'Usuario';
  const initials = fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2) || user?.email?.[0]?.toUpperCase() || 'U';

  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCollections(data || []);
    } catch (e) {
      console.error('Error loading collections:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screenContainer, { backgroundColor: 'transparent' }]}>
      <View style={[styles.screenHeader, { backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <TouchableOpacity onPress={onShowProfile}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.homeProfileAvatar} />
            ) : (
              <View style={[styles.homeProfileAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.homeProfileInitials}>{initials}</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={{flex: 1}}>
            <Text style={[styles.brandText, { color: colors.text }]}>Perfume AI</Text>
          </View>
        </View>
      </View>
        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]} 
          showsVerticalScrollIndicator={false}
        >
        {/* Header Promocional */}
        <LinearGradient
          colors={darkMode ? ['#4C1D95', '#1E1B4B'] : ['#8B5CF6', '#4C1D95']}
          style={styles.promoCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={{ flex: 1, zIndex: 1 }}>
            <Text style={styles.promoTitle}>Descubre tu fragancia</Text>
            <Text style={styles.promoSubtitle}>Analiza perfumes con IA y construye tu colección digital.</Text>
            <TouchableOpacity style={{marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20}}>
              <Text style={{color: '#FFF', fontWeight: '600', fontSize: 12}}>Probar ahora</Text>
            </TouchableOpacity>
          </View>
          <MaterialCommunityIcons name="star-four-points-outline" size={80} color="rgba(255,255,255,0.15)" style={{position: 'absolute', right: -10, bottom: -10}} />
        </LinearGradient>
        
        {/* Estadísticas Rápidas */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{collections.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Perfumes</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{collections.filter(c => c.ai_data?.user_review?.rating === 5).length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Favoritos</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{new Set(collections.map(c => c.ai_data?.brand)).size}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Marcas</Text>
          </View>
        </View>

        {/* Recientes */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recientes</Text>
          <TouchableOpacity onPress={() => setCurrentTab('search')}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Ver todo</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : collections.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {collections.slice(0, 5).map((item, index) => (
              <TouchableOpacity 
                key={index} 
                style={[styles.miniCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => openPerfumeDetail(item)}
              >
                <Image source={{ uri: item.photo_url }} style={styles.miniCardImage} />
                <View style={styles.miniCardInfo}>
                  <Text style={[styles.miniCardTitle, { color: colors.text }]} numberOfLines={1}>{item.ai_data?.name}</Text>
                  <Text style={[styles.miniCardSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{item.ai_data?.brand}</Text>
                  
                  {item.ai_data?.user_review?.rating && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <Feather name="star" size={10} color="#FBBF24" fill="#FBBF24" />
                      <Text style={{ fontSize: 10, color: colors.textSecondary, marginLeft: 2 }}>{item.ai_data.user_review.rating}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.emptyStateSimple, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary }}>Aún no has escaneado perfumes.</Text>
            <TouchableOpacity onPress={() => setCurrentTab('scan')} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.primary, fontWeight: 'bold' }}>¡Escanear ahora!</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Categorías / Accesos Rápidos (Visual) */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Explorar por Ocasión</Text>
        <View style={styles.categoriesGrid}>
          {['Día', 'Noche', 'Citas', 'Oficina'].map((cat, i) => (
            <TouchableOpacity key={i} style={[styles.categoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather 
                name={cat === 'Día' ? 'sun' : cat === 'Noche' ? 'moon' : cat === 'Citas' ? 'heart' : 'briefcase'} 
                size={20} 
                color={colors.primary} 
              />
              <Text style={[styles.categoryText, { color: colors.text }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Scent of the Day / AI Consult */}
        <TouchableOpacity 
          style={{ marginTop: 24, borderRadius: 24, overflow: 'hidden' }}
          onPress={() => onExpertConsult(collections)}
        >
          <LinearGradient
            colors={['#A855F7', '#7C3AED']}
            style={{ padding: 20, flexDirection: 'row', alignItems: 'center' }}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <MaterialCommunityIcons name="star-face" size={20} color="#FBBF24" />
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 18 }}>Scent of the Day</Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Deja que la IA elija tu fragancia ideal para hoy según tu colección.</Text>
            </View>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 16 }}>
              <MaterialCommunityIcons name="auto-fix" size={28} color="#FFF" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

function AIExpertModal({ visible, onClose, perfumes, colors, darkMode, isPremium, userId, initialQuestion }: any) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<any>(null);

  useEffect(() => {
    if (visible) {
      if (initialQuestion) {
        setQuestion(initialQuestion);
        if (isPremium) {
           // Auto-trigger if it's a pre-filled expert request like "Scent of the Day"
           setTimeout(() => handleConsult(initialQuestion), 500);
        }
      } else {
        setQuestion('');
        setAdvice(null);
      }
    }
  }, [visible, initialQuestion]);

  const handleConsult = async (qOverride?: string) => {
    const q = qOverride || question;
    if (!q || !isPremium) return;
    setLoading(true);
    try {
      const isCollectionGroup = Array.isArray(perfumes) && perfumes.length > 1;
      
      const { data, error } = await supabase.functions.invoke('consult-perfume', {
        body: { 
          user_id: userId,
          perfume_data: !isCollectionGroup && Array.isArray(perfumes) ? perfumes[0].ai_data : (!Array.isArray(perfumes) ? perfumes?.ai_data : undefined),
          collection_data: isCollectionGroup ? perfumes : undefined,
          question: q,
          user_context: isCollectionGroup ? "Consulta sobre toda mi colección de perfumes" : "Consulta desde mi colección personal"
        }
      });
      if (error) throw error;
      setAdvice(data);
    } catch (err: any) {
      setAdvice({ status: 'error', error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const isCollection = Array.isArray(perfumes) && perfumes.length > 1;

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#0F0A1A', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, minHeight: '70%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
               <MaterialCommunityIcons name="auto-fix" size={24} color="#A855F7" />
               <Text style={{ color: '#FFF', fontSize: 20, fontWeight: 'bold' }}>Sommelier AI</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <Feather name="x" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {perfumes && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, backgroundColor: 'rgba(168, 85, 247, 0.1)', padding: 12, borderRadius: 16 }}>
               {isCollection ? (
                 <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="library-shelves" size={32} color="#A855F7" style={{ marginRight: 12 }} />
                    <View>
                       <Text style={{ color: '#A855F7', fontSize: 11, fontWeight: '800' }}>MI COLECCIÓN</Text>
                       <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>Analizando {perfumes.length} fragancias</Text>
                    </View>
                 </View>
               ) : (
                 <>
                   {perfumes.photo_url && <Image source={{ uri: perfumes.photo_url }} style={{ width: 50, height: 50, borderRadius: 8, marginRight: 12 }} />}
                   <View>
                      <Text style={{ color: '#A855F7', fontSize: 11, fontWeight: '800' }}>{(perfumes.ai_data?.brand || perfumes[0]?.ai_data?.brand)?.toUpperCase()}</Text>
                      <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>{perfumes.ai_data?.name || perfumes[0]?.ai_data?.name}</Text>
                   </View>
                 </>
               )}
            </View>
          )}

          {advice ? (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
               {advice.status === 'error' ? (
                 <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: 16, borderLeftWidth: 4, borderLeftColor: '#EF4444' }}>
                    <Text style={{ color: '#FCA5A5', fontWeight: 'bold', marginBottom: 4 }}>Error del Experto</Text>
                    <Text style={{ color: '#FFF', fontSize: 14 }}>{advice.error}</Text>
                 </View>
               ) : (
                 <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 20, borderRadius: 20, borderLeftWidth: 4, borderLeftColor: '#A855F7' }}>
                    <Text style={{ color: '#E5E7EB', fontSize: 16, lineHeight: 26 }}>{advice.answer}</Text>
                 </View>
               )}
               <TouchableOpacity 
                 onPress={() => { setAdvice(null); setQuestion(''); }} 
                 style={{ marginTop: 24, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#A855F7', alignItems: 'center' }}
               >
                  <Text style={{ color: '#A855F7', fontWeight: 'bold' }}>Hacer otra pregunta</Text>
               </TouchableOpacity>
               <View style={{ height: 40 }} />
            </ScrollView>
          ) : !isPremium ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
               <LinearGradient 
                 colors={['#A855F7', '#7C3AED']} 
                 style={{ padding: 24, borderRadius: 24, width: '100%', alignItems: 'center' }}
               >
                  <MaterialCommunityIcons name="crown" size={48} color="#FBBF24" style={{ marginBottom: 16 }} />
                  <Text style={{ color: '#FFF', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>Sommelier PRO</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
                    Desbloquea el poder absoluto de la IA para elegir el mejor perfume de tu colección y recibir consejos de experto.
                  </Text>
                  
                  <View style={{ width: '100%', gap: 12, marginBottom: 24 }}>
                    {[
                      'Consultas ilimitadas para tu colección',
                      'Consejos de layering (mezcla de perfumes)',
                      'Recomendaciones basadas en el clima real',
                      'Identificación de "dupes" y fragancias similares'
                    ].map((feature, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="check-circle" size={16} color="#4ADE80" />
                        <Text style={{ color: '#FFF', fontSize: 13 }}>{feature}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity style={{ backgroundColor: '#FFF', width: '100%', padding: 18, borderRadius: 16, alignItems: 'center' }}>
                     <Text style={{ color: '#7C3AED', fontWeight: 'bold', fontSize: 16 }}>Actualizar a PRO</Text>
                  </TouchableOpacity>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 12 }}>Sólo $4.99 / mes</Text>
               </LinearGradient>
            </View>
          ) : (
            <View>
              <Text style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 12 }}>{isCollection ? "¿Qué quieres saber sobre tu colección?" : "¿En qué te puedo ayudar hoy con esta fragancia?"}</Text>
              <TextInput
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#FFF', borderRadius: 16, padding: 16, minHeight: 120, textAlignVertical: 'top', marginBottom: 24, fontSize: 15 }}
                placeholder={isCollection ? "Ej: ¿Cuál es mejor para una cita romántica hoy? o ¿Cuál rinde mejor en calor?" : "Ej: ¿Es buena para ir a la oficina? ¿O para una fiesta de calor?"}
                placeholderTextColor="rgba(255,255,255,0.4)"
                multiline
                value={question}
                onChangeText={setQuestion}
              />
              <TouchableOpacity 
                style={{ backgroundColor: '#A855F7', padding: 18, borderRadius: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}
                onPress={() => handleConsult()}
                disabled={loading || !question}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>Consultar Sommelier</Text>
                    <MaterialCommunityIcons name="auto-fix" size={20} color="#FFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SearchCollectionScreen({ colors, darkMode, session, openPerfumeDetail, onExpertConsult, wishlist, onToggleWishlist }: any) {
  const [searchQuery, setSearchQuery] = useState('');
  const [collections, setCollections] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'mine' | 'wishlist' | 'forum'>('mine');
  const [loading, setLoading] = useState(false);

  // Estados para filtro de reseñas
  const [reviewSearch, setReviewSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');

  useEffect(() => {
    loadCollections();
    loadReviews();
  }, []);

  const loadCollections = async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Log para depuración
      console.log("Perfumes cargados:", data?.length);
      data?.forEach(d => console.log(`- ${d.ai_data?.name} (ID: ${d.id})`));

      // Deduplicación por si hay basura en la DB
      const uniqueData = data?.filter((item, index, self) =>
        index === self.findIndex((t) => (
          t.id === item.id
        ))
      );

      setCollections(uniqueData || []);
    } catch (e) {
      console.error('Error loading collections:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async () => {
    setLoading(true);
    try {
      console.log("DEBUG: Iniciando carga de reseñas...");
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error("Error de Supabase al cargar reseñas:", error.message);
        throw error;
      }

      console.log("DEBUG: Filas crudas recibidas:", data?.length);

      const validReviews = data?.filter(item => {
        let ai = item.ai_data;
        // Defensa ante datos que puedan venir como string JSON
        if (typeof ai === 'string') {
          try { ai = JSON.parse(ai); } catch (e) { return false; }
        }
        const hasReview = ai && ai.user_review;
        if (hasReview) {
          console.log(`- Reseña válida encontrada para: ${ai.name}`);
        }
        return hasReview;
      }) || [];

      setReviews(validReviews);
      console.log("DEBUG: Reseñas filtradas finales:", validReviews.length);

    } catch (e: any) {
      console.error('Error en loadReviews:', e.message);
      // Fallback a mock si no hay datos o falla RLS
      if (reviews.length === 0) {
         setReviews([
           { id: 'm1', ai_data: { brand: 'Demo', name: 'Perfume', user_review: { comment: 'No pudimos conectar con el foro.', rating: 5, date: new Date().toISOString() }, user_name: 'Sistema' } }
         ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLike = (id: string) => {
    // Feedback visual inmediato (local)
    // Para persistencia real necesitaríamos una tabla 'social_likes'
    Alert.alert("Me gusta", "¡Te gusta esta reseña!");
  };

  const handleRepost = async (item: any) => {
    Alert.alert("Repost / Guardar", `¿Quieres guardar "${item.ai_data.name}" en tu colección?`, [
       { text: "Cancelar", style: "cancel" },
       { text: "Guardar", onPress: async () => {
          // Copiar a mi colección
          if(!session?.user?.id) return;
          
          const newItem = {
             user_id: session.user.id,
             ai_data: { 
               ...item.ai_data, 
               user_review: null // No copiamos la reseña del otro, solo el perfume
             }, 
             created_at: new Date().toISOString()
          };

          const { error } = await supabase.from('user_collections').insert(newItem);
          if(error) Alert.alert("Error", error.message);
          else {
             Alert.alert("Guardado", "Perfume agregado a tu colección exitosamente.");
             loadCollections(); // Recargar mi colección
          }
       }}
    ]);
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Eliminar perfume",
      `¿Estás seguro que deseas eliminar "${name}" de tu colección?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Eliminar", 
          style: "destructive", 
          onPress: async () => {
             console.log("Intentando eliminar ID:", id);
             
             // 1. Actualización Optimista (Borrar de la pantalla inmediatamente)
             const previousCollections = [...collections];
             setCollections(prev => prev.filter(c => c.id !== id));
             
             // 2. Borrar de Supabase (Base de datos real) con count check
             const { error, count } = await supabase
               .from('user_collections')
               .delete({ count: 'exact' })
               .eq('id', id);

             if(error || count === 0) {
               console.error("Error eliminando de Supabase:", error || "No rows deleted");
               setCollections(previousCollections); // Rollback
               Alert.alert(
                 "No se pudo eliminar", 
                 error ? error.message : "No se encontró el perfume o no tienes permiso para eliminarlo (RLS de Supabase)."
               );
             } else {
               console.log("Eliminado correctamente de Supabase. Rows affected:", count);
               // Éxito real
             }
          }
        }
      ]
    );
  };

  const openReviewModal = (item: any) => {
    setSelectedItem(item);
    setRating(item.ai_data?.user_review?.rating || 0);
    setReviewComment(item.ai_data?.user_review?.comment || '');
    setModalVisible(true);
  };

  const handleSaveReview = async () => {
    if(!selectedItem) return;
    // Guardamos la reseña dentro de ai_data para no alterar esquema SQL
    const updatedAiData = {
        ...selectedItem.ai_data,
        user_name: session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Usuario', // Guardar nombre del autor
        user_review: {
            rating,
            comment: reviewComment,
            date: new Date().toISOString()
        }
    };

    console.log("Guardando reseña en ID:", selectedItem.id);

    const { error, count } = await supabase
       .from('user_collections')
       .update({ ai_data: updatedAiData }, { count: 'exact' })
       .eq('id', selectedItem.id);

     if (!error) {
       console.log("DEBUG: Update exitoso. Filas afectadas:", count);
       if (count === 0) {
         Alert.alert("Aviso", "No se encontró el perfume para actualizar o no tienes permisos (RLS).");
       } else {
         loadCollections();
         loadReviews();
         setModalVisible(false);
         Alert.alert("¡Hecho!", "Tu reseña se ha guardado correctamente.");
       }
     } else {
        console.error("DEBUG: Error al guardar:", error.message);
        Alert.alert("Error", "No se pudo conectar con la base de datos.");
     }
  };

  const filteredCollections = collections.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const data = item.ai_data || {};
    
    // Búsqueda profunda: marca, nombre, clima (seasons), ocasiones, notas
    const brand = data.brand?.toLowerCase() || '';
    const name = data.name?.toLowerCase() || '';
    const seasons = Array.isArray(data.usage?.season) ? data.usage.season.join(' ').toLowerCase() : '';
    const occasions = Array.isArray(data.usage?.occasions) ? data.usage.occasions.join(' ').toLowerCase() : '';
    const notes = Array.isArray(data.notes) ? data.notes.join(' ').toLowerCase() : (
       // Fallback for nested notes structure
       (data.notes?.top?.join(' ') || '') + ' ' + 
       (data.notes?.heart?.join(' ') || '') + ' ' + 
       (data.notes?.base?.join(' ') || '')
    ).toLowerCase();
    
    // Mapeo inteligente de estaciones (Español -> Inglés)
    const seasonMap: Record<string, string> = {
      'verano': 'summer',
      'invierno': 'winter',
      'primavera': 'spring',
      'otoño': 'fall autumn' // "fall" OR "autumn"
    };

    const mappedTerm = seasonMap[query] || ''; // Si busco "verano", mappedTerm = "summer"

    // Si la búsqueda es una estación, buscamos tanto en español como en inglés
    const matchSeason = seasons.includes(query) || (mappedTerm && seasons.includes(mappedTerm));

    return brand.includes(query) || 
           name.includes(query) || 
           matchSeason || 
           occasions.includes(query) ||
           notes.includes(query);
  });

  const filteredWishlist = (wishlist || []).filter((item: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return item.perfume_name?.toLowerCase().includes(query) || 
           item.brand?.toLowerCase().includes(query);
  });



  const uniqueSeasons = Array.from(new Set(collections.flatMap(c => c.ai_data?.seasons || [])));

  return (
    <View style={[styles.screenContainer, { backgroundColor: 'transparent' }]}>
      <View style={[styles.screenHeader, { backgroundColor: 'transparent', borderBottomWidth: 0 }]}>
        <Text style={[styles.brandText, { color: colors.text }]}>Colección y Reseñas</Text>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginTop: 16, marginBottom: 20, gap: 12, alignItems: 'center' }}>
        <TouchableOpacity 
          style={{ 
            paddingVertical: 8, 
            paddingHorizontal: 20, 
            borderRadius: 20, 
            backgroundColor: activeTab === 'mine' ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
            borderWidth: activeTab === 'mine' ? 1.5 : 0,
            borderColor: colors.primary,
          }}
          onPress={() => setActiveTab('mine')}
        >
          <Text style={{ color: activeTab === 'mine' ? colors.primary : '#6B7280', fontWeight: '700', fontSize: 15 }}>Mi Colección</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={{ 
            paddingVertical: 8, 
            paddingHorizontal: 20, 
            borderRadius: 20, 
            backgroundColor: activeTab === 'wishlist' ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
            borderWidth: activeTab === 'wishlist' ? 1.5 : 0,
            borderColor: colors.primary,
          }}
          onPress={() => setActiveTab('wishlist')}
        >
          <Text style={{ color: activeTab === 'wishlist' ? colors.primary : '#6B7280', fontWeight: '700', fontSize: 15 }}>Wishlist</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={{ 
            paddingVertical: 8, 
            paddingHorizontal: 20, 
            borderRadius: 20, 
            backgroundColor: activeTab === 'forum' ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
            borderWidth: activeTab === 'forum' ? 1.5 : 0,
            borderColor: colors.primary,
          }}
          onPress={() => {
            setActiveTab('forum');
            loadReviews();
          }}
        >
          <Text style={{ color: activeTab === 'forum' ? colors.primary : '#6B7280', fontWeight: '700', fontSize: 15 }}>Foro</Text>
        </TouchableOpacity>
      </View>

      {(activeTab === 'mine' || activeTab === 'wishlist') ? (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.searchBarContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Feather name="search" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Buscar en tu colección..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          
          {/* Quick Filters (Climas) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, paddingLeft: 16 }}>
             {['Invierno', 'Verano', 'Primavera', 'Otoño', 'Noche', 'Día'].map((filter) => (
               <TouchableOpacity 
                 key={filter} 
                 style={{ 
                   marginRight: 8, 
                   paddingHorizontal: 12, 
                   paddingVertical: 6, 
                   borderRadius: 20, 
                   backgroundColor: searchQuery.includes(filter) ? colors.primary : colors.surface,
                   borderWidth: 1,
                   borderColor: searchQuery.includes(filter) ? colors.primary : colors.border
                 }}
                 onPress={() => setSearchQuery(filter)}
               >
                 <Text style={{ 
                   color: searchQuery.includes(filter) ? '#FFF' : colors.textSecondary,
                   fontSize: 13,
                   fontWeight: '600'
                 }}>{filter}</Text>
               </TouchableOpacity>
             ))}
          </ScrollView>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{marginTop: 40}} />
          ) : filteredCollections.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="search" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{searchQuery ? 'No se encontraron resultados' : 'Tu colección está vacía'}</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{searchQuery ? 'Intenta con otro término' : 'Escanea perfumes para agregarlos'}</Text>
            </View>
          ) : (
            <>
              {/* Botón Sommelier Global */}
              <TouchableOpacity 
                style={{ 
                  marginHorizontal: 16, 
                  marginBottom: 20, 
                  borderRadius: 20, 
                  overflow: 'hidden',
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 5
                }}
                onPress={() => onExpertConsult(collections)}
              >
                <LinearGradient
                  colors={['#A855F7', '#7C3AED']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>Consultar Sommelier AI</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 }}>Elige el mejor perfume para hoy entre tus {collections.length} opciones.</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 10, borderRadius: 15 }}>
                     <MaterialCommunityIcons name="auto-fix" size={28} color="#FFF" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.collectionGrid}>
                {activeTab === 'mine' ? filteredCollections.map((item, index) => (
                  <View key={index} style={[styles.collectionCard, { backgroundColor: colors.surface, borderColor: colors.border, position: 'relative', overflow: 'hidden' }]}>
                    <TouchableOpacity onPress={() => openPerfumeDetail(item)} style={{ flex: 1 }}>
                       {item.photo_url && (
                         <View style={{ position: 'relative' }}>
                           <Image source={{ uri: item.photo_url }} style={styles.collectionCardImage} />
                           {/* Badge de Rating si tiene */}
                           {item.ai_data?.user_review?.rating > 0 && (
                             <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
                               <Feather name="star" size={10} color="#FBBF24" fill="#FBBF24" />
                               <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold', marginLeft: 2 }}>{item.ai_data.user_review.rating}</Text>
                             </View>
                           )}
                         </View>
                       )}
                       <View style={styles.collectionCardInfo}>
                         <Text style={[styles.collectionCardBrand, { color: colors.textSecondary, fontSize: 10 }]}>{item.ai_data?.brand?.toUpperCase() || 'MARCA'}</Text>
                         <Text style={[styles.collectionCardName, { color: colors.text, fontSize: 14, fontWeight: '600' }]} numberOfLines={1}>{item.ai_data?.name || 'Nombre'}</Text>
                         
                         <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {item.ai_data?.usage?.season?.slice(0, 2).map((s: string, i: number) => (
                              <View key={i} style={{ backgroundColor: colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 8 }}>{s}</Text>
                              </View>
                            ))}
                         </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                )) : (filteredWishlist || []).map((item: any, index: number) => (
                  <View key={index} style={[styles.collectionCard, { backgroundColor: colors.surface, borderColor: colors.border, position: 'relative', overflow: 'hidden' }]}>
                    <TouchableOpacity onPress={() => openPerfumeDetail({ ...item, ai_data: item.ai_data })} style={{ flex: 1 }}>
                       {item.photo_url && (
                         <View style={{ position: 'relative' }}>
                           <Image source={{ uri: item.photo_url }} style={styles.collectionCardImage} />
                         </View>
                       )}
                       <View style={styles.collectionCardInfo}>
                         <Text style={[styles.collectionCardBrand, { color: colors.textSecondary, fontSize: 10 }]}>{item.brand?.toUpperCase() || 'MARCA'}</Text>
                         <Text style={[styles.collectionCardName, { color: colors.text, fontSize: 14, fontWeight: '600' }]} numberOfLines={1}>{item.perfume_name}</Text>
                         
                         <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Feather name="heart" size={12} color="#EF4444" fill="#EF4444" />
                            <Text style={{ color: '#EF4444', fontSize: 10, fontWeight: 'bold' }}>WISHLIST</Text>
                         </View>
                       </View>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      onPress={() => onToggleWishlist(item)}
                      style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: 6, borderRadius: 12 }}
                    >
                       <Feather name="trash-2" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {activeTab === 'wishlist' && filteredWishlist.length === 0 && (
                <View style={{ width: '100%', padding: 40, alignItems: 'center' }}>
                  <Feather name="heart" size={48} color={colors.textSecondary} style={{ marginBottom: 16, opacity: 0.3 }} />
                  <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Tu lista de deseos está vacía. ¡Agrega perfumes desde el buscador o al escanear!</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadReviews} tintColor={colors.primary} />
          }
        >
          <View style={[styles.searchBarContainer, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 16 }]}>
            <Feather name="search" size={20} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Buscar reseñas..."
              placeholderTextColor={colors.textSecondary}
              value={reviewSearch}
              onChangeText={setReviewSearch}
            />
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 16 }]}>Reseñas de la Comunidad</Text>
          
          {reviews.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center', opacity: 0.6 }}>
               <Feather name="message-square" size={48} color={colors.textSecondary} style={{ marginBottom: 16 }} />
               <Text style={{ color: colors.text, textAlign: 'center', fontSize: 16, fontWeight: '600' }}>Aún no hay reseñas</Text>
               <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 20 }}>Abre un perfume de tu colección y añade tu reseña para compartirla con la comunidad.</Text>
               <TouchableOpacity onPress={loadReviews} style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 }}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Actualizar Foro</Text>
               </TouchableOpacity>
            </View>
          ) : (
            reviews.map((item) => {
            const data = item.ai_data;
            const review = data?.user_review;
            if (!review) return null; // Skip if no review
            
            const isOwner = item.user_id === session?.user?.id;
            const userName = item.user_id === session?.user?.id ? 'Tú' : (data.user_name || 'Usuario'); // Fallback name

            return (
            <View key={item.id} style={[styles.reviewCard, { 
              backgroundColor: colors.surface, 
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
            }]}>
              {/* Reddit Header */}
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8, justifyContent: 'space-between'}}>
                 <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <View style={[styles.reviewAvatar, { backgroundColor: colors.primary, width: 24, height: 24, borderRadius: 12, marginRight: 8 }]}>
                        <Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>{userName[0]}</Text>
                    </View>
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13, marginRight: 6 }}>{userName}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>• {new Date(review.date || item.created_at).toLocaleDateString()}</Text>
                 </View>
                 
                 {/* Opción de Editar si soy el dueño */}
                 {isOwner && (
                   <TouchableOpacity onPress={() => openReviewModal(item)} style={{padding: 4}}>
                     <Feather name="edit-2" size={14} color={colors.primary} />
                   </TouchableOpacity>
                 )}
              </View>

              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 4 }}>
                 {data.brand} {data.name}
              </Text>

              <Text style={[styles.reviewComment, { color: colors.textSecondary, fontSize: 14, lineHeight: 20 }]}>
                 {review.comment}
              </Text>

              {/* Actions Bar */}
              <View style={{flexDirection: 'row', marginTop: 12, gap: 20}}>
                 <TouchableOpacity onPress={() => handleLike(item.id)} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4}}>
                    <Feather name="heart" size={16} color={colors.textSecondary} />
                    <Text style={{color: colors.textSecondary, marginHorizontal: 6, fontSize: 12}}>Like</Text>
                 </TouchableOpacity>
                 
                 <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                    <Feather name="message-square" size={16} color={colors.textSecondary} />
                    <Text style={{color: colors.textSecondary, fontSize: 12, fontWeight: '600'}}>Comentar</Text>
                 </View>

                 {/* Botón Repost / Guardar */}
                 <TouchableOpacity onPress={() => handleRepost(item)} style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                    <Feather name="repeat" size={16} color={colors.primary} />
                    <Text style={{color: colors.primary, fontSize: 12, fontWeight: '600'}}>Repost (Guardar)</Text>
                 </TouchableOpacity>
              </View>
            </View>
          );
          }))}
        </ScrollView>
      )}

      {/* Modal de Calificación */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
        >
           <View style={{ width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 20 }}>Calificar {selectedItem?.ai_data?.name}</Text>
              
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setRating(star)}>
                    <Feather name="star" size={32} color={star <= rating ? "#FBBF24" : colors.textSecondary} fill={star <= rating ? "#FBBF24" : "transparent"} />
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput 
                style={{ backgroundColor: colors.background, color: colors.text, padding: 16, borderRadius: 12, height: 100, textAlignVertical: 'top', marginBottom: 20 }}
                placeholder="Escribe tu reseña..."
                placeholderTextColor={colors.textSecondary}
                multiline
                value={reviewComment}
                onChangeText={setReviewComment}
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: colors.background }}>
                   <Text style={{ color: colors.text, fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveReview} style={{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: colors.primary }}>
                   <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Guardar</Text>
                </TouchableOpacity>
              </View>
           </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

function SetupProfileScreen({ onFinish, loading, colors, darkMode, currentName }: any) {
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Hombre' | 'Mujer' | 'Otro' | null>(null);
  const [fullName, setFullName] = useState(currentName || '');
  const [image, setImage] = useState<string | null>(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  return (
    <LinearGradient colors={darkMode ? ['#111827', '#1E1B4B'] : ['#FDFCFE', '#F3E8FF']} style={styles.authContainer}>
      <SafeAreaView style={{flex: 1}}>
        <ScrollView contentContainerStyle={styles.authContent}>
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.surface }]}>
              <Feather name="user-plus" size={40} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.authTitle, { color: colors.text, marginTop: 10 }]}>Cerca de finalizar</Text>
          <Text style={[styles.authSubtitle, { color: colors.textSecondary }]}>Personalicemos tu perfil para una mejor experiencia.</Text>

          {/* Profile Picture Picker */}
          <TouchableOpacity onPress={pickImage} style={{ alignSelf: 'center', marginVertical: 20 }}>
            {image ? (
              <Image source={{ uri: image }} style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: colors.primary }} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="camera" size={30} color={colors.textSecondary} />
              </View>
            )}
            <View style={[styles.editBadge, { backgroundColor: colors.primary }]}>
              <Feather name="plus" size={14} color="#FFF" />
            </View>
          </TouchableOpacity>

          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Nombre completo</Text>
            <View style={[styles.inputField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="user" size={20} color={colors.textSecondary} />
              <TextInput
                style={[styles.textInput, { color: colors.text }]}
                onChangeText={setFullName}
                value={fullName}
                placeholder="Ej. Juan Pérez"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Tu edad</Text>
            <View style={[styles.inputField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="calendar" size={20} color={colors.textSecondary} />
              <TextInput
                style={[styles.textInput, { color: colors.text }]}
                onChangeText={setAge}
                value={age}
                placeholder="Ej. 25"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Género</Text>
            <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
              {['Hombre', 'Mujer', 'Otro'].map((g: any) => (
                <TouchableOpacity 
                  key={g}
                  onPress={() => setGender(g)}
                  style={[
                    styles.genderBtn, 
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    gender === g && { backgroundColor: colors.primary, borderColor: colors.primary }
                  ]}
                >
                  <Text style={[styles.genderBtnText, { color: colors.text }, gender === g && { color: '#FFF' }]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{marginTop: 40}}>
            <StyledButton 
              title="Continuar" 
              colors={colors}
              onPress={() => {
                if (!age || !gender || !fullName) {
                  Alert.alert("Campos requeridos", "Por favor completa tu nombre, edad y género.");
                  return;
                }
                onFinish(age, gender, fullName, image);
              }}
              loading={loading}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function ProfileScreen({ session, onLogout, colors, darkMode, onToggleDarkMode, onBack, userProfile, onUpgrade }: any) {
  const [notifications, setNotifications] = useState(true);
  const [faceId, setFaceId] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const n = await AsyncStorage.getItem('notifications');
      const f = await AsyncStorage.getItem('faceId');
      if (n !== null) setNotifications(n === 'true');
      if (f !== null) setFaceId(f === 'true');
    } catch (e) {
      console.error(e);
    }
  };

  const toggleNotifications = async (val: boolean) => {
    setNotifications(val);
    await AsyncStorage.setItem('notifications', val ? 'true' : 'false');
  };

  const toggleFaceId = async (val: boolean) => {
    setFaceId(val);
    await AsyncStorage.setItem('faceId', val ? 'true' : 'false');
  };
  
  const user = session?.user;
  const email = user?.email || '';
  const fullName = user?.user_metadata?.full_name || 'Usuario';
  const age = user?.user_metadata?.age || '';
  const gender = user?.user_metadata?.gender || '';
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2) || email[0].toUpperCase();

  const handleUpdateName = async () => {
    Alert.prompt(
      "Cambiar Nombre",
      "Introduce tu nuevo nombre completo",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Guardar", 
          onPress: async (newName: string | undefined) => {
            if (!newName) return;
            setLoading(true);
            const { error } = await supabase.auth.updateUser({ data: { full_name: newName } });
            setLoading(false);
            if (error) Alert.alert("Error", error.message);
            else Alert.alert("Éxito", "Nombre actualizado.");
          }
        }
      ],
      "plain-text",
      fullName
    );
  };

  const handleChangePassword = async () => {
    Alert.prompt(
      "Cambiar Contraseña",
      "Introduce tu nueva contraseña",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Actualizar", 
          onPress: async (newPass: string | undefined) => {
            if (!newPass || newPass.length < 6) {
              Alert.alert("Error", "La contraseña debe tener al menos 6 caracteres.");
              return;
            }
            setLoading(true);
            const { error } = await supabase.auth.updateUser({ password: newPass });
            setLoading(false);
            if (error) Alert.alert("Error", error.message);
            else Alert.alert("Éxito", "Contraseña actualizada.");
          }
        }
      ],
      "secure-text"
    );
  };

  const SettingItem = ({ icon, label, value, onToggle, isLast, onPress }: any) => (
    <TouchableOpacity 
      disabled={!!onToggle || !onPress} 
      onPress={onPress}
      style={[styles.settingItem, { borderBottomColor: colors.border }, isLast ? { borderBottomWidth: 0 } : {}]}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: colors.background }]}>
          <Feather name={icon} size={20} color={colors.textSecondary} />
        </View>
        <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
      </View>
      {onToggle ? (
        <TouchableOpacity 
          onPress={() => onToggle(!value)}
          style={[styles.switch, value ? styles.switchOn : styles.switchOff, { backgroundColor: value ? colors.primary : colors.border }]}
        >
          <View style={[styles.switchHandle, value ? styles.handleOn : styles.handleOff, { backgroundColor: '#FFF' }]} />
        </TouchableOpacity>
      ) : (
        <Feather name="chevron-right" size={20} color={colors.textSecondary} />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.screenContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.profileHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 50 }} />
            ) : (
              <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.profileName, { color: colors.text }]}>{fullName}</Text>
            {userProfile?.subscription_status === 'pro' && (
              <View style={{ backgroundColor: '#FBBF24', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: '#000', fontSize: 10, fontWeight: '900' }}>PRO</Text>
              </View>
            )}
          </View>
          <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{email}</Text>
        </View>

      <ScrollView 
        style={styles.settingsScroll} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={{paddingVertical: 24}}>
          <Text style={[styles.sectionHeaderInner, { color: colors.textSecondary }]}>DATOS PERSONALES</Text>
          <View style={[styles.settingsGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingItem icon="user" label="Nombre Completo" onPress={handleUpdateName} />
            <SettingItem icon="lock" label="Cambiar Contraseña" onPress={handleChangePassword} />
            <SettingItem icon="briefcase" label={`Edad: ${age || '-'}`} />
            <SettingItem icon="users" label={`Sexo: ${gender || '-'}`} isLast />
          </View>

          <Text style={[styles.sectionHeaderInner, { color: colors.textSecondary }]}>PREFERENCIAS</Text>
          <View style={[styles.settingsGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingItem icon="moon" label="Modo Oscuro" value={darkMode} onToggle={onToggleDarkMode} />
            <SettingItem icon="bell" label="Notificaciones" value={notifications} onToggle={toggleNotifications} />
            <SettingItem icon="shield" label="Seguridad FaceID" value={faceId} onToggle={toggleFaceId} isLast />
          </View>

          <Text style={[styles.sectionHeaderInner, { color: colors.textSecondary }]}>MEMBRESÍA</Text>
          <View style={[styles.settingsGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
             <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                   <Text style={{ color: colors.text, fontWeight: 'bold' }}>Plan Actual</Text>
                   <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{userProfile?.subscription_status === 'pro' ? 'Premium (Ilimitado)' : 'Gratuito (Limitado)'}</Text>
                </View>
                {userProfile?.subscription_status !== 'pro' && (
                  <TouchableOpacity 
                    onPress={onUpgrade}
                    style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}
                  >
                     <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>Mejorar</Text>
                  </TouchableOpacity>
                )}
             </View>
          </View>

          <Text style={[styles.sectionHeaderInner, { color: colors.textSecondary }]}>SOPORTE</Text>
          <View style={[styles.settingsGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingItem 
              icon="help-circle" 
              label="Centro de Ayuda" 
              onPress={() => setShowHelp(true)}
            />
            <SettingItem 
              icon="info" 
              label="Acerca de Perfume AI" 
              isLast 
              onPress={() => setShowAbout(true)}
            />
          </View>

          <TouchableOpacity onPress={onLogout} style={[styles.logoutBtnFull, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.logoutBtnText, { color: colors.error }]}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Help Modal */}
      <Modal visible={showHelp} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Centro de Ayuda</Text>
              <TouchableOpacity onPress={() => setShowHelp(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{padding: 20}}>
              <Text style={[styles.helpText, { color: colors.text }]}>
                ¿Cómo funciona el scanner?{"\n"}
                Toma una foto nítida del perfume y nuestra IA se encargará de identificarlo.{"\n\n"}
                ¿Puedo subir fotos de mi galería?{"\n"}
                Sí, selecciona el ícono de galería en el scanner.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* About Modal */}
      <Modal visible={showAbout} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Acerca de</Text>
              <TouchableOpacity onPress={() => setShowAbout(false)}>
                <Feather name="x" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={{padding: 40, alignItems: 'center'}}>
              <View style={[styles.logoCircle, { backgroundColor: colors.surface, marginBottom: 20 }]}>
                 <MaterialCommunityIcons name="star-face" size={40} color={colors.primary} />
              </View>
              <Text style={[styles.aboutTitle, { color: colors.text }]}>Perfume AI Scanner</Text>
              <Text style={[styles.aboutVersion, { color: colors.textSecondary }]}>Versión 1.0.0</Text>
              <Text style={[styles.aboutDev, { color: colors.textSecondary, marginTop: 20 }]}>Desarrollado con ❤️ para amantes de las fragancias.</Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AuthScreen({ colors, darkMode }: any) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);

  async function handleAuth() {
    if (isRegistering) {
      if (password !== confirmPassword) {
        Alert.alert('Error', 'Las contraseñas no coinciden');
        return;
      }
      if (!agreed) {
        Alert.alert('Error', 'Debes aceptar los Términos y Condiciones');
        return;
      }
      setLoading(true);
      const { error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: { data: { full_name: fullName } }
      });
      if (error) Alert.alert('Error', error.message);
      else Alert.alert('Éxito', "Revisa tu email para confirmar.");
      setLoading(false);
    } else {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) Alert.alert('Error', error.message);
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={darkMode ? ['#111827', '#1E1B4B'] : ['#FDFCFE', '#F3E8FF']} style={styles.authContainer}>
      <SafeAreaView style={{flex: 1}}>
        <ScrollView contentContainerStyle={styles.authContent} showsVerticalScrollIndicator={false}>
          {isRegistering && (
            <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.surface }]} onPress={() => setIsRegistering(false)}>
              <Feather name="arrow-left" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          )}

          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MaterialCommunityIcons name="flower-outline" size={40} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.authTitle, { color: colors.text }]}>{isRegistering ? "Crear cuenta" : "Bienvenido"}</Text>
          <Text style={[styles.authSubtitle, { color: colors.textSecondary }]}>
            {isRegistering ? "Descubre tus notas olfativas favoritas" : "Identifica y explora el mundo de las fragancias."}
          </Text>
          
          {isRegistering && (
            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Nombre completo</Text>
              <View style={[styles.inputField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Feather name="user" size={20} color={colors.textSecondary} />
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  onChangeText={setFullName}
                  value={fullName}
                  placeholder="Ej. Ana García"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            </View>
          )}

          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Correo electrónico</Text>
            <View style={[styles.inputField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="at-sign" size={20} color={colors.textSecondary} />
              <TextInput
                style={[styles.textInput, { color: colors.text }]}
                onChangeText={setEmail}
                value={email}
                placeholder="hola@ejemplo.com"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize={'none'}
              />
            </View>
          </View>

          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Contraseña</Text>
            <View style={[styles.inputField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="lock" size={20} color={colors.textSecondary} />
              <TextInput
                style={[styles.textInput, { color: colors.text }]}
                onChangeText={setPassword}
                value={password}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize={'none'}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Feather name={showPassword ? "eye" : "eye-off"} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {isRegistering && (
            <View style={styles.inputWrapper}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Confirmar contraseña</Text>
              <View style={[styles.inputField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="lock-reset" size={20} color={colors.textSecondary} />
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  onChangeText={setConfirmPassword}
                  value={confirmPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize={'none'}
                />
              </View>
            </View>
          )}

          {isRegistering ? (
            <View style={styles.termsRow}>
              <TouchableOpacity 
                style={[styles.checkbox, { borderColor: colors.border, backgroundColor: colors.surface }, agreed && [styles.checkboxChecked, { backgroundColor: colors.primary, borderColor: colors.primary }]]} 
                onPress={() => setAgreed(!agreed)}
              >
                {agreed && <Feather name="check" size={14} color="#FFF" />}
              </TouchableOpacity>
              <Text style={[styles.termsText, { color: colors.textSecondary }]}>
                Acepto los <Text style={[styles.termsLink, { color: colors.primary }]}>Términos</Text> y la <Text style={[styles.termsLink, { color: colors.primary }]}>Política de Privacidad</Text>.
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={{alignSelf: 'flex-end', marginTop: 0, marginBottom: 20}}>
              <Text style={[styles.forgotPassword, { color: colors.primary }]}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>
          )}

          <View style={styles.authButtons}>
            <StyledButton 
              title={isRegistering ? "Registrarse" : "Iniciar Sesión"} 
              onPress={handleAuth} 
              disabled={loading} 
              icon="arrow-right"
              colors={colors}
            />
            
            {!isRegistering && (
              <>
                <View style={styles.divider}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.textSecondary }]}>O CONTINÚA CON</Text>
                  <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>

                <View style={styles.socialRow}>
                  <TouchableOpacity style={[styles.socialBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={[styles.socialIconPlaceholder, { backgroundColor: colors.border }]} />
                    <Text style={[styles.socialBtnText, { color: colors.text }]}>Google</Text>
                  </TouchableOpacity>
                  <View style={{width: 16}} />
                  <TouchableOpacity style={[styles.socialBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="logo-apple" size={20} color={colors.text} />
                    <Text style={[styles.socialBtnText, { color: colors.text }]}>Apple</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>

          <View style={styles.authFooter}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              {isRegistering ? "¿Ya tienes una cuenta? " : "¿No tienes una cuenta? "}
            </Text>
            <TouchableOpacity onPress={() => setIsRegistering(!isRegistering)}>
              <Text style={[styles.footerLink, { color: colors.primary }]}>{isRegistering ? "Iniciar sesión" : "Registrarse"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function OnboardingScreen({ onFinish, colors }: any) {
  const [currentSlide, setCurrentSlide] = useState(0);
  
  const slides = [
    {
      title: "Identifica con IA",
      description: "Toma una foto de cualquier botella y descubre su marca, notas y uso recomendado al instante.",
      icon: "qrcode-scan",
    },
    {
      title: "Explora el Mundo",
      description: "Navega por una biblioteca curada de perfumes de nicho y diseñador con detalles precisos.",
      icon: "compass-outline",
    },
    {
      title: "Tu Colección",
      description: "Guarda tus fragancias favoritas y los escaneos que realices en tu propia biblioteca personal.",
      icon: "bookmark-outline",
    }
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onFinish();
    }
  };

  return (
    <LinearGradient colors={colors.darkMode ? ['#111827', '#1E1B4B'] : ['#FDFCFE', '#F3E8FF']} style={styles.authContainer}>
      <SafeAreaView style={{flex: 1, padding: 24}}>
        <View style={{flex: 1, justifyContent: 'center'}}>
          <View style={[styles.onboardingIconCircle, { backgroundColor: colors.surface, shadowColor: colors.primary }]}>
            <MaterialCommunityIcons 
              name={slides[currentSlide].icon as any} 
              size={80} 
              color={colors.primary} 
            />
          </View>
          
          <Text style={[styles.onboardingTitle, { color: colors.text }]}>{slides[currentSlide].title}</Text>
          <Text style={[styles.onboardingDescription, { color: colors.textSecondary }]}>{slides[currentSlide].description}</Text>
          
          <View style={styles.paginationRow}>
            {slides.map((_, i) => (
              <View 
                key={i} 
                style={[
                  styles.dot, 
                  { backgroundColor: colors.border },
                  currentSlide === i && [styles.dotActive, { backgroundColor: colors.primary }]
                ]} 
              />
            ))}
          </View>
        </View>

        <View style={{gap: 16}}>
          <StyledButton 
            title={currentSlide === slides.length - 1 ? "Empezar" : "Siguiente"} 
            colors={colors}
            onPress={() => {
              if (currentSlide < slides.length - 1) setCurrentSlide(currentSlide + 1);
              else onFinish();
            }}
          />
          <TouchableOpacity onPress={onFinish} style={styles.skipBtn}>
            <Text style={[styles.skipBtnText, { color: colors.textSecondary }]}>Saltar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function ScanScreen({ setLoading, setImage, setAiData, setView, userId, onClose, colors, setPhotoUrl }: any) {
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [autoCapture, setAutoCapture] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const analysisIntervalRef = useRef<any>(null);
  const lastAnalysisTimeRef = useRef<number>(0);
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (autoCapture || isAnalyzing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scanAnim.setValue(0);
    }
  }, [autoCapture, isAnalyzing]);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      processImage(result.assets[0]);
    }
  };

  const takePhoto = async () => {
    if (!permission?.granted) {
      const resp = await requestPermission();
      if (!resp.granted) return;
    }

    if (cameraRef.current) {
      try {
        const result = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          base64: true,
          skipProcessing: false,
        });
        processImage(result);
      } catch (e: any) {
        Alert.alert("Error", "No se pudo tomar la foto: " + e.message);
      }
    }
  };

  const analyzeFrame = async (base64Data: string, mimeType: string): Promise<boolean> => {
    try {
      const quickPrompt = `Analiza esta imagen. Si es un perfume (botella de perfume visible), responde SOLO: {"identified": true}. Si NO es un perfume, responde SOLO: {"identified": false}. Sin texto adicional.`;
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: quickPrompt },
                { inline_data: { mime_type: mimeType, data: base64Data } }
              ]
            }]
          })
        }
      );

      if (!response.ok) return false;
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const result = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
      return result.identified === true;
    } catch {
      return false;
    }
  };

  const startAutoCapture = () => {
    if (!autoCapture || !cameraRef.current) return;
    
    analysisIntervalRef.current = setInterval(async () => {
      const now = Date.now();
      if (now - lastAnalysisTimeRef.current < 2000) return;
      if (!cameraRef.current) return; // Validación crítica
      
      lastAnalysisTimeRef.current = now;
      setIsAnalyzing(true);
      
      try {
        if (!cameraRef.current) return; // Doble validación por si se desmontó
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.3,
          base64: true,
          skipProcessing: true,
        });
        
        if (photo?.base64) {
          const isPerfume = await analyzeFrame(photo.base64, 'image/jpeg');
          if (isPerfume) {
            clearInterval(analysisIntervalRef.current);
            setIsAnalyzing(false);
            
            // Verificamos nuevamente la integridad de la cámara antes del disparo final
            if (!cameraRef.current) return;

            // Capturar foto de alta calidad
            const highQualityPhoto = await cameraRef.current.takePictureAsync({
              quality: 0.5,
              base64: true,
              skipProcessing: false,
            });
            processImage(highQualityPhoto);
          }
        }
      } catch (e) {
        console.error("Auto-capture error:", e);
      } finally {
        setIsAnalyzing(false);
      }
    }, 3000); // Analizar cada 3 segundos
  };

  useEffect(() => {
    if (autoCapture && permission?.granted) {
      startAutoCapture();
    }
    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
    };
  }, [autoCapture, permission]);

  const processImage = async (asset: any) => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
    }
    setImage(asset.uri);
    setView('result');
    setLoading(true);

    try {
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${userId}/${Date.now()}.${ext}`;
      const base64FileData = asset.base64; 

      if (!base64FileData) throw new Error("No image data");

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('perfume_gallery')
        .upload(fileName, decode(base64FileData), {
          contentType: `image/${ext}`,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('perfume_gallery')
        .getPublicUrl(fileName);

      // Llamada directa a la API de Gemini (sin backend)
      console.log("Analizando imagen con Gemini directamente...");
      console.log("Analizando con gemini-2.0-flash...");
      
      let attempts = 0;
      let success = false;
      let ai_data;
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

      while (attempts < 3 && !success) {
        attempts++;
        console.log(`Intento de análisis ${attempts}/3...`);
        
        try {
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                generationConfig: {
                  response_mime_type: "application/json",
                  response_schema: {
                    type: "object",
                    properties: {
                      identified: { type: "boolean" },
                      reason: { type: "string" },
                      brand: { type: "string" },
                      name: { type: "string" },
                      concentration: { type: "string" },
                      olfactory_family: { type: "string" },
                      notes: {
                        type: "object",
                        properties: {
                          top: { type: "array", items: { type: "string" } },
                          heart: { type: "array", items: { type: "string" } },
                          base: { type: "array", items: { type: "string" } }
                        }
                      },
                      usage: {
                        type: "object",
                        properties: {
                          occasions: { type: "array", items: { type: "string" } },
                          season: { type: "array", items: { type: "string" } },
                          time_of_day: { type: "string" }
                        }
                      },
                      description: { type: "string" }
                    },
                    required: ["identified"]
                  }
                },
                tools: [{ google_search: {} }],
                contents: [{
                  parts: [
                    { text: `Eres un Sommelier de Perfumes de ÉLITE. Tu misión es un análisis MAGISTRAL y COMPLETO.

INSTRUCCIONES DE BÚSQUEDA Y CONOCIMIENTO:
1. IDENTIFICACIÓN: Identifica el perfume de la imagen.
2. BÚSQUEDA QUIRÚRGICA: Usa Google Search para encontrar "[MARCA] [NOMBRE] olfactory pyramid notes" en fragrantica o basenotes.
3. ESTRATEGIA HÍBRIDA (CRÍTICO): 
   - Si la búsqueda devuelve datos, úsalos. 
   - Si la búsqueda falla o devuelve "N/A", ESTÁ PROHIBIDO devolver "N/A" al usuario. En ese caso, USA TU PROPIO CONOCIMIENTO INTERNO como experto para proporcionar las notas reales del perfume.

CALIDAD DEL ANÁLISIS:
- DESCRIPCIÓN INMERSIVA: Escribe un párrafo de AL MENOS 250 caracteres detallando la evolución del aroma: cómo abre (salida), cómo evoluciona en la piel (corazón) y cómo queda al final del día (fondo). Describe sensaciones, no solo ingredientes.
- PIRÁMIDE OLFACTIVA: Rellena Salida, Corazón y Fondo sin excepción. Para perfumes famosos como Acqua di Giò, el "N/A" es un fallo inaceptable de tu parte.
- CONTEXTO: Detalla idoneidad para GYM, OCASIONES y CLIMA.

REGLAS DE ORO:
- Responde SIEMPRE en ESPAÑOL.
- Genera el JSON siguiendo el esquema estrictamente.` },
                    {
                      inline_data: {
                        mime_type: `image/${ext}`,
                        data: base64FileData
                      }
                    }
                  ]
                }]
              })
            }
          );

          if (geminiResponse.status === 429) {
            console.log("Error 429: Demasiadas solicitudes. Esperando para reintentar...");
            await delay(2000 * attempts);
            continue;
          }

          if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            throw new Error(`Error de Gemini API: ${geminiResponse.status} - ${errorText}`);
          }

      const geminiData = await geminiResponse.json();
      
      // Extraer texto de todas las partes posibles (Gemini con Search puede devolver varias partes)
      let textResponse = "";
      const candidate = geminiData.candidates?.[0];
      if (candidate?.content?.parts) {
        textResponse = candidate.content.parts
          .map((part: any) => part.text || "")
          .join("")
          .trim();
      }
      
      if (!textResponse) {
        throw new Error("No se recibió respuesta de la IA. Intenta de nuevo.");
      }

          console.log("Respuesta completa de Gemini:", textResponse);

          // Limpieza y extracción robusta de JSON
          let jsonString = textResponse;
          
          // 1. Eliminar bloques de código markdown si existen
          if (jsonString.includes('```')) {
            const matches = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (matches && matches[1]) {
              jsonString = matches[1];
            } else {
              // Si falla el regex, fallback al método de índices
              const start = jsonString.indexOf('{');
              const end = jsonString.lastIndexOf('}');
              if (start !== -1 && end !== -1) {
                jsonString = jsonString.substring(start, end + 1);
              }
            }
          } else {
            // Si no hay markdown, buscar los límites del objeto por si hay texto extra
            const start = jsonString.indexOf('{');
            const end = jsonString.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
              jsonString = jsonString.substring(start, end + 1);
            }
          }

          try {
            ai_data = JSON.parse(jsonString.trim());
            
            if (ai_data.identified === false) {
              throw new Error(ai_data.reason || "No se pudo identificar el perfume. Intenta con una imagen más clara.");
            }
            
            success = true;
          } catch (parseError: any) {
            console.error("Error al parsear JSON de Gemini:", parseError.message);
            throw new Error("Respuesta inválida. Intenta acercarte más a la botella.");
          }

        } catch (e: any) {
          console.error(`Error en intento ${attempts}:`, e.message);
          if (attempts === 2) {
            throw new Error("No pudimos analizar la imagen. Intenta acercarte más a la botella.");
          }
        }
      }

      // Verificar si ya existe antes de guardar para evitar duplicados
      const { data: existingData } = await supabase
        .from('user_collections')
        .select('id')
        .eq('user_id', userId)
        .eq('photo_url', publicUrl)
        .single();

      if (!existingData) {
        // Solo guardar si no existe
        const { data: dbData, error: dbError } = await supabase
          .from('user_collections')
          .insert({
            user_id: userId,
            photo_url: publicUrl,
            ai_data: ai_data
          })
          .select();

        if (dbError) {
          console.error("Error guardando en DB:", dbError);
          // Continuar aunque falle el guardado
        }
      }

      setAiData(ai_data);
      if (setPhotoUrl) setPhotoUrl(publicUrl);

    } catch (e: any) {
      Alert.alert("Error", e.message);
      setView('main');
    } finally {
      setLoading(false);
    }
  };

  if (!permission) {
    return <View style={styles.centerContainer}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.scanSubtitle, { color: colors.textSecondary }]}>Necesitamos acceso a tu cámara para continuar.</Text>
        <StyledButton title="Solicitar Permiso" onPress={requestPermission} colors={colors} />
        <TouchableOpacity onPress={onClose} style={{marginTop: 20}}>
          <Text style={{color: colors.textSecondary}}>Cerrar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.fullScreen}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      
      {/* Top Bar */}
      <SafeAreaView style={styles.scanTopBar}>
        <TouchableOpacity style={styles.scanCloseBtn} onPress={onClose}>
          <Feather name="x" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          {isAnalyzing && (
            <ActivityIndicator size="small" color="#A855F7" />
          )}
          <Text style={styles.scanHeaderTitle}>
            {isAnalyzing ? 'Analizando...' : autoCapture ? 'Auto-escaneo activo' : 'Escaneando...'}
          </Text>
        </View>
        <TouchableOpacity 
          style={[styles.scanCloseBtn, {backgroundColor: autoCapture ? 'rgba(168, 85, 247, 0.6)' : 'rgba(0,0,0,0.4)'}]}
          onPress={() => setAutoCapture(!autoCapture)}
        >
          <Feather name={autoCapture ? "zap" : "zap-off"} size={20} color="#FFF" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Viewfinder Area */}
      <View style={styles.viewfinderContainer}>
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          
          {(autoCapture || isAnalyzing) && (
            <Animated.View 
              style={[
                styles.scanningLine, 
                { 
                  transform: [{ 
                    translateY: scanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 280] // Viewfinder size is 280
                    }) 
                  }] 
                }
              ]} 
            />
          )}
        </View>
        <Text style={styles.scanInstruction}>Enfoca el frasco de perfume</Text>
      </View>

      {/* Control Bar */}
      <View style={styles.scanBottomBar}>
        <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
          <Feather name="image" size={28} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.shutterButton} onPress={takePhoto}>
          <View style={styles.shutterInner} />
        </TouchableOpacity>

        <View style={{width: 50}} />
      </View>
    </View>
  );
}

// Helper function para iconos de estaciones
function getSeasonIcon(season: string): any {
  const seasonLower = season.toLowerCase();
  if (seasonLower.includes('verano') || seasonLower.includes('summer')) return 'sun';
  if (seasonLower.includes('invierno') || seasonLower.includes('winter')) return 'cloud-snow';
  if (seasonLower.includes('primavera') || seasonLower.includes('spring')) return 'cloud-drizzle';
  if (seasonLower.includes('otoño') || seasonLower.includes('autumn') || seasonLower.includes('fall')) return 'cloud-rain';
  return 'cloud';
}

// Helper functions para descripciones dinámicas de notas
function getTopNotesDescription(notes?: string[]): string {
  if (!notes || notes.length === 0) return 'Notas de apertura que dan la primera impresión.';
  
  const notesLower = notes.map(n => n.toLowerCase());
  
  if (notesLower.some(n => n.includes('cítric') || n.includes('limón') || n.includes('bergamota') || n.includes('naranja'))) {
    return 'Apertura cítrica brillante y energizante que despierta los sentidos.';
  } else if (notesLower.some(n => n.includes('flor') || n.includes('rosa') || n.includes('jazmín'))) {
    return 'Frescura floral delicada que captura la atención desde el primer momento.';
  } else if (notesLower.some(n => n.includes('especias') || n.includes('pimienta') || n.includes('cardamomo'))) {
    return 'Chispa especiada vibrante que añade carácter desde el inicio.';
  } else if (notesLower.some(n => n.includes('fruta') || n.includes('manzana') || n.includes('pera'))) {
    return 'Dulzura frutal jugosa que aporta frescura y vitalidad.';
  } else if (notesLower.some(n => n.includes('verde') || n.includes('hierba') || n.includes('menta'))) {
    return 'Frescura verde aromática que evoca naturaleza y vitalidad.';
  }
  
  return 'Notas de salida vibrantes que crean una primera impresión memorable.';
}

function getHeartNotesDescription(notes?: string[]): string {
  if (!notes || notes.length === 0) return 'El corazón del perfume que define su carácter.';
  
  const notesLower = notes.map(n => n.toLowerCase());
  
  if (notesLower.some(n => n.includes('rosa') || n.includes('jazmín') || n.includes('lirio'))) {
    return 'Bouquet floral sofisticado que revela elegancia y feminidad.';
  } else if (notesLower.some(n => n.includes('especias') || n.includes('canela') || n.includes('clavo'))) {
    return 'Calidez especiada envolvente que añade profundidad y misterio.';
  } else if (notesLower.some(n => n.includes('madera') || n.includes('cedro') || n.includes('sándalo'))) {
    return 'Carácter amaderado noble que aporta estructura y sofisticación.';
  } else if (notesLower.some(n => n.includes('vainilla') || n.includes('caramelo') || n.includes('dulce'))) {
    return 'Dulzura gourmand seductora que envuelve con calidez.';
  } else if (notesLower.some(n => n.includes('cuero') || n.includes('tabaco') || n.includes('ámbar'))) {
    return 'Riqueza oriental profunda que añade sensualidad y carácter.';
  }
  
  return 'Notas de corazón que definen la verdadera personalidad de la fragancia.';
}

function getBaseNotesDescription(notes?: string[]): string {
  if (!notes || notes.length === 0) return 'Notas de fondo que crean una estela duradera.';
  
  const notesLower = notes.map(n => n.toLowerCase());
  
  if (notesLower.some(n => n.includes('almizcle') || n.includes('musk'))) {
    return 'Estela almizclada sensual y envolvente que perdura en la piel.';
  } else if (notesLower.some(n => n.includes('madera') || n.includes('cedro') || n.includes('sándalo') || n.includes('vetiver'))) {
    return 'Base amaderada elegante y sofisticada con gran proyección.';
  } else if (notesLower.some(n => n.includes('vainilla') || n.includes('ámbar') || n.includes('benjuí'))) {
    return 'Calidez dulce y reconfortante que envuelve como un abrazo.';
  } else if (notesLower.some(n => n.includes('pachulí') || n.includes('musgo') || n.includes('oakmoss'))) {
    return 'Profundidad terrosa y misteriosa que ancla la composición.';
  } else if (notesLower.some(n => n.includes('cuero') || n.includes('tabaco'))) {
    return 'Carácter intenso y masculino con una estela poderosa.';
  } else if (notesLower.some(n => n.includes('incienso') || n.includes('mirra') || n.includes('resina'))) {
    return 'Aura espiritual y mística que deja una impresión duradera.';
  }
  
  return 'Notas de fondo que crean una firma olfativa única y memorable.';
}

function ResultScreen({ image, aiData, loading, onReset, colors, userId, photoUrl, onDelete, session, onToggleWishlist, wishlist }: any) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [userRating, setUserRating] = useState(aiData?.user_review?.rating || 0);
  const [reviewComment, setReviewComment] = useState(aiData?.user_review?.comment || "");
  const [isEditingReview, setIsEditingReview] = useState(false);
  const handleSaveReview = async () => {
    if (!aiData?.id && !userId) return;
    
    setSaving(true);
    try {
        const targetId = aiData.id || (await findIdByName(aiData.name, aiData.brand, userId));
        
        if (targetId) {
            const updatedAiData = {
                ...aiData,
                user_name: session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Usuario',
                user_review: {
                    rating: userRating,
                    comment: reviewComment,
                    date: new Date().toISOString()
                }
            };
            
            const { error } = await supabase.from('user_collections').update({ ai_data: updatedAiData }).eq('id', targetId);
            if (!error) {
                Alert.alert("¡Hecho!", "Tu reseña se ha compartido con la comunidad.");
                setIsEditingReview(false);
                setReviewComment(""); // Limpiar comentario
                setUserRating(0);    // Limpiar calificación
            } else {
                throw error;
            }
        }
    } catch (err: any) {
        console.error("Error saving review", err);
        Alert.alert("Error", "No se pudo guardar la reseña.");
    } finally {
        setSaving(false);
    }
  };

  const findIdByName = async (name: string, brand: string, uid: string) => {
    const { data } = await supabase.from('user_collections')
        .select('id')
        .eq('user_id', uid)
        .contains('ai_data', { name, brand })
        .limit(1)
        .single();
    return data?.id;
  };

  const handleShare = async () => {
    try {
      const message = `¡Mira este perfume que encontré!\n\n${aiData.brand} - ${aiData.name}\n${aiData.description || ''}\n\nDescubierto con Perfume AI Scanner`;
      
      await Share.share({
        message,
        title: `${aiData.brand} - ${aiData.name}`,
      });
    } catch (error: any) {
      console.error('Error al compartir:', error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: '#0F0A1A' }]}>
        <ActivityIndicator size="large" color="#A855F7" />
        <Text style={[styles.loadingText, { color: '#9CA3AF' }]}>Analizando esencia...</Text>
      </View>
    );
  }

  if (!aiData) return null;

  if (aiData.identified === false) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: '#0F0A1A' }]}>
        <Image source={{ uri: image }} style={[styles.errorImage, { backgroundColor: '#1F1B2E' }]} />
        <Text style={[styles.errorTitle, { color: '#F9FAFB' }]}>No identificado</Text>
        <Text style={[styles.errorText, { color: '#9CA3AF' }]}>No pudimos reconocer un perfume en esta imagen.</Text>
        <View style={{marginTop: 24, width: '100%', paddingHorizontal: 24}}>
          <StyledButton title="Intentar de nuevo" onPress={onReset} colors={{...colors, primary: '#A855F7'}} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0F0A1A' }}>
      <SafeAreaView style={{ backgroundColor: '#0F0A1A' }}>
        <View style={styles.resultHeader}>
          <TouchableOpacity onPress={onReset} style={styles.resultBackBtn}>
            <Feather name="arrow-left" size={24} color="#F9FAFB" />
          </TouchableOpacity>
          <Text style={styles.resultHeaderTitle}>Resultado del Escaneo</Text>
          <TouchableOpacity style={styles.resultShareBtn} onPress={handleShare}>
            <Feather name="share-2" size={24} color="#F9FAFB" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView 
        contentContainerStyle={styles.resultScrollNew} 
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: '#0F0A1A' }}
      >
        {/* Hero Image */}
        <View style={styles.resultHeroContainer}>
          <Image source={{ uri: image }} style={styles.resultHeroImage} />
          <LinearGradient
            colors={['transparent', '#0F0A1A']}
            style={styles.resultHeroGradient}
          />
          
          {/* Status Badge Floating */}
          <View style={{ position: 'absolute', top: 20, right: 20, gap: 8 }}>
            <View style={{ backgroundColor: 'rgba(74, 222, 128, 0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(74, 222, 128, 0.4)' }}>
               <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' }} />
               <Text style={{ color: '#4ADE80', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>EN COLECCIÓN</Text>
            </View>
            <TouchableOpacity 
              onPress={() => onToggleWishlist(aiData)}
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', padding: 10, borderRadius: 20, alignSelf: 'flex-end' }}
            >
               <Feather 
                 name="heart" 
                 size={20} 
                 color={wishlist.find((w: any) => w.brand === aiData.brand && w.perfume_name === aiData.name) ? "#EF4444" : "#FFF"} 
                 fill={wishlist.find((w: any) => w.brand === aiData.brand && w.perfume_name === aiData.name) ? "#EF4444" : "transparent"} 
               />
            </TouchableOpacity>
          </View>
        </View>

        {/* Perfume Info Card */}
        <View style={styles.resultCard}>
          <Text style={styles.resultBrand}>{aiData.brand?.toUpperCase() || 'MARCA'}</Text>
          <Text style={styles.resultName}>{aiData.name}</Text>
          <View style={styles.resultRatingBadge}>
            <Feather name="star" size={16} color="#FBBF24" />
            <Text style={styles.resultRating}>4.8</Text>
            <Text style={styles.resultConcentration}> • {aiData.concentration}</Text>
          </View>

          {/* Descripción del Perfume */}
          {aiData.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.perfumeDescriptionText}>{aiData.description}</Text>
            </View>
          )}

          {/* Familia Olfativa */}
          {aiData.olfactory_family && (
            <View style={styles.familySection}>
              <View style={[styles.familyBadge, { backgroundColor: 'rgba(168, 85, 247, 0.08)', borderWidth: 0 }]}>
                <Feather name="wind" size={14} color="#A855F7" />
                <Text style={[styles.familyText, { color: '#A855F7', fontWeight: 'bold' }]}>{aiData.olfactory_family}</Text>
              </View>
            </View>
          )}


          {/* Perfecto Para */}
          <View style={styles.perfectForSection}>
            <Text style={styles.perfectForTitle}>PERFECTO PARA</Text>
            <View style={styles.perfectForGrid}>
              {aiData.usage?.time_of_day && (
                <View style={[
                  styles.perfectForItem,
                  aiData.usage.time_of_day.toLowerCase().includes('día') || aiData.usage.time_of_day.toLowerCase().includes('day') 
                    ? styles.perfectForItemActive 
                    : {}
                ]}>
                  <Feather name="sun" size={20} color="#F9FAFB" />
                  <Text style={styles.perfectForText}>Día</Text>
                </View>
              )}
              {aiData.usage?.time_of_day && (
                <View style={[
                  styles.perfectForItem,
                  aiData.usage.time_of_day.toLowerCase().includes('noche') || aiData.usage.time_of_day.toLowerCase().includes('night')
                    ? styles.perfectForItemActive 
                    : {}
                ]}>
                  <Feather name="moon" size={20} color="#F9FAFB" />
                  <Text style={styles.perfectForText}>Noche</Text>
                </View>
              )}
              <View style={styles.perfectForItem}>
                <Feather name="briefcase" size={20} color="#F9FAFB" />
                <Text style={styles.perfectForText}>Casual</Text>
              </View>
            </View>

            {/* Ocasiones */}
            {aiData.usage?.occasions && aiData.usage.occasions.length > 0 && (
              <View style={styles.occasionsContainer}>
                <Text style={styles.occasionsTitle}>Ocasiones ideales:</Text>
                <View style={styles.occasionsChips}>
                  {aiData.usage.occasions.map((occasion: string, index: number) => (
                    <View key={index} style={styles.occasionChip}>
                      <Text style={styles.occasionChipText}>{occasion}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Estaciones */}
            {aiData.usage?.season && aiData.usage.season.length > 0 && (
              <View style={styles.seasonsContainer}>
                <Text style={styles.seasonsTitle}>Estaciones recomendadas:</Text>
                <View style={styles.seasonsChips}>
                  {aiData.usage.season.map((season: string, index: number) => (
                    <View key={index} style={styles.seasonChip}>
                      <Feather 
                        name={getSeasonIcon(season)} 
                        size={14} 
                        color="#A855F7" 
                      />
                      <Text style={styles.seasonChipText}>{season}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Composición Olfativa */}
          <View style={styles.compositionSection}>
            <Text style={styles.compositionTitle}>COMPOSICIÓN OLFATIVA</Text>
            
            {/* Top Notes */}
            <View style={styles.compositionItem}>
              <View style={styles.compositionIconContainer}>
                <Feather name="droplet" size={20} color="#A855F7" />
              </View>
              <View style={styles.compositionContent}>
                <Text style={styles.compositionLabel}>Notas de Salida</Text>
                <Text style={styles.compositionNotes}>
                  {aiData.notes?.top?.join(', ') || 'N/A'}
                </Text>
                <Text style={styles.compositionDesc}>
                  {getTopNotesDescription(aiData.notes?.top)}
                </Text>
                <Text style={styles.compositionTime}>Inmediato • 5-15 min</Text>
              </View>
            </View>

            <View style={styles.compositionLine} />

            {/* Heart Notes */}
            <View style={styles.compositionItem}>
              <View style={[styles.compositionIconContainer, { backgroundColor: '#1F1B2E' }]}>
                <Feather name="heart" size={20} color="#A855F7" />
              </View>
              <View style={styles.compositionContent}>
                <Text style={styles.compositionLabel}>Notas de Corazón</Text>
                <Text style={styles.compositionNotes}>
                  {aiData.notes?.heart?.join(', ') || 'N/A'}
                </Text>
                <Text style={styles.compositionDesc}>
                  {getHeartNotesDescription(aiData.notes?.heart)}
                </Text>
                <Text style={styles.compositionTime}>30 min - 3 horas</Text>
              </View>
            </View>

            <View style={styles.compositionLine} />

            {/* Base Notes */}
            <View style={styles.compositionItem}>
              <View style={[styles.compositionIconContainer, { backgroundColor: '#1F1B2E' }]}>
                <Feather name="layers" size={20} color="#A855F7" />
              </View>
              <View style={styles.compositionContent}>
                <Text style={styles.compositionLabel}>Notas de Fondo</Text>
                <Text style={styles.compositionNotes}>
                  {aiData.notes?.base?.join(', ') || 'N/A'}
                </Text>
                <Text style={styles.compositionDesc}>
                  {getBaseNotesDescription(aiData.notes?.base)}
                </Text>
                <Text style={styles.compositionTime}>4+ horas • Estela duradera</Text>
              </View>
            </View>
          </View>

          {/* Rating Section - Rediseñada */}
          <View style={{ marginTop: 32, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
               <View style={{ width: 4, height: 20, backgroundColor: '#A855F7', borderRadius: 2 }} />
               <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 }}>TU EXPERIENCIA</Text>
            </View>
            
            <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20, justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setUserRating(star)} activeOpacity={0.7}>
                    <MaterialCommunityIcons 
                      name={star <= userRating ? "star" : "star-outline"} 
                      size={32} 
                      color={star <= userRating ? "#FBBF24" : "rgba(255,255,255,0.1)"} 
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput 
                style={{ 
                  color: '#FFF', 
                  padding: 0, 
                  minHeight: 60, 
                  textAlignVertical: 'top',
                  fontSize: 15,
                  lineHeight: 22
                }}
                placeholder="¿Qué tal te pareció? Comparte tu reseña..."
                placeholderTextColor="rgba(255,255,255,0.2)"
                multiline
                value={reviewComment}
                onChangeText={setReviewComment}
              />

              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 16 }} />

              <TouchableOpacity 
                onPress={handleSaveReview}
                disabled={saving || userRating === 0}
                style={{ 
                  alignSelf: 'flex-end',
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: userRating > 0 ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                  borderWidth: 1,
                  borderColor: userRating > 0 ? '#A855F7' : 'rgba(255,255,255,0.1)',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                {saving ? <ActivityIndicator size="small" color="#A855F7" /> : (
                  <>
                    <Text style={{ color: userRating > 0 ? '#A855F7' : 'rgba(255,255,255,0.3)', fontWeight: 'bold', fontSize: 13 }}>Publicar reseña</Text>
                    <Feather name="send" size={14} color={userRating > 0 ? '#A855F7' : 'rgba(255,255,255,0.3)'} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>



          <TouchableOpacity 
            style={{ 
              backgroundColor: 'rgba(255,255,255,0.03)', 
              borderRadius: 20, 
              padding: 16, 
              flexDirection: 'row', 
              alignItems: 'center', 
              borderWidth: 1, 
              borderColor: 'rgba(255,255,255,0.05)',
              marginTop: 12
            }}
          >
            <View style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 12 }}>
               <Feather name="shopping-bag" size={20} color="#FFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>Disponible en Sephora</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Ver disponibilidad cercana</Text>
            </View>
            <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.2)" />
          </TouchableOpacity>

          {/* Gestión - Limpia */}
          {aiData.id && (
            <TouchableOpacity 
              onPress={() => onDelete(aiData.id, aiData.name)}
              style={{ 
                marginTop: 48, 
                marginBottom: 40,
                flexDirection: 'row', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: 8
              }}
            >
               <Feather name="trash-2" size={14} color="rgba(239, 68, 68, 0.4)" />
               <Text style={{ color: 'rgba(239, 68, 68, 0.4)', fontSize: 13, fontWeight: '600' }}>Eliminar perfume de mi colección</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  contentContainer: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  screenHeader: {
    padding: 24,
    paddingTop: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 4,
  },
  // TabBar
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBar: {
    flexDirection: 'row',
    height: 90, // Aumentado para compensar el safe area
    borderTopWidth: 1,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 30, // Aumentado para safe area
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
  },
  fabSpace: {
    width: 70,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '600',
  },
  fabContainer: {
    position: 'absolute',
    top: -30,
    left: width / 2 - 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },
  fabGradient: {
    flex: 1,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Buttons
  button: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  buttonPrimary: {
    backgroundColor: '#A855F7',
  },
  buttonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  textPrimary: {
    color: '#FFFFFF',
  },
  textSecondary: {
    color: '#111827',
  },
  // Auth Screen
  authContainer: {
    flex: 1,
  },
  authContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  authTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  authSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  inputWrapper: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  textInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#111827',
  },
  forgotPassword: {
    fontSize: 14,
    color: '#A855F7',
    fontWeight: '600',
  },
  authButtons: {
    marginTop: 10,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 32,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    marginHorizontal: 16,
  },
  socialRow: {
    flexDirection: 'row',
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    height: 56,
  },
  socialIconPlaceholder: {
    width: 20,
    height: 20,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginRight: 10,
  },
  socialBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 8,
  },
  authFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 40,
  },
  footerText: {
    fontSize: 15,
    color: '#6B7280',
  },
  footerLink: {
    fontSize: 15,
    color: '#A855F7',
    fontWeight: '700',
  },
  // Home & Other Screens
  promoCard: {
    margin: 24,
    padding: 24,
    backgroundColor: '#111827',
    borderRadius: 24,
  },
  promoTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  promoText: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyStateText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  // Scan Screen Large Styles
  scanIconOuterCircle: {
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(168, 85, 247, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  scanIconInnerCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  qrPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 40,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  scanTitleLarge: {
    fontSize: 28,
    fontWeight: '800',
    color: '#A855F7',
    textAlign: 'center',
    marginBottom: 16,
  },
  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginTop: 16,
    height: 48,
  },
  searchInputOld: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#111827',
  },
  scrollList: {
    padding: 24,
  },
  perfumeListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  itemImagePlaceholder: {
    width: 60,
    height: 60,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 16,
  },
  itemBrand: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  // Profile
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 4,
    borderColor: '#FFF',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  profileEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  settingsScroll: {
    flex: 1,
  },
  settingsGroup: {
    backgroundColor: '#FFF',
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  switch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
  },
  switchOn: {
    backgroundColor: '#10B981',
  },
  switchOff: {
    backgroundColor: '#E5E7EB',
  },
  switchHandle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  handleOn: {
    alignSelf: 'flex-end',
  },
  handleOff: {
    alignSelf: 'flex-start',
  },
  logoutBtnFull: {
    marginTop: 32,
    marginHorizontal: 24,
    padding: 16,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3E8FF',
  },
  logoutBtnText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  // Shared
  closeBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
  },
  scanHeader: {
    alignItems: 'center',
    marginBottom: 60,
  },
  scanTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  scanSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: '80%',
  },
  actionButtons: {
    width: '100%',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#4B5563',
    fontWeight: '500',
  },
  resultScroll: {
    paddingBottom: 40,
  },
  heroImage: {
    width: '100%',
    height: 400,
    resizeMode: 'cover',
  },
  resultContent: {
    padding: 24,
    marginTop: -24,
    backgroundColor: '#F9FAFB',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerInfo: {
    alignItems: 'center',
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 24,
  },
  brandName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  perfumeTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  badge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  descriptionText: {
    fontSize: 16,
    lineHeight: 26,
    color: '#4B5563',
    marginBottom: 32,
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },

  sectionHeaderInner: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    marginBottom: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 24,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  // ... more styles
  backBtn: {
    marginBottom: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  checkboxChecked: {
    backgroundColor: '#A855F7',
    borderColor: '#A855F7',
  },
  termsText: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  termsLink: {
    color: '#A855F7',
    fontWeight: '600',
  },
  // Onboarding
  onboardingIconCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
  },
  onboardingTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  onboardingDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 4,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#A855F7',
  },
  skipBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  fullScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Restoring missing styles
  noteLabel: {
    width: 70,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 6,
  },
  tagsWrapper: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  usageGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  usageItem: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  usageLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
    fontWeight: '600',
  },
  usageValue: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '600',
  },
  errorImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFF',
  },
  genderBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  welcomeText: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '800',
  },
  expertCard: {
    margin: 20,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: "#A855F7",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  expertGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  expertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  expertIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expertTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  expertSubtitle: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  expertInputContainer: {
    gap: 12,
  },
  expertInput: {
    backgroundColor: 'rgba(15, 10, 26, 0.5)',
    borderRadius: 16,
    padding: 16,
    color: '#FFF',
    fontSize: 14,
    height: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.2)',
  },
  expertSubmitBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    gap: 8,
  },
  expertSubmitText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  adviceContainer: {
    gap: 16,
  },
  adviceText: {
    color: '#E5E7EB',
    fontSize: 14,
    lineHeight: 22,
  },
  tipsContainer: {
    gap: 8,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  layeringBox: {
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    borderStyle: 'dashed',
  },
  layeringLabel: {
    color: '#A855F7',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
  },
  layeringText: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 18,
  },
  expertResetBtn: {
    alignSelf: 'center',
    marginTop: 8,
  },
  scrollContent: {
    padding: 24,
  },
  promoSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 32,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  scanTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  scanCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanHeaderTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  viewfinderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  viewfinder: {
    width: width * 0.75,
    height: width * 1.0,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#A855F7',
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 24,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 24,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 24,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 24,
  },
  scanInstruction: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 40,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 25,
    overflow: 'hidden',
  },
  scanBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: 'rgba(0,0,0,0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
    gap: 60,
  },
  shutterButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 6,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF',
  },
  galleryButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  helpText: {
    fontSize: 16,
    lineHeight: 24,
  },
  aboutTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 10,
  },
  aboutVersion: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 4,
  },
  aboutDev: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
    opacity: 0.8,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  // New Result Screen Styles
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#0F0A1A',
  },
  resultBackBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F9FAFB',
  },
  resultShareBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultScrollNew: {
    paddingBottom: 40,
  },
  // ESTILOS DE HOME SCREEN
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    marginBottom: 24,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16
  },
  horizontalScroll: {
    marginBottom: 8,
  },
  miniCard: {
    width: 140,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    paddingBottom: 12,
  },
  miniCardImage: {
    width: '100%',
    height: 100,
    resizeMode: 'cover',
  },
  miniCardInfo: {
    padding: 10,
  },
  miniCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  miniCardSubtitle: {
    fontSize: 12,
  },
  emptyStateSimple: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 12,
  },
  categoryText: {
    fontWeight: '600',
    fontSize: 14,
  },
  // FIN ESTILOS HOME
  resultHeroContainer: {
    width: '100%',
    height: 400,
    position: 'relative',
  },
  resultHeroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  resultHeroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  resultCard: {
    backgroundColor: '#1F1B2E',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -32,
    padding: 24,
    paddingTop: 32,
  },
  resultBrand: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A855F7',
    letterSpacing: 2,
    marginBottom: 8,
  },
  resultName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F9FAFB',
    marginBottom: 12,
  },
  resultRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2538',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 24,
  },
  resultRating: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F9FAFB',
    marginLeft: 6,
  },
  resultConcentration: {
    fontSize: 14,
    color: '#9CA3AF',
    marginLeft: 4,
  },
  descriptionSection: {
    marginTop: 20,
    marginBottom: 24,
  },
  perfumeDescriptionText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#D1D5DB',
    textAlign: 'left',
  },
  familySection: {
    marginBottom: 24,
  },
  familyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2538',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 8,
  },
  familyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  perfectForSection: {
    marginBottom: 32,
  },
  perfectForTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1,
    marginBottom: 16,
  },
  perfectForGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  perfectForItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2538',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  perfectForItemActive: {
    backgroundColor: '#4C1D95',
  },
  perfectForText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  occasionsContainer: {
    marginTop: 20,
  },
  occasionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
  },
  occasionsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  occasionChip: {
    backgroundColor: '#2A2538',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4C1D95',
  },
  occasionChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#D1D5DB',
  },
  seasonsContainer: {
    marginTop: 16,
  },
  seasonsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
  },
  seasonsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  seasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2538',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#A855F7',
  },
  seasonChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#F9FAFB',
  },
  compositionSection: {
    marginBottom: 32,
  },
  compositionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1,
    marginBottom: 24,
  },
  compositionItem: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  compositionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2538',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  compositionContent: {
    flex: 1,
  },
  compositionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 6,
  },
  compositionNotes: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  compositionDesc: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 20,
    marginBottom: 6,
  },
  compositionTime: {
    fontSize: 12,
    color: '#A855F7',
    fontWeight: '600',
  },
  compositionLine: {
    width: 2,
    height: 20,
    backgroundColor: '#2A2538',
    marginLeft: 20,
    marginBottom: 8,
  },
  addToCollectionBtn: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  addToCollectionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  addToCollectionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  sephoraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2538',
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  sephoraBtnContent: {
    flex: 1,
  },
  sephoraBtnTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 2,
  },
  sephoraBtnSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  // Home Profile Avatar
  homeProfileAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  homeProfileInitials: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    lineHeight: 36,
  },
  profileBackBtn: {
    padding: 16,
    paddingBottom: 8,
  },
  // Search Collection Styles
  tabSelector: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabSelectorBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelectorBtnActive: {
    borderBottomColor: '#A855F7',
  },
  tabSelectorText: {
    fontSize: 15,
    fontWeight: '600',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  collectionCard: {
    width: (width - 60) / 2,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  collectionCardImage: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  collectionCardInfo: {
    padding: 12,
  },
  collectionCardBrand: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  collectionCardName: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reviewUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  reviewUserName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  reviewPerfumeName: {
    fontSize: 13,
  },
  reviewRating: {
    flexDirection: 'row',
    gap: 4,
  },
  reviewComment: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  reviewDate: {
    fontSize: 12,
  },
  addReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    marginTop: 8,
  },
  addReviewBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  scanningLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#A855F7',
    borderRadius: 2,
    zIndex: 10,
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
  }
});
