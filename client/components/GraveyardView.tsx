import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { X, Skull } from 'lucide-react-native';
import { useGameState } from '../hooks/useGameState';
import { translateRole } from '../utils/translations';

interface GraveyardViewProps {
  visible: boolean;
  onClose: () => void;
}

export default function GraveyardView({ visible, onClose }: GraveyardViewProps) {
  const getGraveyardStats = useGameState(state => state.getGraveyardStats);

  if (!visible) return null;

  const stats = getGraveyardStats();

  return (
    <View style={styles.overlay}>
      <View style={styles.alertBox}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <X color="#8B0000" size={24} />
        </TouchableOpacity>

        <Skull color="#8B0000" size={32} style={{ marginBottom: 10 }} />
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
                     <Text style={[styles.countValue, { color: '#8B0000' }]}>{stat.dead}</Text>
                  </View>
                  <View style={styles.countSeparator} />
                  <View style={styles.countItem}>
                     <Text style={styles.countLabel}>VIVOS</Text>
                     <Text style={[styles.countValue, { color: '#2F4F4F' }]}>{stat.remaining}</Text>
                  </View>
               </View>
            </View>
          ))}
        </ScrollView>
      </View>
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
    zIndex: 3000 // Very high z-index to stay on top
  },
  alertBox: { 
    backgroundColor: '#F4E7D3', 
    width: '100%', 
    maxWidth: 500, 
    padding: 25, 
    borderRadius: 30, 
    borderWidth: 4, 
    borderColor: '#D4AF37', 
    alignItems: 'center',
    paddingTop: 30
  },
  closeBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 5,
    zIndex: 10
  },
  alertTitle: { fontSize: 24, fontWeight: '900', color: '#8B0000', marginBottom: 5, textAlign: 'center', letterSpacing: 1 },
  alertDesc: { fontSize: 13, color: '#5C4033', textAlign: 'center', marginBottom: 20, fontStyle: 'italic' },
  statRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'rgba(212, 175, 55, 0.4)'
  },
  roleInfo: {
     flex: 1
  },
  roleName: {
     color: '#5C4033',
     fontSize: 16,
     fontWeight: '900',
     letterSpacing: 0.5
  },
  countsBox: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 12,
     backgroundColor: '#FFF',
     paddingHorizontal: 12,
     paddingVertical: 8,
     borderRadius: 10,
     borderWidth: 1,
     borderColor: 'rgba(212, 175, 55, 0.2)'
  },
  countSeparator: {
      width: 1,
      height: '100%',
      backgroundColor: 'rgba(212, 175, 55, 0.3)',
      marginHorizontal: 2
  },
  countItem: {
     alignItems: 'center',
     minWidth: 45
  },
  countLabel: {
     fontSize: 9,
     fontWeight: '900',
     color: '#A0A0A0',
     marginBottom: 2
  },
  countValue: {
     fontSize: 18,
     fontWeight: '900'
  }
});
