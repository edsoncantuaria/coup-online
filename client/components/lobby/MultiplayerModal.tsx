import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Wifi,
  Globe,
  Users,
  DoorOpen,
  ChevronRight,
  RefreshCw,
  Mic,
  Shield,
  CirclePlus,
  LogIn,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../../constants/Theme';
import { useGameState } from '../../hooks/useGameState';
import { getInternetServerUrl } from '../../constants/Online';
import {
  discoverLanServerUrl,
  fetchLobbyRooms,
  type LobbyRoomSummary,
} from '../../utils/networkDiscovery';

type Transport = 'local' | 'internet';
type Intent = 'create' | 'join';

type Screen =
  | 'intro'
  | 'transport'
  | 'busy'
  | 'createForm'
  | 'joinLobby';

type Props = {
  visible: boolean;
  playerName: string;
  onClose: () => void;
  onEnterGame: (roomId: string) => void;
};

export default function MultiplayerModal({
  visible,
  playerName,
  onClose,
  onEnterGame,
}: Props) {
  const insets = useSafeAreaInsets();
  const connectAsync = useGameState((s) => s.connectAsync);
  const disconnectOnline = useGameState((s) => s.disconnectOnline);
  const joinRoom = useGameState((s) => s.joinRoom);
  const createRoom = useGameState((s) => s.createRoom);

  const [screen, setScreen] = useState<Screen>('intro');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busyHint, setBusyHint] = useState('');
  const [transport, setTransport] = useState<Transport | null>(null);
  const [connectedBaseUrl, setConnectedBaseUrl] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [lobbyRooms, setLobbyRooms] = useState<LobbyRoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);

  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [roomActionError, setRoomActionError] = useState<string | null>(null);

  const resetAll = useCallback(() => {
    setScreen('intro');
    setIntent(null);
    setBusyHint('');
    setTransport(null);
    setConnectedBaseUrl(null);
    setConnectionError(null);
    setLobbyRooms([]);
    setRoomsLoading(false);
    setRoomCode('');
    setDisplayName('');
    setCreatePassword('');
    setJoinPassword('');
    setRoomActionError(null);
    disconnectOnline();
  }, [disconnectOnline]);

  useEffect(() => {
    if (!visible) return;
    resetAll();
  }, [visible, resetAll]);

  const refreshRooms = useCallback(async () => {
    if (!connectedBaseUrl) {
      setLobbyRooms([]);
      return;
    }
    setRoomsLoading(true);
    const list = await fetchLobbyRooms(connectedBaseUrl);
    setLobbyRooms(list);
    setRoomsLoading(false);
  }, [connectedBaseUrl]);

  /** Só na tela “Entrar”: busca mesas ao conectar. */
  useEffect(() => {
    if (screen === 'joinLobby' && visible && connectedBaseUrl) {
      void refreshRooms();
    }
  }, [screen, visible, connectedBaseUrl, refreshRooms]);

  const runConnect = async (t: Transport, nextIntent: Intent) => {
    setTransport(t);
    setConnectionError(null);

    /** Criar + mesma rede: o próprio celular hospeda (TCP), sem procurar PC. */
    if (nextIntent === 'create' && t === 'local') {
      setScreen('busy');
      setBusyHint('Abrindo mesa neste aparelho…');
      try {
        const { baseUrl } = await useGameState.getState().startLanHostSession();
        setConnectedBaseUrl(baseUrl);
        setScreen('createForm');
      } catch (e: unknown) {
        const msg =
          e instanceof Error
            ? e.message
            : 'Não foi possível abrir o servidor neste aparelho.';
        setConnectionError(msg);
        setScreen('transport');
      }
      return;
    }

    setScreen('busy');
    setBusyHint(
      t === 'local'
        ? 'Procurando uma mesa na rede…'
        : 'Conectando ao servidor…'
    );

    let url: string | null = null;
    if (t === 'local') {
      url = await discoverLanServerUrl();
      if (!url) {
        setConnectionError(
          Platform.OS === 'web'
            ? 'No navegador, use o dispositivo com o app ou o modo Internet.'
            : 'Não encontramos uma mesa na rede. Quem for anfitrião deve escolher “Criar” no Wi‑Fi, ou rode o servidor no PC.'
        );
        setScreen('transport');
        return;
      }
    } else {
      url = getInternetServerUrl();
    }

    const ok = await connectAsync(url);
    if (!ok) {
      setConnectionError(
        'Não foi possível conectar. Tente de novo ou verifique sua internet.'
      );
      setScreen('transport');
      return;
    }
    setConnectedBaseUrl(url);
    if (nextIntent === 'create') {
      setScreen('createForm');
    } else {
      setScreen('joinLobby');
    }
  };

  const handleCreateRoom = () => {
    const n = playerName.trim();
    const dn = displayName.trim();
    if (!n || !dn) {
      setRoomActionError('Dê um nome à mesa e confira seu nome de jogador.');
      return;
    }
    const socket = useGameState.getState().socket;
    if (!socket) {
      setRoomActionError('Sem conexão.');
      return;
    }
    setRoomActionError(null);
    const onErr = (p: { message?: string }) => {
      socket.off('room_created', onCreated);
      setRoomActionError(p.message || 'Não foi possível criar a mesa.');
    };
    const onCreated = (p: { roomId: string }) => {
      socket.off('room_error', onErr);
      onEnterGame(p.roomId);
      onClose();
    };
    socket.once('room_error', onErr);
    socket.once('room_created', onCreated);
    createRoom(dn, n, createPassword.trim() || undefined);
  };

  const handleJoinRoom = () => {
    const n = playerName.trim();
    const code = roomCode.trim().toUpperCase();
    if (!n || !code) {
      setRoomActionError('Informe o código da mesa.');
      return;
    }
    const socket = useGameState.getState().socket;
    if (!socket) {
      setRoomActionError('Sem conexão.');
      return;
    }
    setRoomActionError(null);
    const onErr = (p: { message?: string }) => {
      socket.off('room_update', onOk);
      setRoomActionError(p.message || 'Não foi possível entrar.');
    };
    const onOk = (state: { roomId: string }) => {
      socket.off('room_error', onErr);
      onEnterGame(state.roomId);
      onClose();
    };
    socket.once('room_error', onErr);
    socket.once('room_update', onOk);
    joinRoom(code, n, joinPassword.trim() || undefined);
  };

  const pickListedRoom = (r: LobbyRoomSummary) => {
    setRoomCode(r.roomId);
    setRoomActionError(null);
    if (!r.hasPassword) {
      setJoinPassword('');
    }
  };

  /** Volta para escolher Wi‑Fi / Internet (desconecta). */
  const backToTransport = () => {
    disconnectOnline();
    setConnectedBaseUrl(null);
    setLobbyRooms([]);
    setRoomActionError(null);
    setScreen('transport');
  };

  /** Volta ao primeiro passo (Criar / Entrar). */
  const backToIntro = () => {
    disconnectOnline();
    setConnectedBaseUrl(null);
    setLobbyRooms([]);
    setIntent(null);
    setTransport(null);
    setRoomActionError(null);
    setScreen('intro');
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { paddingBottom: Math.max(16, insets.bottom + 12) },
          ]}
        >
          <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={12}>
            <X color={Theme.colors.textMuted} size={20} />
          </Pressable>

          {screen === 'intro' && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scroll}
            >
              <Text style={styles.title}>JOGAR COM AMIGOS</Text>
              <Text style={styles.sub}>
                Primeiro escolha: você abre uma mesa de espera ou entra em uma
                que já existe.
              </Text>

              {connectionError ? (
                <View style={styles.warnBox}>
                  <Text style={styles.warnBody}>{connectionError}</Text>
                  <Pressable
                    style={styles.retryBtn}
                    onPress={() => setConnectionError(null)}
                  >
                    <Text style={styles.retryText}>Ok</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                style={styles.optionCard}
                onPress={() => {
                  setIntent('create');
                  setConnectionError(null);
                  setScreen('transport');
                }}
              >
                <CirclePlus color={Theme.colors.gold} size={26} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>Criar uma mesa</Text>
                  <Text style={styles.optionDesc}>
                    Você define nome e senha (opcional) e fica no saguão até
                    começar.
                  </Text>
                </View>
                <ChevronRight color={Theme.colors.gold} size={20} />
              </Pressable>

              <Pressable
                style={styles.optionCard}
                onPress={() => {
                  setIntent('join');
                  setConnectionError(null);
                  setScreen('transport');
                }}
              >
                <LogIn color={Theme.colors.info} size={26} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>Entrar em uma mesa</Text>
                  <Text style={styles.optionDesc}>
                    Conectamos e mostramos as mesas abertas; ou use o código.
                  </Text>
                </View>
                <ChevronRight color={Theme.colors.gold} size={20} />
              </Pressable>

              <View style={styles.socialCard}>
                <View style={styles.socialRow}>
                  <Mic color={Theme.colors.textMuted} size={16} />
                  <Shield color={Theme.colors.textMuted} size={16} />
                </View>
                <Text style={styles.socialTitle}>Voz, texto e segurança</Text>
                <Text style={styles.socialBody}>
                  Em breve: conversar na sala, silenciar jogadores e moderação.
                </Text>
              </View>
            </ScrollView>
          )}

          {screen === 'transport' && intent && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scroll}
            >
              <Pressable style={styles.backLink} onPress={backToIntro}>
                <Text style={styles.backLinkText}>← Voltar</Text>
              </Pressable>

              <Text style={styles.title}>
                {intent === 'create' ? 'CRIAR MESA' : 'ENTRAR NA MESA'}
              </Text>
              <Text style={styles.sub}>
                Onde está o servidor do jogo?
              </Text>

              {connectionError ? (
                <View style={styles.warnBox}>
                  <Text style={styles.warnBody}>{connectionError}</Text>
                  <Pressable
                    style={styles.retryBtn}
                    onPress={() => setConnectionError(null)}
                  >
                    <Text style={styles.retryText}>Ok</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                style={styles.optionCard}
                onPress={() => void runConnect('local', intent)}
              >
                <Wifi color={Theme.colors.gold} size={26} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>Mesma rede (Wi‑Fi)</Text>
                  <Text style={styles.optionDesc}>
                    Celular e computador no mesmo Wi‑Fi.
                  </Text>
                </View>
                <ChevronRight color={Theme.colors.gold} size={20} />
              </Pressable>

              <Pressable
                style={styles.optionCard}
                onPress={() => void runConnect('internet', intent)}
              >
                <Globe color={Theme.colors.info} size={26} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>Internet</Text>
                  <Text style={styles.optionDesc}>
                    Servidor online — jogue de qualquer lugar.
                  </Text>
                </View>
                <ChevronRight color={Theme.colors.gold} size={20} />
              </Pressable>
            </ScrollView>
          )}

          {screen === 'busy' && (
            <View style={styles.busyWrap}>
              <ActivityIndicator color={Theme.colors.gold} size="large" />
              <Text style={styles.busyText}>{busyHint}</Text>
            </View>
          )}

          {screen === 'createForm' && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scroll}
            >
              <Pressable style={styles.backLink} onPress={backToTransport}>
                <Text style={styles.backLinkText}>← Voltar</Text>
              </Pressable>

              <Text style={styles.title}>MESA DE ESPERA</Text>
              <Text style={styles.sub}>
                Preencha e confirme. Quem escolher “Entrar” verá sua mesa na
                lista (mesmo fluxo em Wi‑Fi ou Internet).
              </Text>

              <Text style={styles.sectionLbl}>Nome da mesa</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Ex.: Mesa da Torre"
                placeholderTextColor={Theme.colors.textMuted}
                maxLength={48}
              />

              <Text style={styles.sectionLbl}>Senha (opcional)</Text>
              <TextInput
                style={styles.input}
                value={createPassword}
                onChangeText={setCreatePassword}
                placeholder="Só se quiser fechar a mesa"
                placeholderTextColor={Theme.colors.textMuted}
                secureTextEntry
                maxLength={64}
              />

              <Text style={styles.hintMuted}>
                Seu nome na partida:{' '}
                <Text style={styles.hintStrong}>
                  {playerName.trim() || '—'}
                </Text>
              </Text>

              <Pressable style={styles.primaryWrap} onPress={handleCreateRoom}>
                <LinearGradient
                  colors={[
                    Theme.colors.goldHigh,
                    Theme.colors.gold,
                    Theme.colors.goldSoft,
                  ]}
                  style={styles.primaryBtn}
                >
                  <Users color="#1A1306" size={18} />
                  <Text style={styles.primaryText}>ABRIR MESA DE ESPERA</Text>
                </LinearGradient>
              </Pressable>

              {roomActionError ? (
                <Text style={styles.errorText}>{roomActionError}</Text>
              ) : null}
            </ScrollView>
          )}

          {screen === 'joinLobby' && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scroll}
            >
              <Pressable style={styles.backLink} onPress={backToTransport}>
                <Text style={styles.backLinkText}>← Voltar</Text>
              </Pressable>

              <Text style={styles.title}>ENTRAR</Text>
              <Text style={styles.sub}>
                Toque numa mesa ou digite o código que o anfitrião passou.
              </Text>

              <View style={styles.refreshRow}>
                <Pressable
                  style={styles.refreshBtn}
                  onPress={() => void refreshRooms()}
                  disabled={roomsLoading}
                >
                  <RefreshCw
                    size={14}
                    color={Theme.colors.gold}
                    style={roomsLoading ? { opacity: 0.5 } : undefined}
                  />
                  <Text style={styles.refreshText}>
                    {roomsLoading ? 'Buscando mesas…' : 'Atualizar lista'}
                  </Text>
                </Pressable>
              </View>

              {lobbyRooms.length > 0 ? (
                <View style={styles.listBox}>
                  <Text style={styles.listHint}>Mesas disponíveis</Text>
                  {lobbyRooms.map((item) => (
                    <Pressable
                      key={item.roomId}
                      style={({ pressed }) => [
                        styles.roomRow,
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => pickListedRoom(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.roomRowTitle} numberOfLines={1}>
                          {item.displayName}
                        </Text>
                        <Text style={styles.roomRowMeta}>
                          {item.players}/{item.maxPlayers} jogadores
                          {item.inGame ? ' · Em jogo' : ' · Aguardando'}
                          {item.hasPassword ? ' · Com senha' : ''}
                        </Text>
                      </View>
                      <Text style={styles.roomRowCode}>{item.roomId}</Text>
                      <ChevronRight color={Theme.colors.gold} size={18} />
                    </Pressable>
                  ))}
                </View>
              ) : !roomsLoading ? (
                <Text style={styles.emptyList}>
                  Nenhuma mesa listada ainda. Peça o código ao anfitrião ou
                  atualize em instantes.
                </Text>
              ) : null}

              <Text style={styles.sectionLbl}>Código da mesa</Text>
              <View style={styles.joinRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={roomCode}
                  onChangeText={(t) => setRoomCode(t.toUpperCase())}
                  placeholder="CÓDIGO"
                  placeholderTextColor={Theme.colors.textMuted}
                  autoCapitalize="characters"
                  maxLength={8}
                />
                <Pressable style={styles.joinBtn} onPress={handleJoinRoom}>
                  <DoorOpen color={Theme.colors.text} size={14} />
                  <Text style={styles.joinBtnText}>ENTRAR</Text>
                </Pressable>
              </View>
              <TextInput
                style={styles.input}
                value={joinPassword}
                onChangeText={setJoinPassword}
                placeholder="Senha (se a mesa tiver)"
                placeholderTextColor={Theme.colors.textMuted}
                secureTextEntry
                maxLength={64}
              />

              {roomActionError ? (
                <Text style={styles.errorText}>{roomActionError}</Text>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 14,
  },
  card: {
    maxHeight: '94%',
    borderRadius: Theme.radius.lg,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    paddingTop: 18,
    paddingHorizontal: 14,
  },
  closeBtn: {
    position: 'absolute',
    right: 10,
    top: 10,
    zIndex: 2,
    padding: 6,
  },
  title: {
    fontFamily: Theme.fonts.serif,
    color: Theme.colors.gold,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 6,
    textAlign: 'center',
  },
  sub: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  scroll: { paddingBottom: 12 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceHigh,
  },
  optionTitle: {
    color: Theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  optionDesc: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  warnBox: {
    padding: 12,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
    backgroundColor: 'rgba(168,58,58,0.12)',
    marginBottom: 12,
    gap: 8,
  },
  warnBody: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  retryBtn: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
  retryText: {
    color: Theme.colors.gold,
    fontSize: 12,
    fontWeight: '900',
  },
  socialCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    justifyContent: 'center',
  },
  socialTitle: {
    color: Theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
  },
  socialBody: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
  },
  busyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 16,
  },
  busyText: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  backLink: { marginBottom: 10, alignSelf: 'flex-start' },
  backLinkText: {
    color: Theme.colors.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  refreshRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  refreshText: {
    color: Theme.colors.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  listBox: {
    marginBottom: 14,
  },
  listHint: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceHigh,
    marginBottom: 8,
  },
  roomRowTitle: {
    color: Theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  roomRowMeta: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  roomRowCode: {
    color: Theme.colors.gold,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  emptyList: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 14,
  },
  sectionLbl: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 4,
  },
  hintMuted: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginBottom: 14,
  },
  hintStrong: {
    color: Theme.colors.text,
    fontWeight: '800',
  },
  input: {
    backgroundColor: Theme.colors.surfaceHigh,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  errorText: {
    color: Theme.colors.error,
    fontSize: 11,
    marginBottom: 8,
  },
  primaryWrap: {
    borderRadius: Theme.radius.md,
    overflow: 'hidden',
    marginBottom: 12,
    ...Theme.shadows.goldGlow,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  primaryText: {
    color: '#1A1306',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  joinRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Theme.radius.md,
    backgroundColor: Theme.colors.surfaceHigh,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  joinBtnText: {
    color: Theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
  },
});
