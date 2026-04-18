import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Shield, Sword, Crown, Users, History, User } from 'lucide-react-native';

const CARD_DATA = {
  duke: { name: 'Duque', color: '#8B0000', icon: Crown, desc: 'Coleta impostos (3 moedas) e bloqueia ajuda externa.' },
  assassin: { name: 'Assassino', color: '#2F4F4F', icon: Sword, desc: 'Pague 3 moedas para eliminar um nobre rival.' },
  captain: { name: 'Capitão', color: '#1E3A5F', icon: Shield, desc: 'Extorque 2 moedas de um oponente.' },
  ambassador: { name: 'Embaixador', color: '#B8860B', icon: History, desc: 'Troque suas cartas com o Baralho Real.' },
  contessa: { name: 'Condessa', color: '#556B2F', icon: User, desc: 'Bloqueia a adaga do Assassino.' },
};

interface CardProps {
  role: 'duke' | 'assassin' | 'captain' | 'ambassador' | 'contessa' | string;
  isFlipped: boolean;
  isDead: boolean;
  style?: any;
}

export default function Card({ role, isFlipped, isDead, style }: CardProps) {
  const data = CARD_DATA[role] || { name: '???', color: '#666', icon: User, desc: '' };
  const Icon = data.icon;

  if (!isFlipped && !isDead) {
    return (
      <View style={[styles.card, styles.back]}>
        <View style={styles.ornament} />
        <Shield color="#D4AF37" size={50} opacity={0.2} strokeWidth={1} />
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: data.color }, isDead && styles.dead, style]}>
      <View style={[styles.header, { backgroundColor: data.color }]}>
        <Text style={styles.roleName}>{data.name}</Text>
      </View>
      <View style={styles.body}>
        <Icon color={isDead ? '#666' : data.color} size={48} strokeWidth={1.5} />
        {isDead && (
            <View style={styles.deadOverlay}>
                <Text style={styles.deceasedText}>CAÍDO</Text>
            </View>
        )}
      </View>
      <View style={styles.footer}>
        <Text style={[styles.desc, isDead && { color: '#999' }]}>{data.desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 140,
    height: 200,
    backgroundColor: '#FFFBF0',
    borderRadius: 15,
    borderWidth: 3,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  back: {
    backgroundColor: '#2D1B13',
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ornament: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(212, 175, 55, 0.15)',
    margin: 8,
    borderRadius: 10,
    borderStyle: 'dashed',
  },
  header: {
    paddingVertical: 6,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  roleName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  body: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  deadOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(139, 0, 0, 0.8)',
    transform: [{ rotate: '-15deg' }],
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 5,
  },
  deceasedText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },
  footer: {
    flex: 1,
    padding: 10,
    backgroundColor: '#FDFDFD',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  desc: {
    fontSize: 10,
    textAlign: 'center',
    color: '#5C4033',
    fontWeight: '600',
    lineHeight: 14,
  },
  dead: {
    borderColor: '#666',
    backgroundColor: '#EAEAEA',
  }
});
