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
import MedievalAlert from '../../components/MedievalAlert';
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
  const [alertConfig, setAlertConfig] = useState<{visible: boolean, title: string, message: string}>({
    visible: false, title: '', message: ''
  });

  const myId = isOffline ? 'human-1' : socket?.id;
  const me = players.find(p => p.id === myId);
  const others = players.filter(p => p.id !== myId);

  const actionMap = [
    { id: 'income', label: 'Renda', icon: <Coins size={14} color="#D4AF37" />, cost: 0 },
    { id: 'foreign_aid', label: 'Ajuda', icon: <Globe size={14} color="#D4AF37" />, cost: 0 },
    { id: 'tax', label: 'Taxa', icon: <Crown size={14} color="#D4AF37" />, cost: 0 },
    { id: 'steal', label: 'Extorquir', icon: <Backpack size={14} color="#D4AF37" />, cost: 0 },
    { id: 'assassinate', label: 'Assassinar', icon: <Sword size={14} color="#D4AF37" />, cost: 3 },
    { id: 'exchange', label: 'Trocar', icon: <History size={14} color="#D4AF37" />, cost: 0 },
    { id: 'coup', label: 'Golpe', icon: <Trophy size={14} color="#D4AF37" />, cost: 7 },
  ];

  const handleAction = (type: string) => {
    if (me && me.coins >= 10 && type !== 'coup') {
      setAlertConfig({ visible: true, title: 'Regra Real', message: 'Como possuis 10 moedas de ouro ou mais, as leis do Reino exigem que realizes um Golpe de Estado imediatamente.' });
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
        // Bloquear só é possível na fase 'block' quando ninguém bloqueou ainda (sem pendingBlock)
        const canBlock = (actionType === 'foreign_aid' && phase === 'block' && !pendingBlock) ||
                         (actionType === 'steal' && isTarget && phase === 'block' && !pendingBlock) ||
                         (actionType === 'assassinate' && isTarget && phase === 'block' && !pendingBlock);

        return (
          <View style={styles.overlay}>
            <View style={styles.alertBox}>
              <ScrollView style={{ width: '100%' }} contentContainerStyle={{ alignItems: 'center' }}>
                <Text style={styles.alertTitle}>
                  {phase === 'challenge'
                    ? `⚠️ ${players.find(p => p.id === currentAction?.source)?.name?.toUpperCase() || 'ALGUÉM'} REIVINDICOU ${translateRole(currentAction?.role || '')?.toUpperCase()}!`
                    : pendingBlock
                      ? `🛡️ ${players.find(p => p.id === pendingBlock?.blockerId)?.name?.toUpperCase() || 'ALGUÉM'} BLOQUEOU COM ${translateRole(pendingBlock?.role || '').toUpperCase()}!`
                      : `🛡️ DESEJA BLOQUEAR A AÇÃO?`}
                </Text>
                
                <View style={styles.blockContextBox}>
                  {phase === 'challenge' ? (
                    <Text style={styles.alertSubtitle}>
                      {`Tentando realizar: ${translateAction(currentAction?.type || '').toUpperCase()}`}
                    </Text>
                  ) : pendingBlock ? (
                    <Text style={styles.alertSubtitle}>
                      {`${players.find(p => p.id === pendingBlock?.blockerId)?.name} barrou o ${translateAction(pendingBlock?.actionType || '').toUpperCase()} usando ${translateRole(pendingBlock?.role || '').toUpperCase()}.\nVocê pode desafiar se achar que é blefe!`}
                    </Text>
                  ) : (
                    <Text style={styles.alertSubtitle}>
                      {`${players.find(p => p.id === currentAction?.source)?.name} quer te ${translateAction(currentAction?.type || '').toUpperCase()}. Deseja bloquear?`}
                    </Text>
                  )}
                </View>

                <View style={styles.columnGap}>
                  <TouchableOpacity style={styles.challengeActionBtn} onPress={() => sendResponse('challenge')}>
                    <Text style={styles.buttonText}>
                      {pendingBlock ? `⚔️ DESAFIAR A ${translateRole(pendingBlock.role).toUpperCase()}` : 'DESAFIAR'}
                    </Text>
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

      <MedievalAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, visible: false })}
      />
    </View>
  );
}

