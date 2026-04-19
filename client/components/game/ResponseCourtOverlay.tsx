import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Swords, Shield, Check, X } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import FlowTimeline from './FlowTimeline';
import CircularTimer from './CircularTimer';
import ActorAvatar from './ActorAvatar';

export type ResponseMode =
  | 'challenge_action'
  | 'challenge_block'
  | 'block_foreign_aid'
  | 'block_steal'
  | 'block_assassinate';

export interface FlowStepDef {
  id: 'action' | 'block' | 'challenge_block';
  label: string;
}

interface Props {
  mode: ResponseMode;
  actorName: string;
  blockerName?: string | null;
  targetName?: string | null;
  iAmActor: boolean;
  iAmTarget: boolean;
  /** Papel em julgamento (ação reivindicada ou bloqueio reivindicado). */
  claimedRole: string;
  /** Tipo da ação que desencadeou (ex: 'tax', 'steal', 'assassinate'...). */
  actionType: string;
  /** Papéis vivos do jogador humano (info privada). */
  myAliveRoles: string[];
  /** Quantas dessas cartas restam em jogo (publico), por papel. */
  remainingByRole: Record<string, number>;
  /** Segundos restantes no timer de resposta. */
  timer: number | null;
  /** Timer máximo (default 30). */
  maxTimer?: number;

  onChallenge: () => void;
  onBlock: (role: string) => void;
  onPass: () => void;
}

// ──────────────────────────────────────────
// Dicionários visuais e narrativos
// ──────────────────────────────────────────

const ROLE_PT: Record<string, string> = {
  duke: 'DUQUE',
  captain: 'CAPITÃO',
  ambassador: 'EMBAIXADOR',
  assassin: 'ASSASSINO',
  contessa: 'CONDESSA',
};

const ROLE_TINT: Record<string, string> = {
  duke: '#C6A15B',
  assassin: '#A84A4A',
  captain: '#5E83B5',
  ambassador: '#4E9477',
  contessa: '#B56B57',
};

const ACTION_PT: Record<string, string> = {
  tax: 'COBRAR IMPOSTOS',
  steal: 'ROUBAR MOEDAS',
  assassinate: 'ASSASSINAR',
  exchange: 'TROCAR CARTAS',
  foreign_aid: 'AJUDA EXTERNA',
  income: 'RENDA',
  coup: 'GOLPE',
};

/** Frases dinâmicas de personagem (flavor). Uma por papel reivindicado. */
const FLAVOR_BY_ROLE: Record<string, string[]> = {
  duke: [
    '"Os impostos do reino... são meus por direito."',
    '"O tesouro pertence à coroa. E a coroa sou eu."',
    '"Vocês pagam. Eu cobro. É assim que funciona."',
  ],
  captain: [
    '"Belas moedas. Vou guardá-las para você."',
    '"Considere isto uma taxa de passagem."',
    '"O mar é meu. Suas moedas, também."',
  ],
  ambassador: [
    '"Deixem-me apenas... reorganizar meus contatos."',
    '"Diplomacia exige discrição. E novas cartas."',
    '"Nem toda influência se revela aos olhos."',
  ],
  assassin: [
    '"Isto será rápido. Eu prometo."',
    '"Nada pessoal. Apenas trabalho."',
    '"Dormir é um luxo que você não pode mais pagar."',
  ],
  contessa: [
    '"Meu sangue nobre não será derramado hoje."',
    '"Já enterrei três como você."',
    '"A Condessa protege os seus. Sempre."',
  ],
};

