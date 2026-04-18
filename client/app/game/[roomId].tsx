import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Shield,
  Sword,
  Users,
  Coins,
  LogOut,
  Backpack,
  Trophy,
  History,
  Crown,
  Globe
} from 'lucide-react-native';
import { useGameState } from '../../hooks/useGameState';
import Card from '../../components/Card';
import AmbassadorExchangeView from '../../components/AmbassadorExchangeView';
import GraveyardView from '../../components/GraveyardView';
import { translateRole, translateAction, translatePhase } from '../../utils/translations';

export default function GameScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { roomId: paramRoomId } = useLocalSearchParams();
  
  const players = useGameState(state => state.players);
  const roomId = useGameState(state => state.roomId);
  const phase = useGameState(state => state.phase);
  const logs = useGameState(state => state.logs);
  const socket = useGameState(state => state.socket);
  const isOffline = useGameState(state => state.isOffline);
  const { startGame, addBot, sendAction, sendResponse } = useGameState();
  const waitingForResponseIndex = useGameState(state => state.waitingForResponseIndex);
  const currentAction = useGameState(state => state.currentAction);
  const pendingBlock = useGameState(state => state.pendingBlock);
  const currentPlayerId = useGameState(state => state.currentPlayerId);

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [showGraveyard, setShowGraveyard] = useState(false);

  const myId = isOffline ? 'human-1' : socket?.id;
  const me = players.find(p => p.id === myId);
  const others = players.filter(p => p.id !== myId);

  const actionMap = [
    { id: 'income', label: 'Renda', icon: <Coins size={14} color="#8B0000" />, cost: 0 },
    { id: 'foreign_aid', label: 'Ajuda', icon: <Globe size={14} color="#8B0000" />, cost: 0 },
    { id: 'tax', label: 'Taxa', icon: <Crown size={14} color="#8B0000" />, cost: 0 },
    { id: 'steal', label: 'Extorquir', icon: <Backpack size={14} color="#8B0000" />, cost: 0 },
    { id: 'assassinate', label: 'Assassinar', icon: <Sword size={14} color="#8B0000" />, cost: 3 },
    { id: 'exchange', label: 'Trocar', icon: <History size={14} color="#8B0000" />, cost: 0 },
    { id: 'coup', label: 'Golpe', icon: <Trophy size={14} color="#8B0000" />, cost: 7 },
  ];

  const handleAction = (type: string) => {
    if (me && me.coins >= 10 && type !== 'coup') {
      Alert.alert('Regra Real', 'Como possuis 10 moedas de ouro ou mais, as leis do Reino exigem que realizes um Golpe de Estado imediatamente.');
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

  const getStatusMessage = () => {
    if (phase === 'game_over') return 'O REINO TEM UM NOVO SOBERANO';
    if (phase === 'lobby') return 'CONVOCANDO NOBRES PARA A CORTE';

    const currentP = players.find(p => p.id === currentPlayerId);
    if (!currentP) return '...';

    if ((phase === 'challenge' || phase === 'block') && waitingForResponseIndex !== null) {
      const responder = players[waitingForResponseIndex];
      return `AGUARDANDO DECISÃO DE ${responder?.name?.toUpperCase() || '...'}`;
    }

    return `TURNO DE ${currentP.name.toUpperCase()}`;
  };

  const getGraveyardStats = () => {
    const roles: string[] = ['duke', 'assassin', 'captain', 'contessa', 'ambassador'];
    return roles.map(role => {
      const deadCount = players.reduce((acc, p) =>
        acc + (p.cards?.filter(c => c.role === role && c.isFlipped).length || 0), 0);
      return { role, dead: deadCount, remaining: 3 - deadCount };
    });
  };

  return (
    <View style={[styles.gameContainer, { paddingBottom: insets.bottom + 20 }]}>
      {/* Header */}
      <View style={[styles.gameHeader, { paddingTop: insets.top }]}>
        <View>
          <Text style={styles.headerRoom}>REINO: {roomId || paramRoomId}</Text>
          <Text style={styles.statusBadge}>{translatePhase(phase)}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.statsButton} onPress={() => setShowGraveyard(true)}>
            <History color="#8B0000" size={24} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/')}>
            <LogOut color="#8B0000" size={24} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Status Banner */}
      <View style={styles.statusBanner}>
        <Text style={styles.statusBannerText}>{getStatusMessage()}</Text>
      </View>

      {/* Opponents Carousel */}
      <View style={styles.opponentsContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.opponentsScroll}
        >
          {others.map(p => {
            const isDead = p.cards && p.cards.every(c => c.isFlipped);
            const isActing = currentPlayerId === p.id;
            const isWaiting = waitingForResponseIndex !== null && players[waitingForResponseIndex]?.id === p.id;

            return (
              <View key={p.id} style={[
                styles.oppCard,
                isDead && { opacity: 0.5 },
                isActing && styles.activeOppCard,
                isWaiting && styles.waitingOppCard
              ]}>
                <View style={[
                  styles.avatar,
                  isDead && { borderColor: '#666' },
                  isActing && { borderColor: '#8B0000', borderWidth: 3 },
                  isWaiting && { borderColor: '#D4AF37', borderWidth: 3, backgroundColor: '#FFF' }
                ]}>
                  <Text style={styles.avatarText}>{p.name[0]}</Text>
                </View>
                <Text style={styles.oppName} numberOfLines={1}>{p.name}</Text>
                <View style={styles.oppStats}>
                  <Coins color="#D4AF37" size={14} />
                  <Text style={styles.oppCoins}>{p.coins}</Text>
                  <View style={styles.cardIndicator}>
                    {p.cards?.map((c, i) => (
                      <View
                        key={i}
                        style={[styles.miniCard, c.isFlipped && { backgroundColor: '#666' }]}
                      />
                    ))}
                  </View>
                </View>
                {isDead && (
                  <View style={styles.deadLabel}>
                    <Text style={styles.deadLabelText}>ELIMINADO</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Table Area (Logs) */}
      <View style={styles.tableArea}>
        <Text style={styles.logHeader}>CRÔNICAS DO REINO</Text>
        <ScrollView
          style={styles.logList}
          ref={(ref) => ref?.scrollToEnd({ animated: true })}
        >
          {logs.map((log, i) => (
            <Text key={i} style={styles.logText}>{log}</Text>
          ))}
        </ScrollView>
      </View>

      {/* Player Area */}
      <View style={styles.playerArea}>
        <View style={[styles.playerInfoRow, currentPlayerId === myId && styles.activePlayerRow]}>
          <View style={styles.coinBadge}>
            <Coins color="#D4AF37" size={24} />
            <Text style={styles.playerCoinsText}>{me?.coins || 0}</Text>
          </View>
          <Text style={styles.myNameText}>VOCÊ: {me?.name}</Text>
        </View>

        <View style={styles.myCards}>
          {me?.cards?.map((card, i) => (
            <TouchableOpacity 
                key={i} 
                onPress={() => phase === 'losing_influence' && !card.isFlipped && useGameState.getState().selectInfluence(card.role)}
                disabled={phase !== 'losing_influence' || card.isFlipped}
            >
              <Card
                role={card.role}
                isFlipped={true}
                isDead={card.isFlipped}
                style={[
                    phase === 'losing_influence' && !card.isFlipped && styles.selectableCard,
                ]}
              />
            </TouchableOpacity>
          ))}
          {(!me?.cards || me.cards.length < 2) && Array(2 - (me?.cards?.length || 0)).fill(0).map((_, i) => (
            <View key={`empty-${i}`} style={styles.emptyCardSlot} />
          ))}
        </View>
      </View>

      <GraveyardView visible={showGraveyard} onClose={() => setShowGraveyard(false)} />

      {/* Game Over Modal */}
      {phase === 'game_over' && (
        <View style={styles.overlay}>
           <View style={[styles.alertBox, { borderColor: '#D4AF37', borderWidth: 4 }]}>
            <Trophy color="#D4AF37" size={80} style={{ marginBottom: 20 }} />
            <Text style={styles.alertTitle}>👑 VITÓRIA REAL 👑</Text>
            <Text style={[styles.alertDesc, { fontSize: 24, color: '#8B0000', fontWeight: '900' }]}>
                {players.find(p => p.cards.some(c => !c.isFlipped))?.name?.toUpperCase()} É O ÚNICO SOBERANO!
            </Text>
            <TouchableOpacity 
                style={[styles.primaryButton, { width: '100%', marginTop: 30 }]} 
                onPress={() => router.replace('/')}
            >
              <Text style={styles.buttonText}>VOLTAR AO MENU PRINCIPAL</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Phase Responses Overlay */}
      {(phase === 'challenge' || phase === 'block') && waitingForResponseIndex !== null && players[waitingForResponseIndex]?.id === myId && (() => {
        const actionType = currentAction?.type;
        const isTarget = currentAction?.target === myId;
        const canBlock = (actionType === 'foreign_aid' && phase === 'challenge') ||
                         (actionType === 'steal' && isTarget && phase === 'challenge') ||
                         (actionType === 'assassinate' && isTarget && phase === 'challenge');

        return (
          <View style={styles.overlay}>
            <View style={styles.alertBox}>
              <ScrollView style={{ width: '100%' }} contentContainerStyle={{ alignItems: 'center' }}>
                <Text style={styles.alertTitle}>
                  {phase === 'challenge'
                    ? `⚠️ ${players.find(p => p.id === currentAction?.source)?.name?.toUpperCase() || 'ALGUÉM'} REIVINDICOU ${translateRole(currentAction?.role || '')?.toUpperCase()}!`
                    : `🛡️ ${players.find(p => p.id === pendingBlock?.blockerId)?.name?.toUpperCase() || 'ALGUÉM'} BLOQUEOU!`}
                </Text>
                
                <View style={styles.blockContextBox}>
                  {phase === 'challenge' ? (
                    <Text style={styles.alertSubtitle}>
                      {`Tentando realizar: ${translateAction(currentAction?.type || '').toUpperCase()}`}
                    </Text>
                  ) : (
                    <Text style={styles.alertSubtitle}>
                      {`${players.find(p => p.id === pendingBlock?.blockerId)?.name} barrou seu ${translateAction(pendingBlock?.actionType || '').toUpperCase()} usando ${translateRole(pendingBlock?.role || '').toUpperCase()}`}
                    </Text>
                  )}
                </View>

                <View style={styles.columnGap}>
                  <TouchableOpacity style={styles.challengeActionBtn} onPress={() => sendResponse('challenge')}>
                    <Text style={styles.buttonText}>DESAFIAR</Text>
                  </TouchableOpacity>
                  
                  {canBlock && actionType === 'steal' ? (
                    <View style={styles.dualBlockRow}>
                       <TouchableOpacity style={[styles.blockActionBtn, { flex: 1 }]} onPress={() => sendResponse('block', 'captain')}>
                        <Text style={styles.blockButtonText}>🛡️ CAPITÃO</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.blockActionBtn, { flex: 1, backgroundColor: '#4682B4' }]} onPress={() => sendResponse('block', 'ambassador')}>
                        <Text style={styles.blockButtonText}>🛡️ EMBAIXADOR</Text>
                      </TouchableOpacity>
                    </View>
                  ) : canBlock ? (
                    <TouchableOpacity style={styles.blockActionBtn} onPress={() => sendResponse('block')}>
                      <Text style={styles.blockButtonText}>🛡️ BLOQUEAR</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity style={styles.passActionBtn} onPress={() => sendResponse('pass')}>
                    <Text style={styles.secondaryButtonText}>PERMITIR / PASSAR</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        );
      })()}

      {/* Losing Influence Modal */}
      {phase === 'losing_influence' && waitingForResponseIndex === players.findIndex(p => p.id === myId) && (
        <View style={styles.overlay}>
           <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>🏹 MOMENTO DE SACRIFÍCIO</Text>
            <Text style={styles.alertDesc}>Escolha qual influência você deseja perder.</Text>
            
            <View style={styles.sacrificeCardRow}>
              {me?.cards?.filter(c => !c.isFlipped).map((card, i) => (
                <TouchableOpacity 
                  key={i} 
                  style={styles.sacrificeCardButton}
                  onPress={() => useGameState.getState().selectInfluence(card.role)}
                >
                  <Card role={card.role} isFlipped={true} isDead={false} />
                  <Text style={styles.sacrificeTip}>PERDER {translateRole(card.role).toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Ambassador Exchange */}
      {phase === 'exchanging' && currentPlayerId === myId && (() => {
          const exchangingCards = useGameState.getState().localEngine?.getState().exchangingCards || [];
          const currentAlive = me?.cards?.filter(c => !c.isFlipped).map(c => c.role) || [];
          return (
              <AmbassadorExchangeView 
                options={[...currentAlive, ...exchangingCards]} 
                neededCount={currentAlive.length} 
                onConfirm={(kept) => useGameState.getState().confirmExchange(kept)} 
              />
          );
      })()}

      {/* Target Picker */}
      {showTargetPicker && (
        <View style={styles.overlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>ESCOLHA O ALVO</Text>
            <ScrollView style={{ width: '100%', maxHeight: 300 }}>
              {others.filter(p => p.cards.some(c => !c.isFlipped)).map(p => (
                <TouchableOpacity key={p.id} style={styles.targetItem} onPress={() => selectTarget(p.id)}>
                  <Text style={styles.targetName}>{p.name}</Text>
                  <View style={styles.targetStatRow}>
                    <Coins color="#D4AF37" size={14} />
                    <Text style={styles.targetCoins}>{p.coins}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowTargetPicker(false); setPendingAction(null); }}>
              <Text style={styles.cancelText}>CANCELAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Lobby State Controls */}
      {phase === 'lobby' && (
        <View style={[styles.bottomControlBox, { bottom: insets.bottom + 10 }]}>
          <Text style={styles.waitingText}>NOBRES PRESENTES: {players.length}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.utilityButton} onPress={() => addBot()}>
              <Users color="#D4AF37" size={20} />
              <Text style={styles.utilityButtonText}>CONVOCAR BOT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.startBtn} onPress={() => startGame()}>
              <Sword color="white" size={22} />
              <Text style={styles.startBtnText}>INICIAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Action Bar */}
      {phase === 'action' && currentPlayerId === myId && (
        <View style={styles.actionsBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10 }}>
            {actionMap.map(act => (
              <TouchableOpacity
                key={act.id}
                style={[
                  styles.actionBtn, 
                  (me && me.coins < act.cost) && { opacity: 0.3 },
                  (me && me.coins >= 10 && act.id !== 'coup') && { opacity: 0.2, borderColor: '#ccc' }
                ]}
                onPress={() => handleAction(act.id)}
                disabled={me && (me.coins < act.cost || (me.coins >= 10 && act.id !== 'coup'))}
              >
                {act.icon}
                <Text style={styles.actionBtnText}>{act.label}</Text>
                {act.cost > 0 && <Text style={styles.costText}>({act.cost})</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// Reuse styles from App.tsx (Ported to StyleSheet)
const styles = StyleSheet.create({
  gameContainer: { flex: 1, backgroundColor: '#F4E7D3' },
  gameHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: 'rgba(255,255,255,0.4)', borderBottomWidth: 1, borderBottomColor: '#D4AF37' },
  headerRoom: { fontSize: 14, fontWeight: '900', color: '#5C4033' },
  statusBadge: { fontSize: 10, fontWeight: '700', color: '#8B0000', backgroundColor: 'rgba(139, 0, 0, 0.1)', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  statsButton: { padding: 5 },
  statusBanner: { backgroundColor: '#8B0000', paddingVertical: 8, alignItems: 'center' },
  statusBannerText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  opponentsContainer: { height: 100, backgroundColor: 'rgba(255,255,255,0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(212, 175, 55, 0.2)' },
  opponentsScroll: { paddingHorizontal: 15, paddingVertical: 10, alignItems: 'center', gap: 12 },
  oppCard: { backgroundColor: '#FDFCF0', padding: 12, borderRadius: 18, width: 130, height: 80, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.3)' },
  activeOppCard: { backgroundColor: 'rgba(212, 175, 55, 0.15)', borderColor: '#8B0000', borderWidth: 1.5 },
  waitingOppCard: { borderColor: '#D4AF37', borderWidth: 2, backgroundColor: 'rgba(212, 175, 55, 0.1)' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2F4F4F', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#D4AF37' },
  avatarText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  oppName: { fontSize: 11, color: '#5C4033', fontWeight: '800', marginTop: 4 },
  oppStats: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  oppCoins: { fontSize: 12, fontWeight: '900', color: '#D4AF37', marginLeft: 3 },
  cardIndicator: { flexDirection: 'row', marginLeft: 6 },
  miniCard: { width: 6, height: 9, backgroundColor: '#8B0000', marginHorizontal: 1, borderRadius: 1.5 },
  deadLabel: { position: 'absolute', top: '40%', backgroundColor: 'rgba(139,0,0,0.8)', paddingHorizontal: 5, borderRadius: 4 },
  deadLabelText: { color: 'white', fontSize: 8, fontWeight: '900' },
  tableArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginHorizontal: 15, marginVertical: 10, borderRadius: 25, padding: 15, borderWidth: 1, borderColor: 'rgba(212, 175, 55, 0.1)' },
  logHeader: { fontSize: 10, fontWeight: '900', color: '#8B0000', opacity: 0.6, marginBottom: 10, textAlign: 'center', letterSpacing: 2 },
  logList: { flex: 1 },
  logText: { fontSize: 11, color: '#5C4033', marginBottom: 6, lineHeight: 16, fontWeight: '500' },
  playerArea: { paddingVertical: 15, paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.2)', borderTopWidth: 2, borderTopColor: '#D4AF37' },
  playerInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  activePlayerRow: { backgroundColor: 'rgba(139, 0, 0, 0.05)', borderRadius: 15, padding: 5 },
  coinBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(212, 175, 55, 0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#D4AF37' },
  playerCoinsText: { fontSize: 20, fontWeight: '900', color: '#D4AF37', marginLeft: 6 },
  myNameText: { fontSize: 13, fontWeight: '900', color: '#5C4033' },
  myCards: { flexDirection: 'row', justifyContent: 'center', gap: 15 },
  emptyCardSlot: { width: 140, height: 200, borderRadius: 15, borderWidth: 2, borderColor: 'rgba(0,0,0,0.05)', borderStyle: 'dashed' },
  selectableCard: { borderColor: '#D4AF37', borderWidth: 3, shadowColor: '#D4AF37', shadowOpacity: 0.8, shadowRadius: 10, elevation: 10 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 25, zIndex: 1000 },
  alertBox: { backgroundColor: '#F4E7D3', width: '100%', maxWidth: 500, padding: 25, borderRadius: 30, borderWidth: 4, borderColor: '#D4AF37', alignItems: 'center' },
  alertTitle: { fontSize: 20, fontWeight: '900', color: '#8B0000', marginBottom: 5, textAlign: 'center' },
  alertSubtitle: { fontSize: 14, fontWeight: '700', color: '#D4AF37', textAlign: 'center', marginBottom: 10 },
  alertDesc: { fontSize: 13, color: '#5C4033', textAlign: 'center', marginBottom: 20 },
  columnGap: { width: '100%', gap: 12 },
  primaryButton: { backgroundColor: '#8B0000', height: 60, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: 'white', fontSize: 15, fontWeight: '900' },
  secondaryButtonText: { color: '#8B0000', fontSize: 14, fontWeight: '900' },
  challengeActionBtn: { backgroundColor: '#8B0000', height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  passActionBtn: { borderWidth: 2, borderColor: '#8B0000', height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  blockActionBtn: { backgroundColor: '#D4AF37', height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  blockButtonText: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  sacrificeCardRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginVertical: 20 },
  sacrificeCardButton: { alignItems: 'center', gap: 10 },
  sacrificeTip: { fontSize: 10, fontWeight: '900', color: '#8B0000' },
  actionsBar: { backgroundColor: '#FFF', paddingVertical: 12, borderTopWidth: 2, borderTopColor: '#D4AF37' },
  actionBtn: { backgroundColor: '#FDFCF0', borderWidth: 1.5, borderColor: '#8B0000', paddingHorizontal: 12, height: 45, borderRadius: 15, marginHorizontal: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionBtnText: { color: '#8B0000', fontSize: 11, fontWeight: '900' },
  costText: { fontSize: 9, color: '#8B0000', opacity: 0.7 },
  bottomControlBox: { position: 'absolute', left: 20, right: 20, backgroundColor: '#FFF', padding: 15, borderRadius: 25, borderWidth: 1, borderColor: '#D4AF37', elevation: 5 },
  waitingText: { textAlign: 'center', fontSize: 12, fontWeight: '900', color: '#8B0000', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  utilityButton: { flex: 1, height: 50, borderWidth: 2, borderColor: '#D4AF37', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  utilityButtonText: { color: '#D4AF37', fontSize: 10, fontWeight: '900', marginLeft: 5 },
  startBtn: { flex: 1.5, backgroundColor: '#8B0000', height: 50, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  startBtnText: { color: 'white', fontSize: 14, fontWeight: '900', marginLeft: 10 },
  targetItem: { width: '100%', backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#D4AF37' },
  targetName: { color: '#2F4F4F', fontWeight: '900', fontSize: 14 },
  targetStatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  targetCoins: { color: '#D4AF37', fontWeight: '900', fontSize: 14 },
  cancelBtn: { marginTop: 10, padding: 10 },
  cancelText: { color: '#8B0000', fontWeight: '900', opacity: 0.5, fontSize: 13 },
  blockContextBox: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.2)',
    width: '100%',
  },
  dualBlockRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginBottom: 5,
  },
});

