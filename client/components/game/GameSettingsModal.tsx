import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import { X, Volume2, Bell, Music } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import { storage } from '../../utils/storage';
import {
  setMutedFlag,
  setSfxVolume,
  setMusicVolume,
  stopAllSfx,
} from '../../utils/sound';
import {
  requestNotificationPermission,
  syncInvitePreference,
} from '../../utils/notifications';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function GameSettingsModal({ visible, onClose }: Props) {
  const [muted, setMuted] = useState(false);
  const [sfx, setSfx] = useState(1);
  const [music, setMusic] = useState(1);
  const [notifyInvites, setNotifyInvites] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const m = await storage.getMuted();
      const sv = await storage.getAudioSfxVol();
      const mv = await storage.getAudioMusicVol();
      const ni = await storage.getNotifyInvites();
      setMuted(m);
      setSfx(sv);
      setMusic(mv);
      setNotifyInvites(ni);
    })();
  }, [visible]);

  const applyMute = async (v: boolean) => {
    setMuted(v);
    setMutedFlag(v);
    await storage.setMuted(v);
  };

  const applyNotify = async (on: boolean) => {
    if (on) {
      const ok = await requestNotificationPermission();
      if (!ok) {
        setNotifyInvites(false);
        await storage.setNotifyInvites(false);
        return;
      }
    }
    setNotifyInvites(on);
    await storage.setNotifyInvites(on);
    await syncInvitePreference(on);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <BlurView intensity={40} tint="dark" style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>CONFIGURAÇÕES</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X color={Theme.colors.textSecondary} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Volume2 size={16} color={Theme.colors.textSecondary} />
                <Text style={styles.sectionTitle}>ÁUDIO</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>Silenciar tudo</Text>
                <Switch
                  value={muted}
                  onValueChange={applyMute}
                  trackColor={{
                    false: Theme.colors.border,
                    true: Theme.colors.goldLine,
                  }}
                  thumbColor={muted ? Theme.colors.gold : '#f4f4f5'}
                />
              </View>

              <View style={[styles.row, muted && { opacity: 0.45 }]}>
                <View style={styles.sliderRow}>
                  <Music size={14} color={Theme.colors.textMuted} />
                  <Text style={styles.label}>Música</Text>
                </View>
                <Text style={styles.pct}>{Math.round(music * 100)}%</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={music}
                onValueChange={(v) => {
                  setMusic(v);
                  if (!muted) setMusicVolume(v);
                }}
                onSlidingComplete={(v) => {
                  void storage.setAudioMusicVol(v);
                }}
                minimumTrackTintColor={Theme.colors.gold}
                maximumTrackTintColor={Theme.colors.border}
                thumbTintColor={Theme.colors.gold}
                disabled={muted}
              />

              <View style={[styles.row, { marginTop: 10 }, muted && { opacity: 0.45 }]}>
                <View style={styles.sliderRow}>
                  <Volume2 size={14} color={Theme.colors.textMuted} />
                  <Text style={styles.label}>Efeitos</Text>
                </View>
                <Text style={styles.pct}>{Math.round(sfx * 100)}%</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={1}
                value={sfx}
                onValueChange={(v) => {
                  setSfx(v);
                  if (!muted) setSfxVolume(v);
                }}
                onSlidingComplete={(v) => {
                  void storage.setAudioSfxVol(v);
                  if (v < 0.01) stopAllSfx();
                }}
                minimumTrackTintColor={Theme.colors.gold}
                maximumTrackTintColor={Theme.colors.border}
                thumbTintColor={Theme.colors.gold}
                disabled={muted}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Bell size={16} color={Theme.colors.textSecondary} />
                <Text style={styles.sectionTitle}>NOTIFICAÇÕES</Text>
              </View>
              <Text style={styles.hint}>
                Convites para jogar online e lembretes quando o multiplayer
                estiver disponível.
              </Text>
              <View style={styles.row}>
                <Text style={styles.label}>Convites e alertas</Text>
                <Switch
                  value={notifyInvites}
                  onValueChange={applyNotify}
                  trackColor={{
                    false: Theme.colors.border,
                    true: Theme.colors.goldLine,
                  }}
                  thumbColor={notifyInvites ? Theme.colors.gold : '#f4f4f5'}
                />
              </View>
              {Platform.OS === 'web' ? (
                <Text style={styles.warn}>
                  Notificações não estão disponíveis na versão web.
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
    backgroundColor: 'rgba(11,15,20,0.94)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  title: {
    color: Theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  section: {
    marginTop: 18,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    color: Theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: Theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  pct: {
    color: Theme.colors.gold,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 40,
    textAlign: 'right',
  },
  slider: {
    width: '100%',
    height: 36,
    marginBottom: 4,
  },
  hint: {
    color: Theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
  },
  warn: {
    marginTop: 8,
    color: Theme.colors.imperialRed,
    fontSize: 10,
    fontWeight: '600',
  },
});
