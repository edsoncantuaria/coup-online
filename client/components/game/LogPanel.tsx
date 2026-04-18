import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Scroll, X } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInRight,
  Layout,
} from 'react-native-reanimated';
import { Theme } from '../../constants/Theme';

const PANEL_WIDTH = 280;

interface LogPanelProps {
  logs: string[];
}

type LogKind = 'neutral' | 'bluff' | 'success' | 'failure' | 'info' | 'turn';

interface LogEntry {
  text: string;
  kind: LogKind;
  index: number;
  round: number;
}

function classifyLog(text: string): LogKind {
  const lower = text.toLowerCase();
  if (lower.includes('turno de')) return 'turn';
  if (
    lower.includes('blefando') ||
    lower.includes('reivindicou') ||
    lower.includes('duvidou') ||
    lower.includes('declarou') ||
    lower.includes('desafiou')
  ) {
    return 'bluff';
  }
  if (
    lower.includes('bem-sucedida') ||
    lower.includes('resolvida') ||
    lower.includes('revelou') ||
    lower.includes('sucesso') ||
    lower.includes('provou')
  ) {
    return 'success';
  }
  if (
    lower.includes('perdeu') ||
    lower.includes('falhou') ||
    lower.includes('eliminou') ||
    lower.includes('blefou') ||
    lower.includes('blefe') ||
    lower.includes('fim de jogo')
  ) {
    return 'failure';
  }
  return 'neutral';
}

const KIND_STYLES: Record<
  LogKind,
  { color: string; bar: string; bg: string }
> = {
  neutral: {
    color: Theme.colors.textSecondary,
    bar: Theme.colors.border,
    bg: 'rgba(161, 173, 193, 0.04)',
  },
  bluff: {
    color: Theme.colors.bluff,
    bar: Theme.colors.bluff,
    bg: Theme.colors.bluffSoft,
  },
  success: {
    color: Theme.colors.success,
    bar: Theme.colors.success,
    bg: Theme.colors.successSoft,
  },
  failure: {
    color: Theme.colors.error,
    bar: Theme.colors.error,
    bg: Theme.colors.errorSoft,
  },
  info: {
    color: Theme.colors.info,
    bar: Theme.colors.info,
    bg: 'rgba(110, 163, 216, 0.08)',
  },
  turn: {
    color: Theme.colors.gold,
    bar: Theme.colors.gold,
    bg: 'rgba(198, 161, 91, 0.08)',
  },
};

function parseTurnPlayer(text: string): string | null {
  const match = text.match(/turno de\s+(.+?)\s*$/i);
  if (match) return match[1].trim();
  return null;
}

