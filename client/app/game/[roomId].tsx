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
import RevealOverlay from '../../components/game/RevealOverlay';
import LossRevealOverlay from '../../components/game/LossRevealOverlay';
import ResolvedBanner from '../../components/game/ResolvedBanner';
import InvalidActionToast from '../../components/game/InvalidActionToast';
import DeckIndicator from '../../components/game/DeckIndicator';
import ConsequenceHint from '../../components/game/ConsequenceHint';
import ResponseCourtOverlay from '../../components/game/ResponseCourtOverlay';
import SacrificeOverlay from '../../components/game/SacrificeOverlay';
import EndOfMatchScreen from '../../components/game/EndOfMatchScreen';
import { appendMatchHistory } from '../../utils/storage';
import { Theme } from '../../constants/Theme';
import {
  hapticLight,
  hapticMedium,
  hapticHeavy,
  hapticSuccess,
  hapticError,
  hapticSelection,
} from '../../utils/haptics';
import {
  playSfx,
  startLoop,
  stopLoop,
  stopAllSfx,
  playMusic,
  duckMusic,
} from '../../utils/sound';

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
  const losingContext = useGameState((state) => (state as any).losingContext);
  const transitioning = useGameState((state) => state.transitioning);
  const transitionRemaining = useGameState(
    (state) => (state as any).transitionRemaining as number | null,
  );
  const turnTimer = useGameState((state) => state.turnTimer);
  const lastReveal = useGameState((state) => state.lastReveal);
  const lastLoss = useGameState((state) => state.lastLoss);
  const lastResolved = useGameState((state) => state.lastResolved);
  const lastInvalid = useGameState((state) => state.lastInvalid);
  const deckCount = useGameState((state) => state.deckCount);
  const [invalidToast, setInvalidToast] = useState<{
    reason: string;
    stamp: number;
  } | null>(null);
  React.useEffect(() => {
    if (lastInvalid && lastInvalid.stamp !== invalidToast?.stamp) {
      setInvalidToast({ reason: lastInvalid.reason, stamp: lastInvalid.stamp });
    }
  }, [lastInvalid?.stamp]);

  const matchStats = useGameState((state) => state.matchStats);
  const winnerId = useGameState((state) => state.winnerId);

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [showGraveyard, setShowGraveyard] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: string;
    targetId: string;
    targetName: string;
  } | null>(null);
  const [thresholdWarn, setThresholdWarn] = useState<{
    type: string;
    gain: number;
    total: number;
  } | null>(null);
  const [opponentDetail, setOpponentDetail] = useState<any | null>(null);
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

  // Fecha modais locais (confirmação de ação, aviso de 10 moedas, target picker)
  // sempre que a fase deixar de ser 'action' OU o turno sair de mim. Evita
  // modais "fantasma" depois que o auto-turno (timer expirado) age por mim.
  React.useEffect(() => {
    if (currentPlayerId !== 'human-1' || phase !== 'action') {
      if (showTargetPicker) setShowTargetPicker(false);
      if (pendingAction) setPendingAction(null);
      if (confirmAction) setConfirmAction(null);
      if (thresholdWarn) setThresholdWarn(null);
    }
  }, [currentPlayerId, phase]);

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

  // ===== Feedback sensorial: haptics + sons =====
  const lastRevealStampRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!lastReveal) return;
    if (lastRevealStampRef.current === lastReveal.stamp) return;
    lastRevealStampRef.current = lastReveal.stamp;
    if (lastReveal.verdict === 'proven') {
      hapticSuccess();
      playSfx('CARD_REVEAL');
    } else {
      hapticError();
      playSfx('BLUFF_FAIL');
    }
  }, [lastReveal]);

  const prevTransitioningRef = React.useRef(transitioning);
  const prevPhaseRef = React.useRef(phase);
  const prevCoinsRef = React.useRef(me?.coins || 0);
  const prevCardsLostRef = React.useRef(
    me?.cards?.filter((c: any) => c.isFlipped).length || 0
  );

  React.useEffect(() => {
    // Pulso leve quando você começa a decidir algo
    if (prevTransitioningRef.current && !transitioning) {
      if (statusInfo.waitingOnMe) {
        hapticLight();
        playSfx('SUCCESS');
      }
    }
    prevTransitioningRef.current = transitioning;
  }, [transitioning]);

  React.useEffect(() => {
    if (phase === 'game_over' && prevPhaseRef.current !== 'game_over') {
      const iWin = me && !me.cards.every((c: any) => c.isFlipped);
      // Fim da partida: abaixa a música de fundo pra o stinger
      // respirar (vitória/derrota são o pico emocional do jogo).
      duckMusic(0.22, 4200);
      if (iWin) {
        hapticSuccess();
        playSfx('VICTORY');
      } else {
        hapticError();
        playSfx('DEFEAT');
      }

      // Grava histórico da partida
      if (matchStats && me) {
        const s = matchStats.perPlayer?.[myId] || {};
        // Cálculo simples do MVP: maior score entre jogadores
        const scores = players.map((p: any) => {
          const ss = matchStats.perPlayer?.[p.id] || {};
          const score =
            (ss.actionsTaken || 0) * 1 +
            (ss.challengesWon || 0) * 4 +
            (ss.bluffsCaught || 0) * 4 +
            (ss.blocksSuccess || 0) * 3 +
            (ss.bluffsSurvived || 0) * 2 +
            (ss.coinsGained || 0) * 0.3 -
            (ss.coinsLost || 0) * 0.15 -
            (ss.cardsLost || 0) * 5;
          return { id: p.id, score };
        });
        scores.sort((a, b) => b.score - a.score);
        const mvp = scores[0]?.id === myId;
        const duration =
          matchStats.endedAt && matchStats.startedAt
            ? matchStats.endedAt - matchStats.startedAt
            : 0;
        appendMatchHistory({
          id: `m-${Date.now()}`,
          playedAt: Date.now(),
          durationMs: duration,
          rounds: matchStats.round || 1,
          result: iWin ? 'win' : 'loss',
          opponents: Math.max(0, players.length - 1),
          playerName: me.name,
          actionsTaken: s.actionsTaken || 0,
          challengesMade: s.challengesMade || 0,
          challengesWon: s.challengesWon || 0,
          bluffsCaught: s.bluffsCaught || 0,
          bluffsSurvived: s.bluffsSurvived || 0,
          blocksMade: s.blocksMade || 0,
          blocksSuccess: s.blocksSuccess || 0,
          coinsGained: s.coinsGained || 0,
          coinsLost: s.coinsLost || 0,
          cardsLost: s.cardsLost || 0,
          mvp,
        }).catch(() => {
          /* ignora */
        });
      }
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  React.useEffect(() => {
    if (!me) return;
    const coins = me.coins || 0;
    if (coins !== prevCoinsRef.current) {
      if (coins > prevCoinsRef.current) playSfx('COIN_GAIN');
      else playSfx('COIN_LOSS');
      prevCoinsRef.current = coins;
    }
    const lost = me.cards?.filter((c: any) => c.isFlipped).length || 0;
    if (lost > prevCardsLostRef.current) {
      hapticHeavy();
      // Reforço duplo: som curto do flip + golpe emocional da perda.
      playSfx('CARD_FLIP');
      playSfx('LOSE_CARD', { delayMs: 180 });
      prevCardsLostRef.current = lost;
    }
  }, [me?.coins, me?.cards]);

  // LOG: toca um "tick" discreto a cada nova linha na crônica.
  const lastLogCountRef = React.useRef(logs.length);
  React.useEffect(() => {
    if (logs.length > lastLogCountRef.current) {
      // Leve atraso em relação a moedas/UI — micro-timing orgânico.
      const t = setTimeout(() => playSfx('LOG'), 80);
      lastLogCountRef.current = logs.length;
      return () => clearTimeout(t);
    }
    lastLogCountRef.current = logs.length;
  }, [logs.length]);

  // TIMER TICK / URGENT — loops temporais.
  // Inicia apenas quando o humano está decidindo algo sob pressão;
  // troca para URGENT nos últimos 10 segundos.
  React.useEffect(() => {
    const isMyDecision =
      (phase === 'action' && isMyTurn) ||
      (phase === 'losing_influence' && losingInfluenceId === myId) ||
      ((phase === 'challenge' || phase === 'block') &&
        waitingForResponseIndex !== null &&
        players[waitingForResponseIndex]?.id === myId);

    if (!isMyDecision || transitioning || typeof turnTimer !== 'number') {
      stopLoop('TIMER_TICK');
      stopLoop('TIMER_URGENT');
      return;
    }

    if (turnTimer <= 10 && turnTimer > 0) {
      stopLoop('TIMER_TICK');
      startLoop('TIMER_URGENT');
    } else if (turnTimer > 10) {
      stopLoop('TIMER_URGENT');
      startLoop('TIMER_TICK');
    } else {
      stopLoop('TIMER_TICK');
      stopLoop('TIMER_URGENT');
    }
  }, [
    phase,
    isMyTurn,
    losingInfluenceId,
    myId,
    waitingForResponseIndex,
    transitioning,
    turnTimer,
  ]);

  // Música do jogo: entra com crossfade vindo do menu. Ao sair da tela
  // (voltar ao lobby), o index.tsx toca 'menu' em focus e o crossfade
  // acontece sozinho; só paramos SFX residuais aqui.
  React.useEffect(() => {
    playMusic('game');
    return () => {
      stopAllSfx();
    };
  }, []);

  const handleAction = (type: string) => {
    hapticSelection();
    if (me && me.coins >= 10 && type !== 'coup') {
      setAlertConfig({
        visible: true,
        title: 'Regra Real',
        message:
          'Como possuis 10 moedas de ouro ou mais, as leis do Reino exigem que realizes um Golpe de Estado imediatamente.',
      });
      return;
    }
    // Aviso ao cruzar a marca das 10 moedas — próximo turno será Golpe obrigatório.
    // Só para ações sem alvo (com alvo, o aviso viria tarde demais no fluxo).
    const GAIN: Record<string, number> = {
      income: 1,
      foreign_aid: 2,
      tax: 3,
    };
    if (me && GAIN[type] !== undefined) {
      const total = me.coins + GAIN[type];
      if (me.coins < 10 && total >= 10) {
        setThresholdWarn({ type, gain: GAIN[type], total });
        return;
      }
    }
    if (['steal', 'assassinate', 'coup'].includes(type)) {
      setPendingAction(type);
      setShowTargetPicker(true);
    } else {
      sendAction({ type, source: myId });
    }
  };

  const confirmThreshold = () => {
    if (!thresholdWarn) return;
    const type = thresholdWarn.type;
    setThresholdWarn(null);
    if (['steal', 'assassinate', 'coup'].includes(type)) {
      setPendingAction(type);
      setShowTargetPicker(true);
    } else {
      sendAction({ type, source: myId });
    }
  };

  const selectTarget = (targetId: string) => {
    if (!pendingAction) return;
    const target = players.find((p) => p.id === targetId);
    // Ações destrutivas (Golpe / Assassinato) exigem confirmação
    if (pendingAction === 'coup' || pendingAction === 'assassinate') {
      setShowTargetPicker(false);
      setConfirmAction({
        type: pendingAction,
        targetId,
        targetName: target?.name || '??',
      });
      return;
    }
    sendAction({ type: pendingAction, source: myId, target: targetId });
    setShowTargetPicker(false);
    setPendingAction(null);
  };

  const confirmDestructive = () => {
    if (!confirmAction) return;
    hapticMedium();
    sendAction({
      type: confirmAction.type,
      source: myId,
      target: confirmAction.targetId,
    });
    setConfirmAction(null);
    setPendingAction(null);
  };

  const cancelDestructive = () => {
    setConfirmAction(null);
    setPendingAction(null);
  };

  const alivePlayers = players.filter((p) =>
    p.cards?.some((c) => !c.isFlipped)
  ).length;

  return (
    <View style={styles.gameContainer}>
      <StatusBar hidden />

      {/* HEADER PREMIUM */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: Math.max(insets.top, 6),
            paddingLeft: 16 + Math.max(insets.left, 0),
            paddingRight: 16 + Math.max(insets.right, 0),
          },
        ]}
      >
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
      <View
        style={[
          styles.mainContent,
          {
            paddingLeft: Math.max(insets.left, 0),
            paddingRight: Math.max(insets.right, 0),
          },
        ]}
      >
        {/* Painel de ações (esquerda) */}
        <ActionPanel
          onAction={handleAction}
          coins={me?.coins || 0}
          disabledActions={phase !== 'action' || !isMyTurn || transitioning}
          aliveOpponents={others.filter((p) =>
            p.cards?.some((c: any) => !c.isFlipped)
          ).length}
          opponentsCoinsTotal={others
            .filter((p) => p.cards?.some((c: any) => !c.isFlipped))
            .reduce((sum, p) => sum + (p.coins || 0), 0)}
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
            targetId={currentAction?.target || null}
            turnTimer={
              // Evita duplicar o timer: o overlay de resposta já tem o seu.
              // Em losing_influence mantemos o timer central visível porque
              // não há modal bloqueante — o jogador toca direto na carta.
              (phase === 'challenge' || phase === 'block') &&
              waitingForResponseIndex !== null &&
              players[waitingForResponseIndex]?.id === myId
                ? null
                : turnTimer
            }
            transitioning={transitioning}
            transitionRemaining={transitionRemaining}
            nextPlayerName={
              transitioning
                ? players.find((p) => p.id === currentPlayerId)?.name || null
                : null
            }
            intensity={(() => {
              if (transitioning) return 'idle';
              // Clímax: qualquer conflito ativo / decisão pesada em curso.
              if (
                phase === 'challenge' ||
                phase === 'block' ||
                phase === 'losing_influence'
              ) {
                return 'climax';
              }
              // Foco: seu turno de escolher ação.
              if (isMyTurn && phase === 'action') return 'focus';
              return 'idle';
            })()}
            onPlayerLongPress={(p) => {
              hapticLight();
              setOpponentDetail(p);
            }}
          />

          {/* HUD do jogador (cantos inferiores, não bloqueia mesa) */}
          {/*
            Quando o humano precisa sacrificar, o SacrificeOverlay assume
            totalmente a interação — o HUD recebe isLosingInfluence=false
            para evitar double-UI (hint + cartas destacáveis em dois lugares).
          */}
          <PlayerHUD
            me={me}
            isItsTurn={isMyTurn}
            phase={phase}
            cardTension={
              !transitioning &&
              (phase === 'challenge' ||
                phase === 'block' ||
                phase === 'losing_influence')
            }
            isLosingInfluence={false}
            isTargeted={
              !!currentAction?.target &&
              currentAction.target === myId &&
              currentAction.source !== myId &&
              (phase === 'challenge' ||
                phase === 'block' ||
                phase === 'action')
            }
            threatLabel={
              currentAction?.target === myId &&
              currentAction?.source !== myId
                ? currentAction?.type === 'assassinate'
                  ? 'VOC\u00ca \u00c9 ALVO DE ASSASSINATO'
                  : currentAction?.type === 'coup'
                  ? 'VOC\u00ca SOFRER\u00c1 UM GOLPE'
                  : currentAction?.type === 'steal'
                  ? 'EST\u00c3O TENTANDO ROUBAR VOC\u00ca'
                  : null
                : null
            }
            onSelectInfluence={(role) => {
              hapticHeavy();
              useGameState.getState().selectInfluence(role);
            }}
          />

          {/* Reveal central de carta provada / blefe */}
          <RevealOverlay reveal={lastReveal} />

          {/* Modal AAA de sacrif\u00edcio (perda de influ\u00eancia do humano) */}
          {phase === 'losing_influence' &&
            losingInfluenceId === myId &&
            me && (
              <SacrificeOverlay
                cards={me.cards || []}
                reason={(losingContext?.reason as any) || 'coup'}
                causedByName={(() => {
                  const cid = losingContext?.causedByPlayerId;
                  if (!cid) return null;
                  const p = players.find((pp) => pp.id === cid);
                  return p?.name || null;
                })()}
                timer={turnTimer}
                maxTimer={30}
                onPick={(role) => {
                  hapticHeavy();
                  useGameState.getState().selectInfluence(role);
                }}
              />
            )}

          {/* Reveal central de influ\u00eancia perdida */}
          <LossRevealOverlay loss={lastLoss} />

          {/* Toast de a\u00e7\u00e3o rec\u00e9m-resolvida */}
          <ResolvedBanner data={lastResolved} />

          {/* Indicador do baralho (canto superior direito da arena) */}
          <View style={styles.deckCorner} pointerEvents="none">
            <DeckIndicator count={deckCount} />
          </View>
        </View>

        {/* Log (direita) */}
        <LogPanel logs={logs} />
      </View>

      <InvalidActionToast
        data={invalidToast}
        onDismiss={() => setInvalidToast(null)}
      />

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
        <EndOfMatchScreen
          visible
          winnerName={
            players.find((p) => p.cards.some((c: any) => !c.isFlipped))?.name ||
            '—'
          }
          winnerIsHuman={
            !!me && !me.cards.every((c: any) => c.isFlipped)
          }
          players={players}
          matchStats={matchStats}
          onHome={() => router.replace('/')}
          onReplay={() => {
            // reinicia: volta ao menu (player pode criar nova partida)
            router.replace('/');
          }}
        />
      )}

      {/* Phase Responses Overlay.
          A engine já pula corretamente os jogadores que não devem responder
          (autor da ação em challenge_action, source em block_foreign_aid,
          bloqueador em challenge_block). Confiamos em waitingForResponseIndex. */}
      {!transitioning &&
        (phase === 'challenge' || phase === 'block') &&
        waitingForResponseIndex !== null &&
        players[waitingForResponseIndex]?.id === myId &&
        currentAction &&
        (() => {
          const actionType = currentAction?.type;
          const actorName =
            players.find((p) => p.id === currentAction?.source)?.name || '??';
          const targetPlayer = players.find(
            (p) => p.id === currentAction?.target
          );
          const iAmTarget = currentAction?.target === myId;
          const blockerName = pendingBlock
            ? players.find((p) => p.id === pendingBlock?.blockerId)?.name || '??'
            : null;

          // Determina modo do overlay.
          // Engine usa:
          //   phase='challenge'         → esperando desafios à AÇÃO
          //   phase='block' + pendingBlock → esperando desafios ao BLOQUEIO
          //   phase='block' sem pendingBlock → esperando alguém BLOQUEAR a ação
          let mode:
            | 'challenge_action'
            | 'challenge_block'
            | 'block_foreign_aid'
            | 'block_steal'
            | 'block_assassinate'
            | 'unknown' = 'unknown';

          if (phase === 'challenge' && !pendingBlock) {
            mode = 'challenge_action';
          } else if (phase === 'block' && pendingBlock) {
            mode = 'challenge_block';
          } else if (phase === 'block' && !pendingBlock) {
            if (actionType === 'foreign_aid') mode = 'block_foreign_aid';
            else if (actionType === 'steal') mode = 'block_steal';
            else if (actionType === 'assassinate') mode = 'block_assassinate';
          }

          if (mode === 'unknown') return null;

          const canDesafiar =
            mode === 'challenge_action' || mode === 'challenge_block';
          const canBloquear =
            mode === 'block_foreign_aid' ||
            (mode === 'block_steal' && iAmTarget) ||
            (mode === 'block_assassinate' && iAmTarget);

          // Informação privada do humano: o que realmente tenho na mão viva.
          const myAliveRoles = (me?.cards || [])
            .filter((c: any) => !c.isFlipped)
            .map((c: any) => c.role);
          const iHave = (role: string) => myAliveRoles.includes(role);

          // Card counting público: quantas dessas cartas JÁ foram reveladas
          // (viradas em mesa). Não inclui minhas cartas vivas (essa info é privada
          // e já é mostrada no badge "você tem").
          const publicDeadByRole: Record<string, number> = {
            duke: 0,
            captain: 0,
            ambassador: 0,
            assassin: 0,
            contessa: 0,
          };
          players.forEach((p) => {
            p.cards?.forEach((c: any) => {
              if (c.isFlipped && publicDeadByRole[c.role] !== undefined) {
                publicDeadByRole[c.role] += 1;
              }
            });
          });
          // "Em jogo" = 3 do baralho total − as que já morreram em público.
          // Cartas vivas dos oponentes continuam "em jogo" sob a ótica do humano.
          const remainingOf = (role: string) => {
            const dead = publicDeadByRole[role] || 0;
            // Se tenho a própria carta, conto ela como "em jogo" também.
            return Math.max(0, 3 - dead);
          };

          // "role" em julgamento em cada modo.
          //  - challenge_action: atacante diz ser X (X = carta da ação)
          //  - challenge_block: bloqueador diz ter X (X = carta do bloqueio)
          //  - block_foreign_aid: mostra Duque (quem pode bloquear)
          //  - block_steal: atacante diz ser Capitão
          //  - block_assassinate: atacante diz ser Assassino
          const ROLE_OF_ACTION: Record<string, string> = {
            tax: 'duke',
            assassinate: 'assassin',
            steal: 'captain',
            exchange: 'ambassador',
          };
          const claimedRole =
            mode === 'challenge_action'
              ? ROLE_OF_ACTION[actionType || ''] || ''
              : mode === 'challenge_block'
              ? pendingBlock?.role || ''
              : mode === 'block_foreign_aid'
              ? 'duke'
              : mode === 'block_steal'
              ? 'captain'
              : mode === 'block_assassinate'
              ? 'assassin'
              : '';

          const remainingByRole: Record<string, number> = {
            duke: remainingOf('duke'),
            captain: remainingOf('captain'),
            ambassador: remainingOf('ambassador'),
            assassin: remainingOf('assassin'),
            contessa: remainingOf('contessa'),
          };

          return (
            <ResponseCourtOverlay
              mode={mode}
              actorName={actorName}
              blockerName={blockerName}
              targetName={targetPlayer?.name || null}
              iAmActor={currentAction?.source === myId}
              iAmTarget={iAmTarget}
              claimedRole={claimedRole}
              actionType={actionType || ''}
              myAliveRoles={myAliveRoles}
              remainingByRole={remainingByRole}
              timer={turnTimer}
              maxTimer={30}
              onChallenge={() => {
                hapticMedium();
                playSfx('CHALLENGE');
                sendResponse('challenge');
              }}
              onBlock={(role) => {
                hapticMedium();
                playSfx('BLOCK');
                sendResponse('block', role);
              }}
              onPass={() => {
                hapticLight();
                sendResponse('pass');
              }}
            />
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
            {pendingAction === 'steal' && (
              <Text style={[styles.alertDesc, { marginBottom: 4 }]}>
                Roubo só pode ser feito contra quem possui pelo menos 1 moeda.
              </Text>
            )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.targetGrid}
              style={{ width: '100%' }}
            >
              {others
                .filter((p) => p.cards.some((c) => !c.isFlipped))
                .map((p) => {
                  const stealBlocked =
                    pendingAction === 'steal' && (p.coins || 0) < 1;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.targetNodeSmall,
                        stealBlocked && { opacity: 0.35 },
                      ]}
                      onPress={() => {
                        if (stealBlocked) return;
                        selectTarget(p.id);
                      }}
                      disabled={stealBlocked}
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
                      {stealBlocked && (
                        <Text
                          style={{
                            color: Theme.colors.imperialRed,
                            fontSize: 8,
                            fontWeight: '900',
                            letterSpacing: 1,
                            marginTop: 2,
                          }}
                        >
                          SEM MOEDAS
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
            {pendingAction && (
              <ConsequenceHint
                actionType={pendingAction}
                aliveOpponents={alivePlayers - 1}
              />
            )}
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

      {/* Aviso: ação vai te colocar em 10+ moedas (Golpe obrigatório no próximo) */}
      {thresholdWarn && (
        <View style={styles.overlay}>
          <View
            style={[
              styles.alertBox,
              { maxWidth: 440, borderColor: Theme.colors.gold },
            ]}
          >
            <Text style={[styles.alertTitle, { color: Theme.colors.gold }]}>
              LIMIAR DAS 10 MOEDAS
            </Text>
            <Text style={styles.alertDesc}>
              Esta ação fará sua reserva atingir {thresholdWarn.total} moedas.
              Pelas leis do Reino, no seu próximo turno você será OBRIGADO a
              realizar um Golpe de Estado. Deseja prosseguir?
            </Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.passActionBtn, { flex: 1 }]}
                onPress={() => setThresholdWarn(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryButtonText}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  {
                    flex: 1,
                    backgroundColor: 'rgba(198,161,91,0.18)',
                    borderWidth: 1,
                    borderColor: Theme.colors.gold,
                  },
                ]}
                onPress={confirmThreshold}
                activeOpacity={0.85}
              >
                <Text style={styles.buttonText}>PROSSEGUIR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Confirmação de ação destrutiva (Golpe / Assassinato) */}
      {confirmAction && (
        <View style={styles.overlay}>
          <View
            style={[
              styles.alertBox,
              {
                maxWidth: 460,
                borderColor: Theme.colors.imperialRed,
              },
            ]}
          >
            <Text
              style={[styles.alertTitle, { color: Theme.colors.imperialRed }]}
            >
              {confirmAction.type === 'coup'
                ? 'GOLPE DE ESTADO'
                : 'ASSASSINATO'}
            </Text>
            <Text style={styles.alertDesc}>
              {confirmAction.type === 'coup'
                ? `Gastar 7 moedas para eliminar ${confirmAction.targetName.toUpperCase()}? A ação é irreversível e não pode ser desafiada nem bloqueada.`
                : `Pagar 3 moedas para ordenar o assassinato de ${confirmAction.targetName.toUpperCase()}? Pode ser bloqueado pela Condessa ou contestado.`}
            </Text>
            <ConsequenceHint
              actionType={confirmAction.type}
              aliveOpponents={alivePlayers - 1}
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.passActionBtn, { flex: 1 }]}
                onPress={cancelDestructive}
              >
                <Text style={styles.secondaryButtonText}>CANCELAR</Text>
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
                onPress={confirmDestructive}
              >
                <Text style={styles.buttonText}>
                  {confirmAction.type === 'coup' ? 'EXECUTAR GOLPE' : 'ASSASSINAR'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Detalhes do oponente (long-press no avatar) */}
      {opponentDetail && (
        <View style={styles.overlay}>
          <View style={[styles.alertBox, { maxWidth: 460 }]}>
            <Text style={styles.alertTitle}>
              {opponentDetail.name.toUpperCase()}
            </Text>
            <View style={styles.opponentStatsRow}>
              <View style={styles.opponentStatBox}>
                <Text style={styles.opponentStatLabel}>MOEDAS</Text>
                <Text style={styles.opponentStatValue}>{opponentDetail.coins}</Text>
              </View>
              <View style={styles.opponentStatBox}>
                <Text style={styles.opponentStatLabel}>INFLUÊNCIAS</Text>
                <Text style={styles.opponentStatValue}>
                  {
                    opponentDetail.cards.filter((c: any) => !c.isFlipped)
                      .length
                  }
                  /{opponentDetail.cards.length}
                </Text>
              </View>
              <View style={styles.opponentStatBox}>
                <Text style={styles.opponentStatLabel}>DESCARTADAS</Text>
                <Text style={styles.opponentStatValue}>
                  {opponentDetail.cards
                    .filter((c: any) => c.isFlipped)
                    .map((c: any) => translateRole(c.role))
                    .join(', ') || '—'}
                </Text>
              </View>
            </View>
            <Text style={styles.opponentHint}>
              Cartas ativas permanecem secretas.
            </Text>
            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: 12 }]}
              onPress={() => setOpponentDetail(null)}
            >
              <Text style={styles.cancelText}>FECHAR</Text>
            </TouchableOpacity>
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
  deckCorner: {
    position: 'absolute',
    top: 62,
    right: 14,
    alignItems: 'center',
    zIndex: 5,
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
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderColor: Theme.colors.imperialRed,
  },
  passActionBtn: {
    backgroundColor: Theme.colors.surfaceHigh,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockActionBtn: {
    backgroundColor: Theme.colors.gold,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSubText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  blockButtonText: {
    color: Theme.colors.background,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  dualBlockRow: { flexDirection: 'row', gap: 10, width: '100%' },
  badgesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
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

  responseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  timelineWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
    marginBottom: 4,
  },
  responseKindPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.radius.pill,
    borderWidth: 1,
  },
  responseKindPillText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  responseTimerPill: {
    minWidth: 46,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.radius.pill,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: 'rgba(198, 161, 91, 0.1)',
    alignItems: 'center',
  },
  responseTimerText: {
    color: Theme.colors.gold,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  narrativeBox: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Theme.radius.md,
    backgroundColor: 'rgba(198, 161, 91, 0.06)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    marginBottom: 14,
    gap: 8,
  },
  narrativeMain: {
    color: Theme.colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  narrativeHint: {
    color: Theme.colors.textMuted,
    fontSize: 10.5,
    lineHeight: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.2,
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

  opponentStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    justifyContent: 'center',
    width: '100%',
  },
  opponentStatBox: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Theme.radius.sm,
    backgroundColor: 'rgba(198, 161, 91, 0.06)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    flexGrow: 1,
    minWidth: 110,
    alignItems: 'center',
  },
  opponentStatLabel: {
    color: Theme.colors.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  opponentStatValue: {
    color: Theme.colors.gold,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  opponentHint: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
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
