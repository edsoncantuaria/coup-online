import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import {
  Sword,
  Users,
  Trophy,
  Settings,
  BookOpen,
  LogOut,
  Swords,
  HelpCircle,
} from 'lucide-react-native';
import { useGameState } from '../../hooks/useGameState';
import AmbassadorExchangeView from '../../components/AmbassadorExchangeView';
import GraveyardView from '../../components/GraveyardView';
import CourtAlert from '../../components/CourtAlert';
import RulesView from '../../components/RulesView';
import { translateRole, translateAction } from '../../utils/translations';
import { buildStatusInfo } from '../../utils/statusBuilder';
import ActionPanel from '../../components/game/ActionPanel';
import LogPanel from '../../components/game/LogPanel';
import ArenaTable from '../../components/game/ArenaTable';
import PlayerHUD from '../../components/game/PlayerHUD';
import { Theme } from '../../constants/Theme';

export default function GameScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { roomId: paramRoomId } = useLocalSearchParams();

  const players = useGameState((state) => state.players);
  const roomId = useGameState((state) => state.roomId);
  const phase = useGameState((state) => state.phase);
  const logs = useGameState((state) => state.logs);
  const socket = useGameState((state) => state.socket);
  const isOffline = useGameState((state) => state.isOffline);
  const { startGame, addBot, sendAction, sendResponse } = useGameState();
  const waitingForResponseIndex = useGameState(
    (state) => state.waitingForResponseIndex
  );
  const currentAction = useGameState((state) => state.currentAction);
  const pendingBlock = useGameState((state) => state.pendingBlock);
  const currentPlayerId = useGameState((state) => state.currentPlayerId);
  const losingInfluenceId = useGameState((state) => state.losingInfluenceId);
  const transitioning = useGameState((state) => state.transitioning);
  const turnTimer = useGameState((state) => state.turnTimer);

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [showGraveyard, setShowGraveyard] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: '',
    message: '',
  });
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  React.useEffect(() => {
    async function setupMobileView() {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE
      );
      if (typeof NavigationBar.setVisibilityAsync === 'function') {
        await NavigationBar.setVisibilityAsync('hidden');
        await NavigationBar.setBehaviorAsync('inset-touch');
      }
    }
    setupMobileView();
    return () => {
      // mantém landscape no app todo; só re-oculta NavBar
      if (typeof NavigationBar.setVisibilityAsync === 'function') {
        NavigationBar.setVisibilityAsync('hidden');
      }
      // Cancela timer de ação do humano ao sair
      useGameState.getState().clearHumanTimer();
    };
  }, []);

  const myId = isOffline ? 'human-1' : socket?.id;
  const me = players.find((p) => p.id === myId);
  const others = players.filter((p) => p.id !== myId);

  const handleAction = (type: string) => {
    if (me && me.coins >= 10 && type !== 'coup') {
      setAlertConfig({
        visible: true,
        title: 'Regra Real',
        message:
          'Como possuis 10 moedas de ouro ou mais, as leis do Reino exigem que realizes um Golpe de Estado imediatamente.',
      });
      return;
    }
    if (['steal', 'assassinate', 'coup'].includes(type)) {
      setPendingAction(type);
      setShowTargetPicker(true);
    } else {
      sendAction({ type, source: myId });
    }
  };

  const selectTarget = (targetId: string) => {
    if (pendingAction) {
      sendAction({ type: pendingAction, source: myId, target: targetId });
      setShowTargetPicker(false);
      setPendingAction(null);
    }
  };

  const statusInfo = buildStatusInfo({
    phase,
    players,
    currentPlayerId,
    waitingForResponseIndex,
    losingInfluenceId,
    currentAction,
    pendingBlock,
    myId: myId || '',
  });

  const isMyTurn = currentPlayerId === myId;
  const alivePlayers = players.filter((p) =>
    p.cards?.some((c) => !c.isFlipped)
  ).length;

  return (
    <View style={styles.gameContainer}>
      <StatusBar hidden />

      {/* HEADER PREMIUM */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 6) }]}>
        <View style={styles.topLeft}>
          <TouchableOpacity
            style={styles.exitButton}
            onPress={() => setShowExitConfirm(true)}
            activeOpacity={0.7}
          >
            <LogOut color={Theme.colors.textSecondary} size={13} />
            <Text style={styles.exitButtonText}>SAIR</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.topCenter}>
          <Text style={styles.topRoomLabel}>PARTIDA</Text>
          <Text style={styles.topRoomCode}>
            #{String(roomId || paramRoomId || '----').toUpperCase()}
          </Text>
          <View style={styles.topDivider} />
          <Text style={styles.topRoomLabel}>
            <Text style={styles.topRoomValue}>{alivePlayers}</Text>/
            {players.length} NOBRES
          </Text>
          <View style={styles.topDivider} />
          <View style={styles.turnRow}>
            <Text style={styles.topRoomLabel}>FASE</Text>
            <View
              style={[
                styles.turnDot,
                statusInfo.waitingOnMe
                  ? styles.turnDotActive
                  : styles.turnDotIdle,
              ]}
            />
            <Text
              style={[
                styles.topRoomValue,
                statusInfo.waitingOnMe && { color: Theme.colors.gold },
              ]}
              numberOfLines={1}
            >
              {statusInfo.title}
            </Text>
          </View>
        </View>

        <View style={styles.topRight}>
          <TouchableOpacity
            style={styles.graveyardBtn}
            onPress={() => setShowRules(true)}
            activeOpacity={0.7}
          >
            <HelpCircle color={Theme.colors.gold} size={13} />
            <Text style={[styles.exitButtonText, { color: Theme.colors.gold }]}>
              REGRAS
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.graveyardBtn}
            onPress={() => setShowGraveyard(true)}
            activeOpacity={0.7}
          >
            <BookOpen color={Theme.colors.textSecondary} size={13} />
            <Text style={styles.exitButtonText}>CRIPTA</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => setShowExitConfirm(true)}
            activeOpacity={0.7}
          >
            <Settings color={Theme.colors.textSecondary} size={15} />
          </TouchableOpacity>
        </View>
      </View>

      {/* LAYOUT PRINCIPAL: 3 colunas */}
      <View style={styles.mainContent}>
        {/* Painel de ações (esquerda) */}
        <ActionPanel
          onAction={handleAction}
          coins={me?.coins || 0}
          disabledActions={phase !== 'action' || !isMyTurn || transitioning}
        />

        {/* Arena central com jogadores */}
        <View style={styles.arenaContainer}>
          <ArenaTable
            players={others}
            currentPlayerId={currentPlayerId}
            waitingForResponseId={
              waitingForResponseIndex !== null
                ? players[waitingForResponseIndex]?.id
                : null
            }
            statusTitle={statusInfo.title}
            statusSubtitle={statusInfo.subtitle}
            statusKind={statusInfo.kind}
            turnTimer={turnTimer}
            transitioning={transitioning}
          />

          {/* HUD do jogador (cantos inferiores, não bloqueia mesa) */}
          <PlayerHUD
            me={me}
            isItsTurn={isMyTurn}
            phase={phase}
            isLosingInfluence={losingInfluenceId === myId}
            onSelectInfluence={(role) =>
              useGameState.getState().selectInfluence(role)
            }
          />
        </View>

        {/* Log (direita) */}
        <LogPanel logs={logs} />
      </View>

      <GraveyardView
        visible={showGraveyard}
        onClose={() => setShowGraveyard(false)}
      />

      <RulesView
        visible={showRules}
        onClose={() => setShowRules(false)}
      />

      {/* Confirmação de Saída */}
      {showExitConfirm && (
        <View style={styles.overlay}>
          <View style={[styles.alertBox, { maxWidth: 440 }]}>
            <Text style={styles.alertTitle}>ABANDONAR O REINO?</Text>
            <Text style={styles.alertDesc}>
              Sua partida será encerrada imediatamente.
            </Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.passActionBtn, { flex: 1 }]}
                onPress={() => setShowExitConfirm(false)}
              >
                <Text style={styles.secondaryButtonText}>VOLTAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  {
                    flex: 1,
                    backgroundColor: Theme.colors.imperialRedDeep,
                    borderWidth: 1,
                    borderColor: Theme.colors.imperialRed,
                  },
                ]}
                onPress={() => router.replace('/')}
              >
                <Text style={styles.buttonText}>SAIR DE VERDADE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Game Over */}
      {phase === 'game_over' && (
        <View style={styles.overlay}>
          <View
            style={[
              styles.alertBox,
              { borderColor: Theme.colors.gold, maxWidth: 480 },
              Theme.shadows.goldGlow,
            ]}
          >
            <View style={styles.trophyHalo}>
              <Trophy color={Theme.colors.gold} size={38} strokeWidth={1.6} />
            </View>
            <Text style={[styles.alertTitle, { fontSize: 18, marginTop: 10 }]}>
              VITÓRIA REAL
            </Text>
            <Text style={styles.winnerName}>
              {players
                .find((p) => p.cards.some((c) => !c.isFlipped))
                ?.name?.toUpperCase() || '—'}
            </Text>
            <Text style={styles.alertDesc}>é o único soberano do reino.</Text>
            <TouchableOpacity
              style={[styles.primaryButton, styles.startBtn, { width: '100%' }]}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.startBtnText}>VOLTAR AO MENU</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Phase Responses Overlay */}
      {!transitioning &&
        (phase === 'challenge' || phase === 'block') &&
        waitingForResponseIndex !== null &&
        players[waitingForResponseIndex]?.id === myId &&
        (() => {
          const actionType = currentAction?.type;
          const isTarget = currentAction?.target === myId;
          const canBlock =
            (actionType === 'foreign_aid' && phase === 'block' && !pendingBlock) ||
            (actionType === 'steal' &&
              isTarget &&
              phase === 'block' &&
              !pendingBlock) ||
            (actionType === 'assassinate' &&
              isTarget &&
              phase === 'block' &&
              !pendingBlock);

          return (
            <View style={styles.overlay}>
              <View style={[styles.alertBox, { maxWidth: 520 }]}>
                <ScrollView
                  style={{ width: '100%' }}
                  contentContainerStyle={{ alignItems: 'center' }}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.alertTitle}>
                    {phase === 'challenge'
                      ? `REIVINDICOU ${translateRole(
                          currentAction?.role || ''
                        )?.toUpperCase()}`
                      : pendingBlock
                      ? `BLOQUEIO COM ${translateRole(
                          pendingBlock?.role || ''
                        ).toUpperCase()}`
                      : `DESEJA BLOQUEAR?`}
                  </Text>

                  <View style={styles.blockContextBox}>
                    <Text
                      style={[styles.alertSubtitle, { color: Theme.colors.gold }]}
                    >
                      {phase === 'challenge'
                        ? `Ação: ${translateAction(
                            currentAction?.type || ''
                          ).toUpperCase()}`
                        : pendingBlock
                        ? `Barrou seu ${translateAction(
                            pendingBlock?.actionType || ''
                          ).toUpperCase()}`
                        : `Alvo do ${translateAction(
                            currentAction?.type || ''
                          ).toUpperCase()}`}
                    </Text>
                  </View>

                  <View style={styles.columnGap}>
                    {(phase === 'challenge' || !!pendingBlock) && (
                      <TouchableOpacity
                        style={styles.challengeActionBtn}
                        onPress={() => sendResponse('challenge')}
                      >
                        <Swords color="#FFF" size={14} />
                        <Text style={styles.buttonText}>
                          {pendingBlock
                            ? 'DESAFIAR BLOQUEIO'
                            : 'DESAFIAR AÇÃO'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {canBlock && actionType === 'steal' ? (
                      <View style={styles.dualBlockRow}>
                        <TouchableOpacity
                          style={[styles.blockActionBtn, { flex: 1 }]}
                          onPress={() => sendResponse('block', 'captain')}
                        >
                          <Text style={styles.blockButtonText}>CAPITÃO</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.blockActionBtn,
                            { flex: 1, backgroundColor: '#4E7AA0' },
                          ]}
                          onPress={() => sendResponse('block', 'ambassador')}
                        >
                          <Text style={styles.blockButtonText}>EMBAIXADOR</Text>
                        </TouchableOpacity>
                      </View>
                    ) : canBlock ? (
                      <TouchableOpacity
                        style={styles.blockActionBtn}
                        onPress={() => sendResponse('block')}
                      >
                        <Text style={styles.blockButtonText}>BLOQUEAR</Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={styles.passActionBtn}
                      onPress={() => sendResponse('pass')}
                    >
                      <Text style={styles.secondaryButtonText}>PERMITIR</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          );
        })()}

      {/* Ambassador Exchange */}
      {!transitioning &&
        phase === 'exchanging' &&
        currentPlayerId === myId &&
        (() => {
          const exchangingCards =
            useGameState.getState().localEngine?.getState().exchangingCards || [];
          const currentAlive =
            me?.cards?.filter((c) => !c.isFlipped).map((c) => c.role) || [];
          return (
            <AmbassadorExchangeView
              options={[...currentAlive, ...exchangingCards]}
              neededCount={currentAlive.length}
              onConfirm={(kept) =>
                useGameState.getState().confirmExchange(kept)
              }
            />
          );
        })()}

      {/* Target Picker */}
      {showTargetPicker && (
        <View style={styles.overlay}>
          <View style={[styles.alertBox, { maxWidth: 680 }]}>
            <Text style={styles.alertTitle}>ESCOLHA O ALVO</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.targetGrid}
              style={{ width: '100%' }}
            >
              {others
                .filter((p) => p.cards.some((c) => !c.isFlipped))
                .map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.targetNodeSmall}
                    onPress={() => selectTarget(p.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.avatarSmall}>
                      <Text style={styles.avatarTextSmall}>
                        {p.name[0]?.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.targetName}>
                      {p.name.toUpperCase()}
                    </Text>
                    <View style={styles.targetCoins}>
                      <Text style={styles.targetCoinsText}>
                        {p.coins} moedas
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => {
                setShowTargetPicker(false);
                setPendingAction(null);
              }}
            >
              <Text style={styles.cancelText}>CANCELAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Lobby */}
      {phase === 'lobby' && (
        <View style={styles.overlay}>
          <View style={[styles.alertBox, { maxWidth: 420 }]}>
            <Text style={styles.alertTitle}>LOBBY DO REINO</Text>
            <View style={styles.lobbyCounter}>
              <Users color={Theme.colors.gold} size={14} />
              <Text style={styles.lobbyCounterText}>
                {players.length} NOBRES PRESENTES
              </Text>
            </View>
            <View style={styles.columnGap}>
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => startGame()}
                activeOpacity={0.85}
              >
                <Sword color={Theme.colors.background} size={16} />
                <Text style={styles.startBtnText}>INICIAR PARTIDA</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.utilityButton}
                onPress={() => addBot()}
                activeOpacity={0.8}
              >
                <Users color={Theme.colors.textSecondary} size={14} />
                <Text style={styles.utilityButtonText}>CONVOCAR BOT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <CourtAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  gameContainer: { flex: 1, backgroundColor: Theme.colors.background },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    height: 58,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
    backgroundColor: 'rgba(11, 15, 20, 0.85)',
    zIndex: 40,
  },
  topLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  topCenter: {
    flex: 2.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  topRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  exitButtonText: {
    color: Theme.colors.textSecondary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  graveyardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  settingsBtn: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  topRoomLabel: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },
  topRoomCode: {
    color: Theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  topRoomValue: {
    color: Theme.colors.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
    maxWidth: 100,
  },
  topDivider: {
    width: 1,
    height: 10,
    backgroundColor: Theme.colors.border,
  },
  turnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  turnDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  turnDotActive: {
    backgroundColor: Theme.colors.gold,
    shadowColor: Theme.colors.gold,
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  turnDotIdle: {
    backgroundColor: Theme.colors.textMuted,
  },

  mainContent: { flex: 1, flexDirection: 'row' },
  arenaContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    zIndex: 9000,
  },
  alertBox: {
    backgroundColor: Theme.colors.surface,
    width: '100%',
    maxWidth: 500,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Theme.colors.goldLine,
    alignItems: 'center',
    ...Theme.shadows.premium,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Theme.colors.gold,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 2.5,
  },
  alertSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.text,
    textAlign: 'center',
    letterSpacing: 1,
  },
  alertDesc: {
    fontSize: 11,
    color: Theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  winnerName: {
    fontSize: 20,
    fontWeight: '900',
    color: Theme.colors.imperialRed,
    letterSpacing: 3,
    marginVertical: 4,
    textAlign: 'center',
  },
  trophyHalo: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(198, 161, 91, 0.12)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    marginBottom: 4,
  },
  columnGap: { width: '100%', gap: 8 },
  row: { flexDirection: 'row', gap: 10, width: '100%' },
  primaryButton: {
    height: 42,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: Theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  secondaryButtonText: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  challengeActionBtn: {
    backgroundColor: Theme.colors.imperialRedDeep,
    height: 42,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
  },
  passActionBtn: {
    backgroundColor: Theme.colors.surfaceHigh,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    height: 42,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockActionBtn: {
    backgroundColor: Theme.colors.gold,
    height: 42,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockButtonText: {
    color: Theme.colors.background,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  dualBlockRow: { flexDirection: 'row', gap: 10, width: '100%' },
  blockContextBox: {
    backgroundColor: 'rgba(198, 161, 91, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Theme.radius.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    width: '100%',
  },

  targetGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: 'center',
  },
  targetNodeSmall: {
    alignItems: 'center',
    width: 86,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: Theme.colors.surfaceHigh,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Theme.colors.gold,
    marginBottom: 6,
  },
  avatarTextSmall: {
    color: Theme.colors.text,
    fontWeight: '900',
    fontSize: 14,
  },
  targetName: {
    color: Theme.colors.text,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  targetCoins: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(198, 161, 91, 0.1)',
  },
  targetCoinsText: {
    color: Theme.colors.gold,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  cancelBtn: { marginTop: 10, padding: 8 },
  cancelText: {
    color: Theme.colors.textMuted,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1,
  },

  lobbyCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(198, 161, 91, 0.08)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    marginBottom: 14,
  },
  lobbyCounterText: {
    color: Theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  startBtn: {
    backgroundColor: Theme.colors.gold,
    height: 46,
    borderRadius: Theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 10,
    ...Theme.shadows.goldGlow,
  },
  startBtnText: {
    color: Theme.colors.background,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
  },
  utilityButton: {
    height: 42,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 10,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  utilityButtonText: {
    color: Theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