function pickFlavor(role: string, seed: string): string | null {
  const pool = FLAVOR_BY_ROLE[role];
  if (!pool || pool.length === 0) return null;
  // Seed estável por ator+papel (evita mudar a cada render).
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

// ──────────────────────────────────────────
// Componente
// ──────────────────────────────────────────

export default function ResponseCourtOverlay({
  mode,
  actorName,
  blockerName,
  targetName,
  iAmActor,
  iAmTarget,
  claimedRole,
  actionType,
  myAliveRoles,
  remainingByRole,
  timer,
  maxTimer = 30,
  onChallenge,
  onBlock,
  onPass,
}: Props) {
  // Animação de entrada: fade + scale.
  const entrance = useSharedValue(0);
  useEffect(() => {
    entrance.value = withTiming(1, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, []);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { scale: 0.94 + entrance.value * 0.06 },
      { translateY: (1 - entrance.value) * 10 },
    ] as NonNullable<ViewStyle['transform']>,
  }));

  // Ator principal em destaque varia conforme o modo.
  const focusName =
    mode === 'challenge_block' ? blockerName || actorName : actorName;
  const focusTint = ROLE_TINT[claimedRole] || Theme.colors.gold;

  // Timeline do fluxo.
  const BLOCKABLE = new Set(['foreign_aid', 'steal', 'assassinate']);
  const isBlockable = BLOCKABLE.has(actionType);
  const flowSteps: FlowStepDef[] = useMemo(() => {
    const arr: FlowStepDef[] = [{ id: 'action', label: 'AÇÃO' }];
    if (isBlockable) arr.push({ id: 'block', label: 'BLOQUEIO' });
    if (mode === 'challenge_block')
      arr.push({ id: 'challenge_block', label: 'DESAFIO AO BLOQUEIO' });
    return arr;
  }, [isBlockable, mode]);

  const flowActive: FlowStepDef['id'] =
    mode === 'challenge_action'
      ? 'action'
      : mode === 'challenge_block'
      ? 'challenge_block'
      : 'block';

  const stepIdx = flowSteps.findIndex((s) => s.id === flowActive) + 1;
  const stepCount = flowSteps.length;

  // Qual é a pergunta "rei da tela"?
  const question =
    mode === 'challenge_action'
      ? 'VOCÊ ACREDITA NELE?'
      : mode === 'challenge_block'
      ? 'O BLOQUEIO É VERDADE?'
      : mode === 'block_assassinate'
      ? 'BLOQUEAR O ASSASSINATO?'
      : mode === 'block_steal'
      ? 'IMPEDIR O ROUBO?'
      : 'BLOQUEAR A AJUDA?';

  const subtitle =
    mode === 'challenge_action' || mode === 'challenge_block'
      ? 'ETAPA ' + stepIdx + ' DE ' + stepCount + ' · DESAFIO'
      : 'ETAPA ' + stepIdx + ' DE ' + stepCount + ' · BLOQUEIO';

  const headerColor =
    mode === 'challenge_action' || mode === 'challenge_block'
      ? Theme.colors.imperialRed
      : Theme.colors.info;

  const iHave = (r: string) => myAliveRoles.includes(r);
  const remainingOf = (r: string) => remainingByRole[r] ?? 3;

  const flavor = useMemo(
    () => pickFlavor(claimedRole, focusName + '|' + claimedRole),
    [claimedRole, focusName],
  );

  // Texto da "ação declarada" (ex: "Quer usar: TROCAR CARTAS").
  const actionLabel =
    mode === 'challenge_action'
      ? `QUER USAR: ${ACTION_PT[actionType] || actionType.toUpperCase()}`
      : mode === 'challenge_block'
      ? `BLOQUEANDO: ${ACTION_PT[actionType] || actionType.toUpperCase()}`
      : `${
          iAmTarget ? 'ALVO: VOCÊ · ' : ''
        }${ACTION_PT[actionType] || actionType.toUpperCase()}`;

  const claimTitle =
    mode === 'challenge_action'
      ? 'DIZ SER'
      : mode === 'challenge_block'
      ? 'DIZ TER'
      : mode === 'block_foreign_aid'
      ? 'BLOQUEÁVEL POR'
      : 'DIZ SER';

  // Consequência: 2 linhas (se ✓ / se ✗)
  const consequence = buildConsequence(mode, {
    actorName,
    blockerName: blockerName || '',
    iAmActor,
    iHaveContessa: iHave('contessa'),
  });

  // Mostra botões de bloqueio? quem? qual lado do desafio?
  const canChallenge =
    mode === 'challenge_action' || mode === 'challenge_block';
  const canBlock =
    mode === 'block_foreign_aid' ||
    (mode === 'block_steal' && iAmTarget) ||
    (mode === 'block_assassinate' && iAmTarget);

  const screenW = Dimensions.get('window').width;
  const tightLayout = screenW < 700;

  return (
    <View style={styles.overlay}>
      {/* Fundo: blur + vinheta radial */}
      <BlurView
        intensity={Platform.OS === 'android' ? 30 : 45}
        tint="dark"
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.35)',
          'rgba(0,0,0,0.72)',
          'rgba(0,0,0,0.88)',
        ]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View style={[styles.card, cardStyle]}>
        {/* Borda luminosa externa sutil */}
        <LinearGradient
          colors={[headerColor + '40', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.cardGlow}
          pointerEvents="none"
        />

        <ScrollView
          style={{ width: '100%' }}
          contentContainerStyle={{ alignItems: 'center', paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Topo: etapa e timer circular */}
          <View style={styles.topRow}>
            <View style={styles.stepPill}>
              <View
                style={[
                  styles.stepDot,
                  { backgroundColor: headerColor },
                ]}
              />
              <Text
                style={[styles.stepText, { color: Theme.colors.textSecondary }]}
              >
                {subtitle}
              </Text>
            </View>
            {timer !== null && (
              <CircularTimer
                seconds={timer}
                max={maxTimer}
                size={48}
                color={Theme.colors.gold}
                warnColor={Theme.colors.imperialRed}
              />
            )}
          </View>

          {/* Timeline */}
          <View style={styles.timelineSlot}>
            <FlowTimeline
              steps={flowSteps}
              active={flowActive}
              activeColor={headerColor}
            />
          </View>

          {/* Pergunta dramática */}
          <Animated.Text
            entering={FadeIn.delay(120).duration(280)}
            style={styles.question}
          >
            {question}
          </Animated.Text>

          {/* Card do acusado / em foco */}
          <Animated.View
            entering={FadeIn.delay(180).duration(320)}
            style={[styles.actorCard, { borderColor: focusTint + '55' }]}
          >
            <ActorAvatar name={focusName} tint={focusTint} size={52} pulse />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.actorName} numberOfLines={1}>
                {focusName.toUpperCase()}
              </Text>
              <View style={styles.claimRow}>
                <Text style={styles.claimLabel}>{claimTitle}</Text>
                <View
                  style={[
                    styles.roleChip,
                    {
                      borderColor: focusTint,
                      backgroundColor: focusTint + '22',
                    },
                  ]}
                >
                  <Text style={[styles.roleChipText, { color: focusTint }]}>
                    {ROLE_PT[claimedRole] || claimedRole.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.actionLine} numberOfLines={2}>
                {actionLabel}
              </Text>
            </View>
          </Animated.View>

          {/* Frase dinâmica (flavor) */}
          {flavor && (
            <Animated.Text
              entering={FadeIn.delay(260).duration(300)}
              style={styles.flavor}
            >
              {flavor}
            </Animated.Text>
          )}

          {/* Consequência visual */}
          <Animated.View
            entering={FadeIn.delay(320).duration(280)}
            style={styles.consequenceBox}
          >
            <Text style={styles.consequenceTitle}>
              {consequence.title}
            </Text>
            <View style={styles.consRow}>
              <View
                style={[
                  styles.consIconWrap,
                  { backgroundColor: Theme.colors.successSoft },
                ]}
              >
                <Check size={14} color={Theme.colors.success} strokeWidth={3} />
              </View>
              <Text style={styles.consText}>{consequence.good}</Text>
            </View>
            <View style={styles.consRow}>
              <View
                style={[
                  styles.consIconWrap,
                  { backgroundColor: 'rgba(168, 58, 58, 0.18)' },
                ]}
              >
                <X size={14} color={Theme.colors.imperialRed} strokeWidth={3} />
              </View>
              <Text style={styles.consText}>{consequence.bad}</Text>
            </View>
          </Animated.View>

          {/* Botões: DESAFIAR/CONFIAR lado a lado, ou bloqueios */}
          <Animated.View
            entering={FadeIn.delay(380).duration(300)}
            style={[
              styles.buttonsRow,
              tightLayout && canBlock && mode === 'block_steal'
                ? { flexDirection: 'column', gap: 8 }
                : null,
            ]}
          >
            {canChallenge && (
              <>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.btn, styles.btnDanger]}
                  onPress={onChallenge}
                >
                  <Swords size={15} color="#FFF" strokeWidth={2.4} />
                  <Text style={styles.btnDangerText}>DESAFIAR</Text>
                  <Text style={styles.btnSub}>
                    {ROLE_PT[claimedRole] || claimedRole.toUpperCase()} ·{' '}
                    {remainingOf(claimedRole)}/3
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.btn, styles.btnTrust]}
                  onPress={onPass}
                >
                  <Check size={15} color={Theme.colors.gold} strokeWidth={3} />
                  <Text style={styles.btnTrustText}>CONFIAR</Text>
                  <Text style={styles.btnSubMuted}>AÇÃO SEGUE</Text>
                </TouchableOpacity>
              </>
            )}

            {canBlock && mode === 'block_steal' && (
              <>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.btn,
                    styles.btnBlock,
                    { backgroundColor: 'rgba(94, 131, 181, 0.18)' },
                  ]}
                  onPress={() => onBlock('captain')}
                >
                  <Shield size={15} color="#8FB3D9" strokeWidth={2.4} />
                  <Text style={[styles.btnBlockText, { color: '#8FB3D9' }]}>
                    BLOQUEAR
                  </Text>
                  <Text style={styles.btnSub}>
                    {iHave('captain') ? '✓ TENHO CAPITÃO' : '⚠ BLEFE CAPITÃO'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.btn,
                    styles.btnBlock,
                    { backgroundColor: 'rgba(78, 148, 119, 0.18)' },
                  ]}
                  onPress={() => onBlock('ambassador')}
                >
                  <Shield size={15} color="#79C29B" strokeWidth={2.4} />
                  <Text style={[styles.btnBlockText, { color: '#79C29B' }]}>
                    BLOQUEAR
                  </Text>
                  <Text style={styles.btnSub}>
                    {iHave('ambassador')
                      ? '✓ TENHO EMBAIXADOR'
                      : '⚠ BLEFE EMBAIXADOR'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.btn, styles.btnTrust]}
                  onPress={onPass}
                >
                  <X size={15} color={Theme.colors.textSecondary} strokeWidth={3} />
                  <Text style={styles.btnTrustText}>NÃO BLOQUEAR</Text>
                  <Text style={styles.btnSubMuted}>ROUBO ACONTECE</Text>
                </TouchableOpacity>
              </>
            )}

            {canBlock && mode === 'block_assassinate' && (
              <>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.btn,
                    styles.btnBlock,
                    { backgroundColor: 'rgba(181, 107, 87, 0.22)' },
                  ]}
                  onPress={() => onBlock('contessa')}
                >
                  <Shield size={15} color="#D48A72" strokeWidth={2.4} />
                  <Text style={[styles.btnBlockText, { color: '#D48A72' }]}>
                    BLOQUEAR
                  </Text>
                  <Text style={styles.btnSub}>
                    {iHave('contessa') ? '✓ TENHO CONDESSA' : '⚠ BLEFE CONDESSA'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.btn, styles.btnTrust]}
                  onPress={onPass}
                >
                  <X size={15} color={Theme.colors.textSecondary} strokeWidth={3} />
                  <Text style={styles.btnTrustText}>NÃO BLOQUEAR</Text>
                  <Text style={styles.btnSubMuted}>PERDE 1 INFLUÊNCIA</Text>
                </TouchableOpacity>
              </>
            )}

            {canBlock && mode === 'block_foreign_aid' && (
              <>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.btn,
                    styles.btnBlock,
                    { backgroundColor: 'rgba(198, 161, 91, 0.22)' },
                  ]}
                  onPress={() => onBlock('duke')}
                >
                  <Shield size={15} color={Theme.colors.gold} strokeWidth={2.4} />
                  <Text
                    style={[styles.btnBlockText, { color: Theme.colors.gold }]}
                  >
                    BLOQUEAR
                  </Text>
                  <Text style={styles.btnSub}>
                    {iHave('duke') ? '✓ TENHO DUQUE' : '⚠ BLEFE DUQUE'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.btn, styles.btnTrust]}
                  onPress={onPass}
                >
                  <X size={15} color={Theme.colors.textSecondary} strokeWidth={3} />
                  <Text style={styles.btnTrustText}>NÃO BLOQUEAR</Text>
                  <Text style={styles.btnSubMuted}>AÇÃO SEGUE</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ──────────────────────────────────────────
