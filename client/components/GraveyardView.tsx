import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing } from 'react-native';
import { X, Skull } from 'lucide-react-native';
import { useGameState } from '../hooks/useGameState';
import { translateRole } from '../utils/translations';

interface GraveyardViewProps {
  visible: boolean;
  onClose: () => void;
}

export default function GraveyardView({ visible, onClose }: GraveyardViewProps) {
  const getGraveyardStats = useGameState(state => state.getGraveyardStats);

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 50,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const stats = getGraveyardStats();

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.alertBox, { opacity: opacityAnim, transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
          <X color="#A1ADC1" size={24} />
        </TouchableOpacity>

        <View style={styles.iconWrapper}>
          <Skull color="#D4AF37" size={36} strokeWidth={1.5} />
        </View>
        <Text style={styles.alertTitle}>CRIPTA REAL</Text>
        <Text style={styles.alertDesc}>Acompanhe as influências que já tombaram em batalha e tente adivinhar as verdades ocultas.</Text>
        
        <ScrollView style={{ width: '100%', maxHeight: 400 }} showsVerticalScrollIndicator={false}>
          {stats.map((stat, i) => (
            <View key={i} style={styles.statRow}>
               <View style={styles.roleInfo}>
                  <Text style={styles.roleName}>{translateRole(stat.role).toUpperCase()}</Text>
               </View>

               <View style={styles.countsBox}>
                  <View style={styles.countItem}>
                     <Text style={styles.countLabel}>MORTOS</Text>
                     <Text style={[styles.countValue, { color: '#8E1616' }]}>{stat.dead}</Text>
                  </View>
                  <View style={styles.countSeparator} />
                  <View style={styles.countItem}>
                     <Text style={styles.countLabel}>VIVOS</Text>
                     <Text style={[styles.countValue, { color: '#D4AF37' }]}>{stat.remaining}</Text>
                  </View>
               </View>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'rgba(0,0,0,0.85)', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 25, 
    zIndex: 3000 
  },
  alertBox: { 
    backgroundColor: '#151A1F', 
    width: '100%', 
    maxWidth: 500, 
    padding: 30, 
    borderRadius: 20, 
    borderWidth: 2, 
    borderColor: '#D4AF37', 
    alignItems: 'center',
    paddingTop: 40,
    shadowColor: '#D4AF37',
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 15
  },
  closeBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 5,
    zIndex: 10,
    backgroundColor: '#1A1F24',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  iconWrapper: {
    marginBottom: 15,
    padding: 15,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
  },
  alertTitle: { 
    fontSize: 22, 
    fontWeight: '900', 
    color: '#D4AF37', 
    marginBottom: 8, 
    textAlign: 'center', 
    letterSpacing: 2 
  },
  alertDesc: { 
    fontSize: 12, 
    color: '#A1ADC1', 
    textAlign: 'center', 
    marginBottom: 25, 
    fontStyle: 'italic',
    lineHeight: 18,
  },
  statRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1F24',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#30363D'
  },
  roleInfo: {
     flex: 1
  },
  roleName: {
     color: '#EADDCA',
     fontSize: 15,
     fontWeight: '900',
     letterSpacing: 1
  },
  countsBox: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 15,
     backgroundColor: '#0F1318',
     paddingHorizontal: 16,
     paddingVertical: 10,
     borderRadius: 8,
     borderWidth: 1,
     borderColor: '#2D333B'
  },
  countSeparator: {
      width: 1,
      height: '100%',
      backgroundColor: '#30363D',
      marginHorizontal: 5
  },
  countItem: {
     alignItems: 'center',
     minWidth: 50
  },
  countLabel: {
     fontSize: 9,
     fontWeight: '900',
     color: '#A1ADC1',
     marginBottom: 4,
     letterSpacing: 1
  },
  countValue: {
     fontSize: 20,
     fontWeight: '900'
  }
});
