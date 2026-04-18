import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Easing
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Users,
  WifiOff,
} from 'lucide-react-native';
import { useGameState } from '../hooks/useGameState';
import MedievalAlert from '../components/MedievalAlert';

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState('Nobre Cavaleiro');
  const [room, setRoom] = useState('');
  const { joinRoom, startOfflineGame } = useGameState();
  
  const [alertConfig, setAlertConfig] = useState<{visible: boolean, title: string, message: string}>({
    visible: false, title: '', message: ''
  });

  // Entrance Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      })
    ]).start();
  }, []);

  const handleCreate = () => {
    if (!name.trim()) {
      setAlertConfig({ visible: true, title: 'O Código de Honra', message: 'Por favor, grave o seu nome nos anais antes de fundar um reino.' });
      return;
    }
    const newRoom = Math.random().toString(36).substring(7).toUpperCase();
    joinRoom(newRoom, name);
    router.push(`/game/${newRoom}`);
  };

  const handleJoin = () => {
    if (!name.trim() || !room.trim()) {
      setAlertConfig({ visible: true, title: 'Portões Fechados', message: 'Você deve apresentar um Nome e o Selo (Código) do reino para entrar.' });
      return;
    }
    joinRoom(room, name);
    router.push(`/game/${room}`);
  };

  const handleOffline = () => {
    const offlineName = name.trim() || 'Cavaleiro Solitário';
    startOfflineGame(offlineName);
    router.push('/game/OFFLINE');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="light" />
      
      {/* Decorative Top Banner */}
      <View style={styles.topTrim} />

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[
          styles.hero, 
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}>

          <Text style={styles.title}>COUP</Text>
          <Text style={styles.subtitle}>E D I Ç Ã O  M E D I E V A L</Text>
        </Animated.View>

        <Animated.View style={[
          styles.formContainer, 
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
        ]}>
          
          {/* Identity Section */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>◈ SEU NOME DE NOBRE ◈</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Ex. Sir Arthur"
                placeholderTextColor="#666"
              />
            </View>
          </View>

          {/* Local Play */}
          <View style={styles.cardSection}>
            <Text style={styles.sectionHeader}>TREINAMENTO LOCAL</Text>
            <TouchableOpacity style={styles.btnAction} onPress={handleOffline} activeOpacity={0.8}>
              <View style={styles.btnIconBg}>
                <WifiOff color="#1A1F24" size={24} />
              </View>
              <View style={styles.btnTextWrap}>
                <Text style={styles.btnTitle}>Modo Solitário</Text>
                <Text style={styles.btnSubtitle}>Enfrente a IA da Corte</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OU MULTIPLAYER</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Online Section */}
          <View style={styles.cardSection}>
            <Text style={styles.sectionHeader}>CONEXÃO REAL</Text>
            
            <View style={styles.row}>
              <View style={[styles.inputWrapper, { flex: 1 }]}>
                <TextInput
                  style={[styles.input, { fontSize: 16 }]}
                  value={room}
                  onChangeText={setRoom}
                  placeholder="CÓDIGO DA SALA"
                  autoCapitalize="characters"
                  maxLength={6}
                  placeholderTextColor="#666"
                />
              </View>
              <TouchableOpacity style={styles.btnJoin} onPress={handleJoin} activeOpacity={0.8}>
                <Text style={styles.btnJoinText}>INVASÃO</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.btnCreate} onPress={handleCreate} activeOpacity={0.8}>
              <Users color="#D4AF37" size={18} />
              <Text style={styles.btnCreateText}>FUNDAR NOVO REINO</Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
        
        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={styles.flavorText}>"A traição é a única moeda que nunca perde o valor no reino."</Text>
        </Animated.View>
      </ScrollView>

      <MedievalAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1318', 
  },
  topTrim: {
    height: 4,
    backgroundColor: '#D4AF37',
    width: '100%',
    shadowColor: '#D4AF37',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  scrollContent: {
    padding: 24,
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hero: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconGlow: {
    shadowColor: '#D4AF37',
    shadowOpacity: 0.3,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 0 },
    elevation: 15,
  },
  title: {
    fontSize: 76,
    fontFamily: 'serif',
    fontWeight: '900',
    color: '#D4AF37',
    letterSpacing: -2,
    marginTop: 10,
    textShadowColor: 'rgba(212, 175, 55, 0.4)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  subtitle: {
    fontSize: 12,
    color: '#8E1616', // Dark crimson
    fontWeight: '800',
    marginTop: -8,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  inputGroup: {
    width: '100%',
    marginBottom: 30,
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: '#A1ADC1',
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: 2,
  },
  inputWrapper: {
    width: '100%',
    backgroundColor: '#1A1F24',
    borderWidth: 1,
    borderColor: '#30363D',
    borderRadius: 8,
    overflow: 'hidden',
  },
  input: {
    padding: 18,
    fontSize: 20,
    color: '#EADDCA',
    fontWeight: '700',
    textAlign: 'center',
  },
  cardSection: {
    width: '100%',
    backgroundColor: '#151A1F',
    borderWidth: 1,
    borderColor: '#2D333B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  sectionHeader: {
    fontSize: 11,
    color: '#A1ADC1',
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  btnAction: {
    backgroundColor: '#D4AF37',
    flexDirection: 'row',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  btnIconBg: {
    backgroundColor: 'rgba(26, 31, 36, 0.1)',
    padding: 10,
    borderRadius: 6,
  },
  btnTextWrap: {
    marginLeft: 12,
  },
  btnTitle: {
    color: '#1A1F24',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  btnSubtitle: {
    color: '#4A3B18',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '80%',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#30363D',
  },
  dividerText: {
    color: '#666',
    marginHorizontal: 12,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btnJoin: {
    backgroundColor: '#8E1616',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  btnJoinText: {
    color: '#FFF',
    fontWeight: '900',
    letterSpacing: 1,
    fontSize: 14,
  },
  btnCreate: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
    borderWidth: 1,
    borderColor: '#D4AF37',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  btnCreateText: {
    color: '#D4AF37',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  flavorText: {
    marginTop: 50,
    color: '#4A5568',
    fontStyle: 'italic',
    textAlign: 'center',
    fontSize: 13,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
});