// Consequências por modo (single source of truth)
// ──────────────────────────────────────────

function buildConsequence(
  mode: ResponseMode,
  ctx: {
    actorName: string;
    blockerName: string;
    iAmActor: boolean;
    iHaveContessa: boolean;
  },
): { title: string; good: string; bad: string } {
  const actor = ctx.actorName.toUpperCase();
  const blocker = ctx.blockerName.toUpperCase();

  switch (mode) {
    case 'challenge_action':
      return {
        title: 'SE DESAFIAR',
        good: `Se ele mentiu → ${actor} perde 1 carta`,
        bad: 'Se ele falou a verdade → você perde 1 carta',
      };
    case 'challenge_block':
      return {
        title: 'SE DESAFIAR O BLOQUEIO',
        good: ctx.iAmActor
          ? `Se ${blocker} blefou → ele perde 1 · sua ação segue`
          : `Se ${blocker} blefou → ele perde 1 · ação segue`,
        bad: 'Se o bloqueio era real → você perde 1 carta',
      };
    case 'block_assassinate':
      return {
        title: 'SE BLOQUEAR COM CONDESSA',
        good: 'Se acreditarem → assassinato anulado',
        bad: ctx.iHaveContessa
          ? 'Se contestado → você prova e atacante perde 1'
          : 'Se contestado → você perde 2 (blefe + assassinato)',
      };
    case 'block_steal':
      return {
        title: 'SE BLOQUEAR O ROUBO',
        good: 'Se acreditarem → roubo impedido',
        bad: 'Se contestado e era blefe → você perde 1 carta',
      };
    case 'block_foreign_aid':
      return {
        title: 'SE BLOQUEAR COM DUQUE',
        good: 'Se acreditarem → ajuda anulada',
        bad: 'Se contestado e era blefe → você perde 1 carta',
      };
  }
}