// Reuse styles from App.tsx (Ported to StyleSheet)
// Dark Medieval Styling
const styles = StyleSheet.create({
  gameContainer: { flex: 1, backgroundColor: '#0F1318' },
  gameHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingVertical: 15, 
    backgroundColor: '#151A1F', 
    borderBottomWidth: 1, 
    borderBottomColor: '#30363D' 
  },
  headerRoom: { fontSize: 12, fontWeight: '900', color: '#A1ADC1', letterSpacing: 1 },
  statusBadge: { 
    fontSize: 10, 
    fontWeight: '800', 
    color: '#D4AF37', 
    backgroundColor: 'rgba(212, 175, 55, 0.1)', 
    alignSelf: 'flex-start', 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: 6, 
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)'
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  statsButton: { padding: 5 },
  statusBanner: { backgroundColor: '#8E1616', paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#4A0808' },
  statusBannerText: { color: '#EADDCA', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  opponentsContainer: { height: 115, backgroundColor: '#1A1F24', borderBottomWidth: 1, borderBottomColor: '#30363D' },
  opponentsScroll: { paddingHorizontal: 15, paddingVertical: 12, alignItems: 'center', gap: 12 },
  oppCard: { 
    backgroundColor: '#151A1F', 
    padding: 12, 
    borderRadius: 12, 
    width: 140, 
    height: 90, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 1, 
    borderColor: '#30363D' 
  },
  activeOppCard: { backgroundColor: 'rgba(212, 175, 55, 0.05)', borderColor: '#D4AF37', borderWidth: 1.5, shadowColor: '#D4AF37', shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  waitingOppCard: { borderColor: '#8E1616', borderWidth: 2, backgroundColor: 'rgba(142, 22, 22, 0.1)' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#2D333B', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#A1ADC1' },
  avatarText: { color: '#EADDCA', fontWeight: '900', fontSize: 16 },
  oppName: { fontSize: 11, color: '#A1ADC1', fontWeight: '800', marginTop: 6, letterSpacing: 0.5 },
  oppStats: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  oppCoins: { fontSize: 13, fontWeight: '900', color: '#D4AF37', marginLeft: 4, textShadowColor: 'rgba(212, 175, 55, 0.4)', textShadowRadius: 4 },
  cardIndicator: { flexDirection: 'row', marginLeft: 8, gap: 3 },
  miniCard: { width: 7, height: 10, backgroundColor: '#8E1616', borderRadius: 2, borderWidth: 1, borderColor: '#4A0808' },
  deadLabel: { position: 'absolute', top: '40%', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#666' },
  deadLabelText: { color: '#8E1616', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  tableArea: { flex: 1, backgroundColor: '#11151A', marginHorizontal: 15, marginVertical: 12, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: '#2D333B' },
  logHeader: { fontSize: 11, fontWeight: '900', color: '#A1ADC1', opacity: 0.8, marginBottom: 12, textAlign: 'center', letterSpacing: 2 },
  logList: { flex: 1 },
  logText: { fontSize: 12, color: '#8B949E', marginBottom: 8, lineHeight: 18, fontWeight: '500' },
  playerArea: { paddingVertical: 20, paddingHorizontal: 20, backgroundColor: '#151A1F', borderTopWidth: 1, borderTopColor: '#30363D' },
  playerInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  activePlayerRow: { backgroundColor: 'rgba(212, 175, 55, 0.05)', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: '#D4AF37' },
  coinBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1F24', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#D4AF37', shadowColor: '#D4AF37', shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  playerCoinsText: { fontSize: 22, fontWeight: '900', color: '#D4AF37', marginLeft: 8 },
  myNameText: { fontSize: 13, fontWeight: '900', color: '#EADDCA', letterSpacing: 1 },
  myCards: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  emptyCardSlot: { width: 140, height: 200, borderRadius: 12, borderWidth: 2, borderColor: '#2D333B', borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.02)' },
  selectableCard: { borderColor: '#8E1616', borderWidth: 4, shadowColor: '#8E1616', shadowOpacity: 0.8, shadowRadius: 15, elevation: 10, transform: [{ scale: 1.05 }] },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 25, zIndex: 1000 },
  alertBox: { backgroundColor: '#151A1F', width: '100%', maxWidth: 500, padding: 30, borderRadius: 20, borderWidth: 2, borderColor: '#D4AF37', alignItems: 'center', shadowColor: '#D4AF37', shadowOpacity: 0.15, shadowRadius: 30, elevation: 15 },
  alertTitle: { fontSize: 20, fontWeight: '900', color: '#D4AF37', marginBottom: 8, textAlign: 'center', letterSpacing: 1 },
  alertSubtitle: { fontSize: 14, fontWeight: '700', color: '#EADDCA', textAlign: 'center', marginBottom: 12 },
  alertDesc: { fontSize: 13, color: '#A1ADC1', textAlign: 'center', marginBottom: 25 },
  columnGap: { width: '100%', gap: 12 },
  primaryButton: { backgroundColor: '#8E1616', height: 55, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#4A0808' },
  buttonText: { color: '#EADDCA', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  secondaryButtonText: { color: '#8B949E', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  challengeActionBtn: { backgroundColor: '#8E1616', height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#4A0808' },
  passActionBtn: { backgroundColor: '#1A1F24', borderWidth: 1, borderColor: '#30363D', height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  blockActionBtn: { backgroundColor: '#D4AF37', height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  blockButtonText: { color: '#151A1F', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  sacrificeCardRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginVertical: 20 },
  sacrificeCardButton: { alignItems: 'center', gap: 12 },
  sacrificeTip: { fontSize: 11, fontWeight: '900', color: '#8E1616', letterSpacing: 1 },
  actionsBar: { backgroundColor: '#1A1F24', paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#30363D' },
  actionBtn: { backgroundColor: '#151A1F', borderWidth: 1, borderColor: '#D4AF37', paddingHorizontal: 16, height: 50, borderRadius: 12, marginHorizontal: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionBtnText: { color: '#D4AF37', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  costText: { fontSize: 10, color: '#A1ADC1', fontWeight: 'bold' },
  bottomControlBox: { position: 'absolute', left: 20, right: 20, backgroundColor: '#151A1F', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#30363D', elevation: 10, shadowColor: '#000', shadowRadius: 20, shadowOpacity: 0.5 },
  waitingText: { textAlign: 'center', fontSize: 12, fontWeight: '900', color: '#A1ADC1', marginBottom: 15, letterSpacing: 2 },
  row: { flexDirection: 'row', gap: 12 },
  utilityButton: { flex: 1, height: 50, backgroundColor: '#1A1F24', borderWidth: 1, borderColor: '#30363D', borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  utilityButtonText: { color: '#A1ADC1', fontSize: 11, fontWeight: '800', marginLeft: 8, letterSpacing: 0.5 },
  startBtn: { flex: 1.5, backgroundColor: '#D4AF37', height: 50, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  startBtnText: { color: '#151A1F', fontSize: 14, fontWeight: '900', marginLeft: 10, letterSpacing: 1 },
  targetItem: { width: '100%', backgroundColor: '#1A1F24', padding: 16, borderRadius: 12, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#30363D' },
  targetName: { color: '#EADDCA', fontWeight: '800', fontSize: 14 },
  targetStatRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  targetCoins: { color: '#D4AF37', fontWeight: '900', fontSize: 15 },
  cancelBtn: { marginTop: 15, padding: 12, backgroundColor: '#1A1F24', width: '100%', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#30363D' },
  cancelText: { color: '#A1ADC1', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  blockContextBox: {
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.2)',
    width: '100%',
  },
  dualBlockRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 8,
  },
});


