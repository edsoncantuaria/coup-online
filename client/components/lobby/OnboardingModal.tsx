import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Crown, Coins, Eye, Skull, ChevronRight, X } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';

const STEPS: {
  title: string;
  body: string;
  Icon: typeof Crown;
}[] = [
  {
    title: 'Objetivo',
    body: 'Seja o último com influência na corte. Elimine os rivais ao forçá-los a revelar todas as cartas.',
    Icon: Crown,
  },
  {
    title: 'Moedas',
    body: 'Moedas pagam golpes e assassinatos. Com 10 ou mais, você é obrigado a dar um Golpe de Estado.',
    Icon: Coins,
  },
  {
    title: 'Blefe',
    body: 'Você pode declarar qualquer personagem. Se duvidarem e você não provar, perde uma carta.',
    Icon: Eye,
  },
  {
    title: 'Perder carta',
    body: 'Quando perde influência, escolha qual carta virar. Cada carta perdida aproxima você da eliminação.',
    Icon: Skull,
  },
];

type Props = {
  visible: boolean;
  onComplete: () => void;
  onDismiss: () => void;
};

export default function OnboardingModal({
  visible,
  onComplete,
  onDismiss,
}: Props) {
  const [step, setStep] = useState(0);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isNarrow = width < 720;

  const resetAndClose = () => {
    setStep(0);
    onDismiss();
  };

  const finish = () => {
    setStep(0);
    onComplete();
  };

  const s = STEPS[step];
  const Icon = s.Icon;
  const last = step === STEPS.length - 1;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={resetAndClose}
      supportedOrientations={['landscape']}
    >
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: 20 + insets.top,
            paddingBottom: 20 + insets.bottom,
            paddingLeft: 20 + insets.left,
            paddingRight: 20 + insets.right,
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(7,10,15,0.94)', 'rgba(15,21,32,0.98)']}
          style={[
            styles.card,
            isNarrow && { maxWidth: '92%', padding: 18 },
          ]}
        >
          <Pressable
            style={styles.closeBtn}
            onPress={resetAndClose}
            hitSlop={12}
            accessibilityLabel="Fechar introdução"
          >
            <X color={Theme.colors.textMuted} size={18} />
          </Pressable>

          <View style={styles.iconWrap}>
            <Icon color={Theme.colors.gold} size={36} strokeWidth={1.4} />
          </View>

          <Text style={styles.kicker}>EM ~30 SEGUNDOS</Text>
          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.body}>{s.body}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === step && styles.dotActive]}
              />
            ))}
          </View>

          <View style={styles.row}>
            {step > 0 ? (
              <Pressable
                style={styles.secondary}
                onPress={() => setStep((x) => Math.max(0, x - 1))}
              >
                <Text style={styles.secondaryText}>VOLTAR</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Pressable
              style={styles.primary}
              onPress={() => (last ? finish() : setStep((x) => x + 1))}
            >
              <LinearGradient
                colors={[
                  Theme.colors.goldHigh,
                  Theme.colors.gold,
                  Theme.colors.goldSoft,
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryGrad}
              >
                <Text style={styles.primaryText}>
                  {last ? 'ENTRAR NA CORTE' : 'PRÓXIMO'}
                </Text>
                {!last && (
                  <ChevronRight color="#1A1306" size={18} strokeWidth={2.5} />
                )}
              </LinearGradient>
            </Pressable>
          </View>

          <Pressable onPress={finish} style={styles.skip}>
            <Text style={styles.skipText}>Pular introdução</Text>
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    padding: 26,
    paddingTop: 36,
  },
  closeBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 2,
    padding: 6,
  },
  iconWrap: {
    alignSelf: 'center',
    marginBottom: 12,
    opacity: 0.95,
  },
  kicker: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 6,
  },
  title: {
    fontFamily: Theme.fonts.serif,
    color: Theme.colors.gold,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: Theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 22,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(198,161,91,0.2)',
  },
  dotActive: {
    backgroundColor: Theme.colors.gold,
    width: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  secondary: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
  },
  secondaryText: {
    color: Theme.colors.gold,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  primary: {
    flex: 1.4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  primaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  primaryText: {
    color: '#1A1306',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  skip: {
    marginTop: 14,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipText: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