export default function LogPanel({ logs }: LogPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const offset = useSharedValue(PANEL_WIDTH);
  const backdropOpacity = useSharedValue(0);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    offset.value = withSpring(isOpen ? 0 : PANEL_WIDTH, {
      damping: 22,
      stiffness: 120,
    });
    backdropOpacity.value = withSpring(isOpen ? 1 : 0, {
      damping: 20,
      stiffness: 120,
    });
  }, [isOpen]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Calcula rodada para cada log
  const { entries, currentRound } = useMemo(() => {
    let round = 1;
    let playersThisRound = new Set<string>();
    const out: LogEntry[] = logs.map((text, i) => {
      const kind = classifyLog(text);
      const turnName = parseTurnPlayer(text);
      if (turnName) {
        if (playersThisRound.has(turnName)) {
          round += 1;
          playersThisRound = new Set();
        }
        playersThisRound.add(turnName);
      }
      return { text, kind, index: i, round };
    });
    return { entries: out, currentRound: round };
  }, [logs]);

  // Agrupa por rodada
  const groupedByRound = useMemo(() => {
    const map = new Map<number, LogEntry[]>();
    entries.forEach((e) => {
      if (!map.has(e.round)) map.set(e.round, []);
      map.get(e.round)!.push(e);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [entries]);

  const lastLog = logs[logs.length - 1] || 'Aguardando início...';
  const lastKind = classifyLog(lastLog);

  return (
    <>
      {/* Botão compacto circular */}
      <Pressable
        style={({ pressed }) => [
          styles.floatingToggleButton,
          pressed && { opacity: 0.8 },
        ]}
        onPress={() => setIsOpen(true)}
        hitSlop={8}
      >
        <BlurView intensity={30} tint="dark" style={styles.buttonBlur}>
          <Scroll color={Theme.colors.gold} size={18} strokeWidth={1.8} />
          <View style={styles.roundBadge}>
            <Text style={styles.roundBadgeText}>R{currentRound}</Text>
          </View>
          {/* Dot colorido indicando última categoria */}
          <View
            style={[
              styles.lastKindDot,
              { backgroundColor: KIND_STYLES[lastKind].bar },
            ]}
          />
        </BlurView>
      </Pressable>

      {/* Backdrop — só renderiza quando aberto */}
      {isOpen && (
        <Animated.View
          style={[styles.backdrop, backdropStyle]}
          pointerEvents="auto"
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsOpen(false)}
          />
        </Animated.View>
      )}

      {/* Painel lateral */}
      <Animated.View
        style={[styles.container, panelStyle]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <BlurView intensity={45} tint="dark" style={styles.blurContainer}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Scroll color={Theme.colors.gold} size={16} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>CRÔNICAS DO REINO</Text>
                <Text style={styles.subtitle}>Rodada atual · {currentRound}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setIsOpen(false)}
              style={styles.closeBtn}
              hitSlop={12}
            >
              <X color={Theme.colors.textSecondary} size={18} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              scrollViewRef.current?.scrollToEnd({ animated: true })
            }
            contentContainerStyle={styles.scroll}
          >
            {groupedByRound.length === 0 && (
              <Text style={styles.emptyText}>Sem eventos ainda.</Text>
            )}
            {groupedByRound.map(([round, roundEntries]) => (
              <View key={round} style={styles.roundBlock}>
                <View style={styles.roundSeparator}>
                  <View style={styles.roundLine} />
                  <View style={styles.roundPill}>
                    <Text style={styles.roundPillText}>
                      RODADA {String(round).padStart(2, '0')}
                    </Text>
                  </View>
                  <View style={styles.roundLine} />
                </View>

                {roundEntries.map((entry) => {
                  const style = KIND_STYLES[entry.kind];
                  return (
                    <Animated.View
                      key={entry.index}
                      entering={FadeInRight.duration(220)}
                      layout={Layout.springify()}
                      style={[
                        styles.logItem,
                        {
                          backgroundColor: style.bg,
                          borderLeftColor: style.bar,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.logText,
                          { color: style.color },
                          entry.kind === 'turn' && { fontWeight: '900' },
                        ]}
                      >
                        {entry.text}
                      </Text>
                    </Animated.View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </BlurView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  floatingToggleButton: {
    position: 'absolute',
    right: 10,
    top: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    zIndex: 850,
    elevation: 12,
    ...Theme.shadows.soft,
  },
  buttonBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 15, 20, 0.6)',
  },
  roundBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    minWidth: 20,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: Theme.colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Theme.colors.background,
  },
  roundBadgeText: {
    color: Theme.colors.background,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  lastKindDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Theme.colors.background,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 900,
  },

  container: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    zIndex: 1000,
    borderLeftWidth: 1,
    borderLeftColor: Theme.colors.goldLine,
  },
  blurContainer: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 30,
    paddingBottom: 6,
    backgroundColor: 'rgba(11, 15, 20, 0.78)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  title: {
    color: Theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  subtitle: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  scroll: {
    paddingBottom: 30,
  },
  emptyText: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 30,
  },

  roundBlock: {
    marginBottom: 8,
  },
  roundSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 10,
  },
  roundLine: {
    flex: 1,
    height: 1,
    backgroundColor: Theme.colors.goldLine,
  },
  roundPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(198, 161, 91, 0.1)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
  },
  roundPillText: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },

  logItem: {
    marginBottom: 6,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 7,
    borderLeftWidth: 3,
    borderRadius: 6,
  },
  logText: {
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
