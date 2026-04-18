import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Trophy } from 'lucide-react-native';
import Card from './Card';

interface Props {
  options: string[];
  neededCount: number;
  onConfirm: (kept: string[]) => void;
}

export default function AmbassadorExchangeView({ options, neededCount, onConfirm }: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (role: string, idx: number) => {
    const key = `${role}-${idx}`;
    if (selected.includes(key)) {
      setSelected(selected.filter(k => k !== key));
    } else if (selected.length < neededCount) {
      setSelected([...selected, key]);
    }
  };

  return (
    <View style={appStyles.overlay}>
      <View style={[appStyles.alertBox, { width: '90%' }]}>
        <Text style={appStyles.alertTitle}>🎭 TROCA DO EMBAIXADOR</Text>
        <Text style={appStyles.alertDesc}>Selecione quais {neededCount} cartas você deseja manter nas suas mãos.</Text>
        
        <ScrollView 
          style={{ width: '100%', maxHeight: 400 }}
          contentContainerStyle={appStyles.exchangeLayout}
          showsVerticalScrollIndicator={false}
        >
          {options.map((role, idx) => {
            const key = `${role}-${idx}`;
            const isSelected = selected.includes(key);
            return (
              <TouchableOpacity 
                key={key} 
                style={[appStyles.exchangeCardWrapper, isSelected && appStyles.exchangeCardSelected]} 
                onPress={() => toggleSelect(role, idx)}
              >
                <Card role={role} isFlipped={true} isDead={false} />
                {isSelected && (
                  <View style={appStyles.checkOverlay}>
                    <Trophy size={20} color="white" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity 
          style={[appStyles.primaryButton, { width: '100%', opacity: selected.length === neededCount ? 1 : 0.5 }]} 
          disabled={selected.length !== neededCount}
          onPress={() => onConfirm(selected.map(k => k.split('-')[0]))}
        >
          <Text style={appStyles.buttonText}>AUTORIZAR TROCA</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// These styles will be shared or duplicated for simplicity in this component
const appStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
    zIndex: 2000,
  },
  alertBox: {
    backgroundColor: '#F4E7D3',
    padding: 25,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: '#D4AF37',
    alignItems: 'center',
  },
  alertTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#8B0000',
    marginBottom: 5,
    textAlign: 'center',
  },
  alertDesc: {
    fontSize: 14,
    color: '#5C4033',
    textAlign: 'center',
    marginBottom: 25,
    fontWeight: '600',
  },
  exchangeLayout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 15,
    marginVertical: 20,
  },
  exchangeCardWrapper: {
    padding: 5,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  exchangeCardSelected: {
    borderColor: '#D4AF37',
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
  },
  checkOverlay: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#D4AF37',
    padding: 5,
    borderRadius: 10,
  },
  primaryButton: {
    backgroundColor: '#8B0000',
    height: 65,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
  },
});
