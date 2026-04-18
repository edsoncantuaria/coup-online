import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, ImageSourcePropType } from 'react-native';
import { Shield, Sword, Crown, History, User, LucideIcon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme } from '../constants/Theme';

interface CardData {
  name: string;
  subtitle: string;
  colors: [string, string];
  accent: string;
  icon: LucideIcon;
  desc: string;
  art: ImageSourcePropType;
}

const CARD_DATA: Record<string, CardData> = {
  duke: {
    name: 'Duque',
    subtitle: 'Duke Rafael',
    colors: ['#7A1F1F', '#3F0A0A'],
    accent: '#E7B197',
    icon: Crown,
    desc: 'Receba 3 moedas',
    art: require('../assets/cards/duke.png'),
  },
  assassin: {
    name: 'Assassino',
    subtitle: 'The Shadow',
    colors: ['#1F1730', '#0D0618'],
    accent: '#B39AD9',
    icon: Sword,
    desc: 'Pague 3 moedas · elimina 1 carta',
    art: require('../assets/cards/assassin.png'),
  },
  captain: {
    name: 'Capitão',
    subtitle: 'Captain Volk',
    colors: ['#1E3A52', '#0A1624'],
    accent: '#8FB8D8',
    icon: Shield,
    desc: 'Roube 2 moedas de um oponente',
    art: require('../assets/cards/captain.png'),
  },
  ambassador: {
    name: 'Embaixador',
    subtitle: 'The Envoy',
    colors: ['#8C6F3D', '#4A3A1E'],
    accent: '#F2D68A',
    icon: History,
    desc: 'Troque cartas com o baralho',
    art: require('../assets/cards/ambassador.png'),
  },
  contessa: {
    name: 'Condessa',
    subtitle: 'The Lady',
    colors: ['#3A3448', '#1B1724'],
    accent: '#DCD4E6',
    icon: User,
    desc: 'Bloqueia um assassinato',
    art: require('../assets/cards/contessa.png'),
  },
};

interface CardProps {
  role: string;
  isFlipped: boolean;
  isDead: boolean;
  style?: any;
}

export default function Card({ role, isFlipped, isDead, style }: CardProps) {
  const data = CARD_DATA[role];

  const flipAnim = useRef(new Animated.Value(isFlipped ? 180 : 0)).current;

  useEffect(() => {
    Animated.spring(flipAnim, {
      toValue: isFlipped ? 180 : 0,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
  }, [isFlipped]);

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['0deg', '180deg'],
  });
  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 180],
    outputRange: ['180deg', '360deg'],
  });

  const frontAnimatedStyle = { transform: [{ rotateY: frontInterpolate }] };
  const backAnimatedStyle = { transform: [{ rotateY: backInterpolate }] };

  const Icon = data?.icon ?? User;

  return (
    <View style={[styles.container, style]}>
      {/* Frente (segredo) */}
      <Animated.View style={[styles.card, styles.cardFront, frontAnimatedStyle]}>
        <LinearGradient
          colors={['#1C2431', '#0C1219']}
          style={styles.gradient}
        >
          <View style={styles.frontOrnament}>
            <View style={styles.ornamentLine} />
            <Shield color={Theme.colors.gold} size={44} strokeWidth={1} opacity={0.55} />
            <View style={styles.ornamentLine} />
          </View>
          <Text style={styles.secretText}>SEGREDO REAL</Text>
        </LinearGradient>
      </Animated.View>

      {/* Verso (revelada) - com arte */}
      <Animated.View
        style={[
          styles.card,
          styles.cardBack,
          backAnimatedStyle,
          isDead && styles.deadBorder,
        ]}
      >
        {data ? (
          <View style={styles.artContainer}>
            <Image source={data.art} style={styles.artImage} resizeMode="cover" />

            {/* Gradiente para legibilidade (topo + base) */}
            <LinearGradient
              colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
              locations={[0, 0.28, 0.55, 1]}
              style={StyleSheet.absoluteFill}
            />

            {/* Moldura dourada interna */}
            <View style={styles.innerFrame} pointerEvents="none" />

            {/* Header: selo de cor do personagem */}
            <View style={styles.artHeader}>
              <View style={[styles.miniBadge, { backgroundColor: data.colors[0] }]}>
                <Icon color="#FFF" size={11} strokeWidth={2} />
              </View>
              <Text style={styles.subtitleText}>{data.subtitle.toUpperCase()}</Text>
            </View>

            {/* Banner de nome (bottom) */}
            <View style={styles.banner}>
              <LinearGradient
                colors={[data.colors[1], data.colors[0], data.colors[1]]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.bannerGradient}
              >
                <Text style={styles.bannerName}>{data.name.toUpperCase()}</Text>
                <Text style={styles.bannerDesc} numberOfLines={2}>
                  {data.desc}
                </Text>
              </LinearGradient>
            </View>

            {/* Overlay de morte */}
            {isDead && (
              <>
                <View style={styles.deadDim} />
                <View style={styles.deadOverlay}>
                  <Text style={styles.deadText}>ELIMINADO</Text>
                </View>
              </>
            )}
          </View>
        ) : (
          <LinearGradient
            colors={['#30363D', '#1A1F24']}
            style={styles.gradient}
          >
            <Text style={styles.secretText}>???</Text>
          </LinearGradient>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 140,
    height: 200,
    ...Theme.shadows.premium,
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    position: 'absolute',
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  cardFront: {
    borderColor: Theme.colors.goldLine,
  },
  cardBack: {
    borderColor: 'rgba(198, 161, 91, 0.55)',
    backgroundColor: '#0B0F14',
  },
  deadBorder: {
    borderColor: Theme.colors.imperialRed,
    opacity: 0.85,
  },

  // Front
  gradient: {
    flex: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frontOrnament: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 16,
  },
  ornamentLine: {
    width: 38,
    height: 1,
    backgroundColor: Theme.colors.goldLine,
  },
  secretText: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 3,
    opacity: 0.7,
    marginBottom: 6,
  },

  // Back art
  artContainer: {
    flex: 1,
    backgroundColor: '#0B0F14',
  },
  artImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  innerFrame: {
    ...StyleSheet.absoluteFillObject,
    margin: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(198, 161, 91, 0.35)',
  },
  artHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 6,
  },
  miniBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  subtitleText: {
    color: '#EADDCA',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    flex: 1,
  },
  banner: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  bannerGradient: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  bannerName: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bannerDesc: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 0.4,
    textAlign: 'center',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  deadDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 5, 5, 0.55)',
  },
  deadOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    backgroundColor: Theme.colors.imperialRed,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 4,
    transform: [{ rotate: '-8deg' }],
    borderWidth: 1,
    borderColor: '#FFF',
  },
  deadText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