// ──────────────────────────────────────────
// Estilos
// ──────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    zIndex: 9000,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '94%',
    backgroundColor: 'rgba(20, 25, 35, 0.82)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    // Sombra forte de profundidade
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 14,
  },
  cardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stepText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  timelineSlot: {
    marginTop: 6,
    marginBottom: 6,
  },
  question: {
    fontSize: 20,
    fontWeight: '900',
    color: Theme.colors.text,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  actorCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  actorName: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    color: Theme.colors.text,
    marginBottom: 4,
  },
  claimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  claimLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: Theme.colors.textMuted,
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Theme.radius.pill,
    borderWidth: 1,
  },
  roleChipText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  actionLine: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: Theme.colors.textSecondary,
  },
  flavor: {
    marginTop: 10,
    fontStyle: 'italic',
    fontSize: 11,
    color: Theme.colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  consequenceBox: {
    width: '100%',
    marginTop: 14,
    paddingHorizontal: 4,
  },
  consequenceTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    color: Theme.colors.textMuted,
    marginBottom: 8,
  },
  consRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  consIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.text,
    letterSpacing: 0.3,
  },
  buttonsRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    minHeight: 62,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
  },
  btnDanger: {
    backgroundColor: 'rgba(168, 58, 58, 0.22)',
    borderColor: Theme.colors.imperialRed,
    shadowColor: Theme.colors.imperialRed,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  btnDangerText: {
    color: '#FFE3E0',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 2,
  },
  btnTrust: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  btnTrustText: {
    color: Theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 2,
  },
  btnBlock: {
    borderColor: 'rgba(255,255,255,0.14)',
  },
  btnBlockText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 2,
  },
  btnSub: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: Theme.colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  btnSubMuted: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: Theme.colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
});
