import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Shield,
  Users,
  WifiOff,
  Globe,
} from 'lucide-react-native';
import { useGameState } from '../hooks/useGameState';

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState('Nobre Cavaleiro');
  const [room, setRoom] = useState('');
  const { joinRoom, startOfflineGame } = useGameState();

  const handleCreate = () => {
    if (!name) {
      Alert.alert('Atenção', 'Insira seu nome para criar uma sala.');
      return;
    }
    const newRoom = Math.random().toString(36).substring(7).toUpperCase();
    joinRoom(newRoom, name);
    router.push(`/game/${newRoom}`);
  };

  const handleJoin = () => {
    if (!name || !room) {
      Alert.alert('Atenção', 'Insira seu nome e o código da sala para prosseguir.');
      return;
    }
    joinRoom(room, name);
    router.push(`/game/${room}`);
  };

  const handleOffline = () => {
    const offlineName = name || 'Cavaleiro';
    startOfflineGame(offlineName);
    router.push('/game/OFFLINE');
  };

  return (
    <ScrollView
      style={[styles.lobbyContainer, { paddingTop: insets.top }]}
      contentContainerStyle={[styles.lobbyContent, { paddingBottom: insets.bottom + 20 }]}
    >
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <Shield color="#8B0000" size={100} strokeWidth={1.5} />
        <Text style={styles.title}>COUP</Text>
        <Text style={styles.subtitle}>EDIÇÃO MEDIEVAL</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>NOME DO NOBRE</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Ex: Sir Arthur"
          placeholderTextColor="#A0A0A0"
        />

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: '#5C4033', marginTop: 10 }]}
          onPress={handleOffline}
        >
          <WifiOff color="white" size={24} />
          <View style={styles.buttonTextContainer}>
            <Text style={styles.buttonTitle}>MODO LOCAL</Text>
            <Text style={styles.buttonSubtitle}>Jogue contra a IA do Reino</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.dividerContainer}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>OU</Text>
          <View style={styles.line} />
        </View>

        <View style={styles.onlineSection}>
          <Text style={styles.label}>MODO ONLINE</Text>
          <View style={styles.roomRow}>
            <TextInput
              style={[styles.input, { flex: 1.5, marginBottom: 0, textAlign: 'center' }]}
              value={room}
              onChangeText={setRoom}
              placeholder="CÓDIGO"
              autoCapitalize="characters"
              placeholderTextColor="#A0A0A0"
            />
            <TouchableOpacity style={[styles.inlineButton]} onPress={handleJoin}>
              <Text style={styles.inlineButtonText}>ENTRAR</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={styles.createBtn} 
            onPress={handleCreate}
          >
            <Users color="#8B0000" size={18} />
            <Text style={styles.createBtnText}>CRIAR UMA NOVA SALA</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.footerText}>
        "A traição é a única moeda que nunca perde o valor no reino."
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  lobbyContainer: {
    flex: 1,
    backgroundColor: '#F4E7D3',
  },
  lobbyContent: {
    padding: 25,
    alignItems: 'center',
  },
  hero: {
    alignItems: 'center',
    marginVertical: 40,
  },
  title: {
    fontSize: 72,
    fontWeight: '900',
    color: '#8B0000',
    letterSpacing: -2,
    marginTop: 10,
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#5C4033',
    letterSpacing: 6,
    fontWeight: '700',
    marginTop: -5,
  },
  formCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    width: '100%',
    padding: 25,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#D4AF37',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  label: {
    fontSize: 12,
    color: '#8B0000',
    fontWeight: '900',
    marginBottom: 10,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    borderRadius: 15,
    padding: 18,
    fontSize: 18,
    color: '#2F4F4F',
    marginBottom: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#8B0000',
    flexDirection: 'row',
    height: 75,
    borderRadius: 20,
    alignItems: 'center',
    paddingHorizontal: 20,
    elevation: 4,
  },
  buttonTextContainer: {
    marginLeft: 15,
  },
  buttonTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
  },
  buttonSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 25,
  },
  line: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#D4AF37',
    opacity: 0.3,
  },
  dividerText: {
    marginHorizontal: 15,
    color: '#D4AF37',
    fontWeight: '900',
    fontSize: 14,
  },
  onlineSection: {
    width: '100%',
  },
  roomRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineButton: {
    backgroundColor: '#8B0000',
    paddingHorizontal: 15,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inlineButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
  },
  createBtn: {
    marginTop: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139, 0, 0, 0.05)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#8B0000',
    height: 50,
    borderRadius: 15,
    gap: 10,
  },
  createBtnText: {
    color: '#8B0000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  footerText: {
    marginTop: 40,
    color: 'rgba(92, 64, 51, 0.6)',
    fontStyle: 'italic',
    textAlign: 'center',
    fontSize: 13,
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
