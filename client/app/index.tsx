import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  SlideInLeft,
  SlideInRight,
} from 'react-native-reanimated';
import {
  Users,
  Crown,
  Swords,
  ChevronRight,
  BookOpen,
  Shield,
  Sparkles,
  DoorOpen,
  Volume2,
  VolumeX,
  Trophy,
} from 'lucide-react-native';
import { useGameState } from '../hooks/useGameState';
import CourtAlert from '../components/CourtAlert';
import RulesView from '../components/RulesView';
import CommanderStatsPanel from '../components/lobby/CommanderStatsPanel';
import MatchHistoryModal from '../components/lobby/MatchHistoryModal';
import DifficultyModal from '../components/lobby/DifficultyModal';
import { Theme } from '../constants/Theme';
import {
  storage,
  getMatchHistory,
  clearMatchHistory,
  aggregateHistory,
  getDifficulty,
  setDifficulty,
  type MatchHistoryEntry,
  type HistoryAggregate,
  type BotPersonality,
  type DifficultyConfig,
} from '../utils/storage';
import { setMuted as setSoundMuted } from '../utils/sound';

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState('Nobre da Corte');
  const [room, setRoom] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [muted, setMuted] = useState(false);
  const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
  const [aggregate, setAggregate] = useState<HistoryAggregate>(
    aggregateHistory([])
  );
  const [showDifficulty, setShowDifficulty] = useState(false);
  const [difficulty, setDifficultyState] = useState<DifficultyConfig>({
    bots: 3,
    personalities: ['balanced', 'balanced', 'balanced'],
  });
  const { joinRoom, startOfflineCampaign } = useGameState();

  const reloadHistory = React.useCallback(async () => {
    const list = await getMatchHistory();
    setHistory(list);
    setAggregate(aggregateHistory(list));
  }, []);

  // Recarrega histórico toda vez que a tela entra em foco (após uma partida)
  useFocusEffect(
    React.useCallback(() => {
      reloadHistory();
    }, [reloadHistory])
  );

  // Carrega preferências persistidas
  useEffect(() => {
    (async () => {
      const saved = await storage.getPlayerName();
      if (saved && saved.trim()) setName(saved);
      const m = await storage.getMuted();
      setMuted(m);
      setSoundMuted(m);
      const diff = await getDifficulty();
      if (diff) setDifficultyState(diff);
    })();
  }, []);

  // Persiste o nome ao alterar (debounced simples via effect)
  useEffect(() => {
    if (!name.trim()) return;
    const t = setTimeout(() => storage.setPlayerName(name.trim()), 350);
    return () => clearTimeout(t);
  }, [name]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
    storage.setMuted(next);
  };

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: '', message: '' });

  // Animated glow do título
  const glow = useSharedValue(0);
  const emblemRotate = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    emblemRotate.value = withRepeat(
      withTiming(1, { duration: 22000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const titleGlowStyle = useAnimatedStyle(() => ({
    textShadowRadius: 8 + glow.value * 18,
    opacity: 0.9 + glow.value * 0.1,
  }));

  const emblemStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${emblemRotate.value * 360}deg` }],
  }));

  const handleCreate = () => {
    if (!name.trim()) {
      setAlertConfig({
        visible: true,
        title: 'O Código de Honra',
        message: 'Grave o seu nome antes de reunir um conselho.',
      });
      return;
    }
    const newRoom = Math.random().toString(36).substring(7).toUpperCase();
    joinRoom(newRoom, name);
    router.push(`/game/${newRoom}`);
  };

  const handleJoin = () => {
    if (!name.trim() || !room.trim()) {
      setAlertConfig({
        visible: true,
        title: 'Portões Fechados',
        message:
          'Você deve apresentar um Nome e o Selo Real (Código) para entrar.',
      });
      return;
    }
    joinRoom(room, name);
    router.push(`/game/${room}`);
  };

  const handleOffline = () => {
    setShowDifficulty(true);
  };

  const handleStartCampaign = async (cfg: {
    bots: number;
    personalities: BotPersonality[];
  }) => {
    const next: DifficultyConfig = {
      bots: cfg.bots,
      personalities: cfg.personalities,
    };
    setDifficultyState(next);
    await setDifficulty(next);
    setShowDifficulty(false);
    const offlineName = name.trim() || 'Nobre Solitário';
    startOfflineCampaign(offlineName, cfg.personalities);
    router.push('/game/OFFLINE');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden />

      {/* Background layered */}
      <LinearGradient
        colors={['#0B0F14', '#0F1520', '#070A0F']}
        style={StyleSheet.absoluteFill}
      />

      {/* Ornamental emblem rotating in bg */}
      <Animated.View
        style={[styles.emblemBg, emblemStyle]}
        pointerEvents="none"
      >
        <View style={styles.emblemRing} />
        <View style={[styles.emblemRing, styles.emblemRingInner]} />
        <Crown
          color="rgba(198, 161, 91, 0.08)"
          size={220}
          strokeWidth={1}
        />
      </Animated.View>

      {/* Top trim */}
      <LinearGradient
        colors={['transparent', Theme.colors.gold, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topTrim}
      />

      <View
        style={[
          styles.layout,
          { paddingTop: Math.max(insets.top, 8), paddingBottom: insets.bottom },
        ]}
      >
        {/* COLUNA ESQUERDA — Hero */}
        <Animated.View
          entering={SlideInLeft.duration(700).springify()}
          style={styles.heroCol}
        >
          <View style={styles.heroBadge}>
            <Sparkles color={Theme.colors.gold} size={11} />
            <Text style={styles.heroBadgeText}>THE ROYAL COURT</Text>
          </View>

          <Animated.Text style={[styles.title, titleGlowStyle]}>
            COUP
          </Animated.Text>

          <View style={styles.titleUnderline} />

          <Text style={styles.tagline}>
            Blefe, intriga e honra na corte das máscaras.
          </Text>

          <Text style={styles.flavor}>
            "A traição é a única moeda que nunca perde o valor."
          </Text>

          <View style={styles.heroFooterRow}>
            <Pressable
              style={({ pressed }) => [
                styles.ghostBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setShowRules(true)}
            >
              <BookOpen color={Theme.colors.gold} size={13} />
              <Text style={styles.ghostBtnText}>COMPÊNDIO</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.ghostBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={() => setShowHistory(true)}
              accessibilityLabel="Ver histórico de partidas"
            >
              <Trophy color={Theme.colors.gold} size={13} />
              <Text style={styles.ghostBtnText}>HISTÓRICO</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.ghostBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={toggleMute}
              accessibilityLabel={muted ? 'Desmutar' : 'Mutar'}
            >
              {muted ? (
                <VolumeX color={Theme.colors.gold} size={13} />
              ) : (
                <Volume2 color={Theme.colors.gold} size={13} />
              )}
              <Text style={styles.ghostBtnText}>
                {muted ? 'SILENCIADO' : 'SOM ATIVO'}
              </Text>
            </Pressable>
          </View>

          <CommanderStatsPanel
            aggregate={aggregate}
            recent={history}
            onOpenHistory={() => setShowHistory(true)}
          />
        </Animated.View>

        {/* COLUNA DIREITA — Ações */}
        <Animated.View
          entering={SlideInRight.duration(700).springify()}
          style={styles.formCol}
        >
          {/* Nome */}
          <View style={styles.fieldBlock}>
            <View style={styles.fieldHeader}>
              <Shield color={Theme.colors.gold} size={11} />
              <Text style={styles.fieldLabel}>SUA IDENTIDADE</Text>
            </View>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Ex. Sir Arthur"
                placeholderTextColor={Theme.colors.textMuted}
                maxLength={24}
              />
            </View>
          </View>

          {/* Botão principal — OFFLINE */}
          <Pressable
            onPress={handleOffline}
            style={({ pressed }) => [
              styles.primaryBtnWrap,
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
          >
            <LinearGradient
              colors={[Theme.colors.goldHigh, Theme.colors.gold, Theme.colors.goldSoft]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryBtn}
            >
              <View style={styles.primaryIconBox}>
                <Swords color="#1A1306" size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.primaryBtnTitle}>INICIAR CAMPANHA</Text>
                <Text style={styles.primaryBtnSub}>
                  Modo Solitário · Enfrente a IA da Corte
                </Text>
              </View>
              <ChevronRight color="#1A1306" size={20} />
            </LinearGradient>
          </Pressable>

          {/* Divisor */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OU ENCONTRO DE NOBRES</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Online actions row */}
          <View style={styles.onlineRow}>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={room}
                onChangeText={(t) => setRoom(t.toUpperCase())}
                placeholder="CÓD. SALA"
                placeholderTextColor={Theme.colors.textMuted}
                autoCapitalize="characters"
                maxLength={8}
              />
            </View>

            <Pressable
              onPress={handleJoin}
              style={({ pressed }) => [
                styles.joinBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <DoorOpen color={Theme.colors.text} size={14} />
              <Text style={styles.joinBtnText}>INVASÃO</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={handleCreate}
            style={({ pressed }) => [
              styles.createBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Users color={Theme.colors.gold} size={14} />
            <Text style={styles.createBtnText}>REUNIR O CONSELHO</Text>
            <ChevronRight color={Theme.colors.gold} size={16} />
          </Pressable>
        </Animated.View>
      </View>

      {/* Bottom trim */}
      <LinearGradient
        colors={['transparent', Theme.colors.goldSoft, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.bottomTrim}
      />

      <CourtAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
      />

      <RulesView visible={showRules} onClose={() => setShowRules(false)} />

      <MatchHistoryModal
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        history={history}
        aggregate={aggregate}
        onClear={async () => {
          await clearMatchHistory();
          await reloadHistory();
        }}
      />

      <DifficultyModal
        visible={showDifficulty}
        initialBots={difficulty.bots}
        initialPersonalities={difficulty.personalities}
        onClose={() => setShowDifficulty(false)}
        onStart={handleStartCampaign}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  emblemBg: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 420,
    height: 420,
    marginLeft: -210,
    marginTop: -210,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4,
  },
  emblemRing: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    borderWidth: 1,
    borderColor: 'rgba(198, 161, 91, 0.07)',
  },
  emblemRingInner: {
    width: 280,
    height: 280,
    borderRadius: 140,
    borderColor: 'rgba(198, 161, 91, 0.05)',
  },
  topTrim: {
    height: 2,
    width: '100%',
  },
  bottomTrim: {
    height: 2,
    width: '100%',
  },

  layout: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 20,
  },

  /* Hero (esquerda) */
  heroCol: {
    flex: 1.2,
    justifyContent: 'center',
    paddingRight: 10,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.radius.pill,
    backgroundColor: 'rgba(198, 161, 91, 0.1)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    marginBottom: 14,
  },
  heroBadgeText: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  title: {
    fontFamily: Theme.fonts.serif,
    color: Theme.colors.gold,
    fontSize: 92,
    fontWeight: '900',
    letterSpacing: -3,
    lineHeight: 92,
    textShadowColor: 'rgba(198, 161, 91, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
  },
  titleUnderline: {
    width: 90,
    height: 2,
    backgroundColor: Theme.colors.gold,
    marginTop: 6,
    marginBottom: 14,
  },
  tagline: {
    color: Theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
    maxWidth: 340,
    marginBottom: 10,
  },
  flavor: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
    letterSpacing: 0.4,
    maxWidth: 340,
    marginBottom: 18,
    lineHeight: 16,
  },
  heroFooterRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: 'rgba(198,161,91,0.06)',
  },
  ghostBtnText: {
    color: Theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
  },

  /* Formulário (direita) */
  formCol: {
    flex: 1,
    maxWidth: 420,
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    borderRadius: Theme.radius.lg,
    backgroundColor: 'rgba(11, 15, 20, 0.6)',
    ...Theme.shadows.premium,
  },
  fieldBlock: {
    marginBottom: 14,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  fieldLabel: {
    color: Theme.colors.gold,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 2,
  },
  inputWrapper: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.radius.md,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Theme.colors.text,
    fontWeight: '700',
  },
  codeInput: {
    textAlign: 'center',
    letterSpacing: 3,
    fontSize: 14,
  },

  /* Primary button */
  primaryBtnWrap: {
    borderRadius: Theme.radius.md,
    overflow: 'hidden',
    marginBottom: 14,
    ...Theme.shadows.goldGlow,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26, 19, 6, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(26, 19, 6, 0.35)',
  },
  primaryBtnTitle: {
    color: '#1A1306',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  primaryBtnSub: {
    color: '#3A2B0E',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 1,
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Theme.colors.goldLine,
  },
  dividerText: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },

  onlineRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Theme.radius.md,
    backgroundColor: Theme.colors.imperialRedDeep,
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
  },
  joinBtnText: {
    color: Theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: Theme.radius.md,
    backgroundColor: 'rgba(198, 161, 91, 0.06)',
    borderWidth: 1,
    borderColor: Theme.colors.gold,
  },
  createBtnText: {
    color: Theme.colors.gold,
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
});
