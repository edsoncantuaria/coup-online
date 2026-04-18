import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Shield, Sword, Crown, Users, History, User } from 'lucide-react-native';

const CARD_DATA: Record<string, any> = {
  duke: { name: 'Duque', color: '#8E1616', icon: Crown, desc: 'Impostos (3 moedas) e bloqueia ajuda externa.' },
  assassin: { name: 'Assassino', color: '#1A1F24', icon: Sword, desc: 'Pague 3 moedas para eliminar um nobre.' },
  captain: { name: 'Capitão', color: '#2D333B', icon: Shield, desc: 'Extorque 2 moedas.' },
  ambassador: { name: 'Embaixador', color: '#D4AF37', icon: History, desc: 'Troque cartas com o Baralho.' },
  contessa: { name: 'Condessa', color: '#4A5568', icon: User, desc: 'Bloqueia o Assassino.' },
};

interface CardProps {
  role: 'duke' | 'assassin' | 'captain' | 'ambassador' | 'contessa' | string;
  isFlipped: boolean;
  isDead: boolean;
  style?: any;
}

export default function Card({ role, isFlipped, isDead, style }: CardProps) {
  const data = CARD_DATA[role] || { name: '???', color: '#30363D', icon: User, desc: '' };
  const Icon = data.icon;

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

  return (
    <View style={[styles.container, style]}>
      {/* Front of the Card (Hidden when flipped/revealed) */}
      <Animated.View style={[styles.card, styles.cardFront, frontAnimatedStyle]}>
        <View style={styles.ornament} />
        <Shield color="#D4AF37" size={50} opacity={0.6} strokeWidth={1} />
        <Text style={styles.houseText}>SEGREDO</Text>
      </Animated.View>

      {/* Back of the Card (Revealed face) */}
      <Animated.View style={[styles.card, styles.cardBack, backAnimatedStyle, { borderColor: isDead ? '#666' : data.color }, isDead && styles.dead]}>
        <View style={[styles.header, { backgroundColor: isDead ? '#30363D' : data.color }]}>
          <Text style={[styles.roleName, isDead && { color: '#8B949E' }]}>{data.name}</Text>
        </View>
        <View style={styles.body}>
          <Icon color={isDead ? '#666' : '#EADDCA'} size={48} strokeWidth={1} />
          {isDead && (
            <View style={styles.deadOverlay}>
              <Text style={styles.deceasedText}>CAÍDO</Text>
            </View>
          )}
        </View>
        <View style={[styles.footer, isDead && { backgroundColor: '#1A1F24' }]}>
          <Text style={[styles.desc, isDead && { color: '#8B949E' }]}>{data.desc}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 140,
    height: 200,
  },
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: '#151A1F',
    borderRadius: 12,
    borderWidth: 2,
    position: 'absolute',
    backfaceVisibility: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  cardFront: {
    backgroundColor: '#0F1318',
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ornament: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    margin: 8,
    borderRadius: 8,
  },
  houseText: {
    color: '#D4AF37',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    marginTop: 20,
    opacity: 0.8,
  },
  cardBack: {
    backgroundColor: '#1A1F24',
  },
  header: {
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#0F1318',
  },
  roleName: {
    color: '#EADDCA',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  body: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151A1F',
  },
  deadOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(142, 22, 22, 0.9)',
    transform: [{ rotate: '-15deg' }],
    paddingHorizontal: 15,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A0808',
  },
  deceasedText: {
    color: '#EADDCA',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  footer: {
    flex: 1,
    padding: 10,
    backgroundColor: '#0F1318',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#30363D',
  },
  desc: {
    fontSize: 10,
    textAlign: 'center',
    color: '#A1ADC1',
    fontWeight: '600',
    lineHeight: 14,
  },
  dead: {
    borderColor: '#444',
  }
});
