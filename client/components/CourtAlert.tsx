import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { Theme } from '../constants/Theme';

interface CourtAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export default function CourtAlert({
  visible,
  title,
  message,
  onClose,
}: CourtAlertProps) {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

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
          duration: 300,
          easing: Easing.out(Easing.back(1.3)),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      opacityAnim.setValue(0);
      scaleAnim.setValue(0.95);
    }
  }, [visible]);

  if (!visible) return null;

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
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.iconWrapper}>
            <AlertCircle color={Theme.colors.gold} size={22} strokeWidth={1.8} />
          </View>
          <Text style={styles.alertTitle}>{title.toUpperCase()}</Text>
          <Text style={styles.alertDesc}>{message}</Text>

          <TouchableOpacity
            style={styles.btn}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>COMPREENDIDO</Text>
          </TouchableOpacity>
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
    zIndex: 9999,
    padding: 14,
  },
  alertBox: {
    backgroundColor: Theme.colors.surface,
    width: '100%',
    maxWidth: 420,
    maxHeight: '92%',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Theme.colors.goldLine,
    ...Theme.shadows.premium,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  iconWrapper: {
    marginBottom: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(198, 161, 91, 0.1)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Theme.colors.gold,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 2.5,
  },
  alertDesc: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 17,
    letterSpacing: 0.3,
  },
  btn: {
    backgroundColor: Theme.colors.imperialRedDeep,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
    width: '100%',
    alignItems: 'center',
  },
  btnText: {
    color: Theme.colors.text,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.5,
  },
});
