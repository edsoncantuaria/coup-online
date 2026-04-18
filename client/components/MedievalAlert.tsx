import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { AlertCircle } from 'lucide-react-native';

interface MedievalAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export default function MedievalAlert({ visible, title, message, onClose }: MedievalAlertProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.back(1.5)),
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
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.alertBox, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.iconWrapper}>
          <AlertCircle color="#D4AF37" size={32} />
        </View>
        <Text style={styles.alertTitle}>{title}</Text>
        <Text style={styles.alertDesc}>{message}</Text>
        
        <TouchableOpacity style={styles.btn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.btnText}>COMPREENDIDO</Text>
        </TouchableOpacity>
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
    zIndex: 9999,
    padding: 24,
  },
  alertBox: {
    backgroundColor: '#151A1F',
    width: '100%',
    maxWidth: 400,
    padding: 30,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#D4AF37',
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#D4AF37',
    shadowOpacity: 0.2,
    shadowRadius: 20,
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
    fontSize: 20,
    fontWeight: '900',
    color: '#D4AF37',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  alertDesc: {
    fontSize: 14,
    color: '#A1ADC1',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 20,
  },
  btn: {
    backgroundColor: '#8E1616',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F25252',
    width: '100%',
    alignItems: 'center',
  },
  btnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1,
  }
});
