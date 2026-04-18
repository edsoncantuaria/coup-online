import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { X, Skull, Shield, Sword, Crown, History, User, LucideIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameState } from '../hooks/useGameState';
import { translateRole } from '../utils/translations';
import { Theme } from '../constants/Theme';

interface GraveyardViewProps {
  visible: boolean;
  onClose: () => void;
}

const ROLE_META: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  duke: { icon: Crown, color: '#E7B197', bg: '#7A1F1F' },
  assassin: { icon: Sword, color: '#B39AD9', bg: '#1F1730' },
  captain: { icon: Shield, color: '#8FB8D8', bg: '#1E3A52' },
  ambassador: { icon: History, color: '#F2D68A', bg: '#8C6F3D' },
  contessa: { icon: User, color: '#DCD4E6', bg: '#3A3448' },
};

export default function GraveyardView({ visible, onClose }: GraveyardViewProps) {
  const getGraveyardStats = useGameState((state) => state.getGraveyardStats);

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.back(1.3)),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacityAnim.setValue(0);
      scaleAnim.setValue(0.96);
    }
  }, [visible]);

  if (!visible) return null;

  const stats = getGraveyardStats();

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onClose}
      />
      <Animated.View
        style={[
          styles.alertBox,
          { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconBox}>
              <Skull color={Theme.colors.gold} size={18} strokeWidth={1.8} />
            </View>
            <View>
              <Text style={styles.title}>CRIPTA REAL</Text>
              <Text style={styles.subtitle}>
                Influências tombadas · adivinhe o que resta
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={10}
          >
            <X color={Theme.colors.textSecondary} size={16} />
          </TouchableOpacity>
        </View>

        {/* Grid horizontal de influências */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollRow}
        >
          {stats.map((stat, i) => {
            const meta = ROLE_META[stat.role] || {
              icon: User,
              color: Theme.colors.gold,
              bg: Theme.colors.surface,
            };
            const Icon = meta.icon;
            const totalInDeck = 3; // Coup standard: 3 cópias de cada
            const knownDead = stat.dead;
            return (
              <View key={i} style={styles.roleCard}>
                <LinearGradient
                  colors={[meta.bg, '#0E1218']}
                  style={styles.roleGradient}
                >
                  <View
                    style={[
                      styles.roleIconBox,
                      { borderColor: 'rgba(255,255,255,0.25)' },
                    ]}
                  >
                    <Icon color="#FFF" size={20} strokeWidth={1.6} />
                  </View>

                  <Text style={styles.roleName}>
                    {translateRole(stat.role).toUpperCase()}
                  </Text>

                  {/* Pips de status */}
                  <View style={styles.pipsRow}>
                    {Array.from({ length: totalInDeck }).map((_, idx) => {
                      const isDead = idx < knownDead;
                      return (
                        <View
                          key={idx}
                          style={[
                            styles.pip,
                            isDead ? styles.pipDead : styles.pipAlive,
                          ]}
                        >
                          {isDead && (
                            <Text style={styles.pipX}>×</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.countsRow}>
                    <View style={styles.countItem}>
                      <Text style={styles.countValue}>{stat.dead}</Text>
                      <Text style={styles.countLabel}>CAÍDOS</Text>
                    </View>
                    <View style={styles.countDivider} />
                    <View style={styles.countItem}>
                      <Text
                        style={[
                          styles.countValue,
                          { color: Theme.colors.gold },
                        ]}
                      >
                        {stat.remaining}
                      </Text>
                      <Text style={styles.countLabel}>EM JOGO</Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    zIndex: 3000,
  },
  alertBox: {
    backgroundColor: Theme.colors.surface,
    width: '100%',
    maxWidth: 820,
    maxHeight: '92%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Theme.colors.goldLine,
    ...Theme.shadows.premium,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(198, 161, 91, 0.1)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
  },
  title: {
    color: Theme.colors.gold,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 3,
  },
  subtitle: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
    fontStyle: 'italic',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.surfaceHigh,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },

  scrollRow: {
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  roleCard: {
    width: 130,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Theme.shadows.soft,
  },
  roleGradient: {
    padding: 10,
    alignItems: 'center',
  },
  roleIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    marginBottom: 8,
  },
  roleName: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  pipsRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 10,
  },
  pip: {
    width: 18,
    height: 24,
    borderRadius: 3,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipAlive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.45)',
  },
  pipDead: {
    backgroundColor: 'rgba(168, 58, 58, 0.45)',
    borderColor: Theme.colors.imperialRed,
  },
  pipX: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 15,
  },
  countsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    width: '100%',
    justifyContent: 'center',
  },
  countItem: {
    alignItems: 'center',
    minWidth: 34,
  },
  countDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  countValue: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
  },
  countLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: 2,
  },
});
