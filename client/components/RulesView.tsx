import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Pressable,
  ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  BookOpen,
  X,
  Crown,
  Sword,
  Shield,
  History as HistoryIcon,
  User,
  Coins,
  Globe,
  Ship,
  RefreshCw,
  Skull,
  AlertTriangle,
  ShieldCheck,
  Zap,
  LucideIcon,
} from 'lucide-react-native';
import { Theme } from '../constants/Theme';

interface RulesViewProps {
  visible: boolean;
  onClose: () => void;
}

type TabKey = 'cards' | 'actions' | 'rules';

interface CardInfo {
  role: string;
  name: string;
  subtitle: string;
  art: ImageSourcePropType;
  colors: [string, string];
  accent: string;
  icon: LucideIcon;
  ability: string;
  blocks: string | null;
  short: string;
}

const CARDS: CardInfo[] = [
  {
    role: 'duke',
    name: 'Duque',
    subtitle: 'Duke Rafael',
    art: require('../assets/cards/duke.png'),
    colors: ['#7A1F1F', '#3F0A0A'],
    accent: '#E7B197',
    icon: Crown,
    ability: 'TAXAR · Recebe 3 moedas do tesouro.',
    blocks: 'Bloqueia AJUDA ESTRANGEIRA.',
    short: 'O nobre do ouro.',
  },
  {
    role: 'assassin',
    name: 'Assassino',
    subtitle: 'The Shadow',
    art: require('../assets/cards/assassin.png'),
    colors: ['#1F1730', '#0D0618'],
    accent: '#B39AD9',
    icon: Sword,
    ability: 'ASSASSINAR · Paga 3 moedas e elimina 1 carta do alvo.',
    blocks: null,
    short: 'A lâmina silenciosa.',
  },
  {
    role: 'captain',
    name: 'Capitão',
    subtitle: 'Captain Volk',
    art: require('../assets/cards/captain.png'),
    colors: ['#1E3A52', '#0A1624'],
    accent: '#8FB8D8',
    icon: Shield,
    ability: 'ROUBAR · Tira 2 moedas de outro jogador.',
    blocks: 'Bloqueia ROUBO.',
    short: 'O mestre das correntes.',
  },
  {
    role: 'ambassador',
    name: 'Embaixador',
    subtitle: 'The Envoy',
    art: require('../assets/cards/ambassador.png'),
    colors: ['#8C6F3D', '#4A3A1E'],
    accent: '#F2D68A',
    icon: HistoryIcon,
    ability: 'TROCAR · Saca 2 cartas do baralho e devolve 2.',
    blocks: 'Bloqueia ROUBO.',
    short: 'A voz das cortes.',
  },
  {
    role: 'contessa',
    name: 'Condessa',
    subtitle: 'The Lady',
    art: require('../assets/cards/contessa.png'),
    colors: ['#3A3448', '#1B1724'],
    accent: '#DCD4E6',
    icon: User,
    ability: 'Não tem ação ativa.',
    blocks: 'Bloqueia ASSASSINATO.',
    short: 'A última barreira.',
  },
];

interface ActionInfo {
  id: string;
  label: string;
  icon: LucideIcon;
  cost: number;
  description: string;
  blockable: boolean;
  challengeable: boolean;
  requires: string | null;
  type: 'basic' | 'character';
}

const ACTIONS: ActionInfo[] = [
  {
    id: 'income',
    label: 'Renda',
    icon: Coins,
    cost: 0,
    description: 'Recebe 1 moeda do tesouro.',
    blockable: false,
    challengeable: false,
    requires: null,
    type: 'basic',
  },
  {
    id: 'foreign_aid',
    label: 'Ajuda Estrangeira',
    icon: Globe,
    cost: 0,
    description: 'Recebe 2 moedas do tesouro.',
    blockable: true,
    challengeable: false,
    requires: null,
    type: 'basic',
  },
  {
    id: 'coup',
    label: 'Golpe',
    icon: Skull,
    cost: 7,
    description: 'Paga 7 moedas e força o alvo a perder 1 influência.',
    blockable: false,
    challengeable: false,
    requires: null,
    type: 'basic',
  },
  {
    id: 'tax',
    label: 'Taxar',
    icon: Crown,
    cost: 0,
    description: 'Recebe 3 moedas do tesouro.',
    blockable: false,
    challengeable: true,
    requires: 'Duque',
    type: 'character',
  },
  {
    id: 'assassinate',
    label: 'Assassinar',
    icon: Sword,
    cost: 3,
    description: 'Paga 3 moedas e elimina 1 influência do alvo.',
    blockable: true,
    challengeable: true,
    requires: 'Assassino',
    type: 'character',
  },
  {
    id: 'steal',
    label: 'Roubar',
    icon: Ship,
    cost: 0,
    description: 'Tira 2 moedas (ou todas, se o alvo tiver menos) do alvo.',
    blockable: true,
    challengeable: true,
    requires: 'Capitão',
    type: 'character',
  },
  {
    id: 'exchange',
    label: 'Trocar',
    icon: RefreshCw,
    cost: 0,
    description: 'Saca 2 cartas do baralho e devolve 2 quaisquer.',
    blockable: false,
    challengeable: true,
    requires: 'Embaixador',
    type: 'character',
  },
];

export default function RulesView({ visible, onClose }: RulesViewProps) {
  const [tab, setTab] = useState<TabKey>('cards');
  const [selectedRole, setSelectedRole] = useState<string>('duke');

  if (!visible) return null;

  const card = CARDS.find((c) => c.role === selectedRole) || CARDS[0];

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <BlurView intensity={20} tint="dark" style={styles.blurLayer} />

      <View style={styles.modal}>
        {/* Cabeçalho */}
        <LinearGradient
          colors={['rgba(198,161,91,0.12)', 'rgba(198,161,91,0.0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerLeft}>
            <View style={styles.headerIconBox}>
              <BookOpen size={18} color={Theme.colors.gold} />
            </View>
            <View>
              <Text style={styles.headerTitle}>COMPÊNDIO DA CORTE</Text>
              <Text style={styles.headerSubtitle}>
                Regras, cartas e ações do reino
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={10}
          >
            <X size={18} color={Theme.colors.textSecondary} />
          </TouchableOpacity>
        </LinearGradient>

        {/* Tabs */}
        <View style={styles.tabs}>
          {[
            { key: 'cards' as TabKey, label: 'CARTAS', icon: Crown },
            { key: 'actions' as TabKey, label: 'AÇÕES', icon: Zap },
            { key: 'rules' as TabKey, label: 'REGRAS', icon: AlertTriangle },
          ].map((t) => {
            const Ic = t.icon;
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tab, active && styles.tabActive]}
                activeOpacity={0.85}
              >
                <Ic
                  size={12}
                  color={active ? Theme.colors.gold : Theme.colors.textMuted}
                />
                <Text
                  style={[
                    styles.tabText,
                    active && { color: Theme.colors.gold },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Conteúdo */}
        <View style={styles.body}>
          {tab === 'cards' && (
            <View style={styles.cardsTab}>
              {/* Lista lateral */}
              <ScrollView
                style={styles.cardList}
                contentContainerStyle={{ paddingVertical: 6 }}
                showsVerticalScrollIndicator={false}
              >
                {CARDS.map((c) => {
                  const active = c.role === selectedRole;
                  const Ic = c.icon;
                  return (
                    <TouchableOpacity
                      key={c.role}
                      onPress={() => setSelectedRole(c.role)}
                      activeOpacity={0.85}
                      style={[
                        styles.cardListItem,
                        active && styles.cardListItemActive,
                      ]}
                    >
                      <View
                        style={[
                          styles.cardListIcon,
                          { backgroundColor: c.colors[0] + 'AA' },
                        ]}
                      >
                        <Ic size={12} color={c.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.cardListName,
                            active && { color: Theme.colors.gold },
                          ]}
                        >
                          {c.name}
                        </Text>
                        <Text style={styles.cardListSub}>{c.short}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Detalhe */}
              <ScrollView
                style={styles.cardDetail}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                <View style={styles.detailArtWrapper}>
                  <Image
                    source={card.art}
                    style={styles.detailArt}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(11,15,20,0.95)']}
                    style={styles.detailArtGradient}
                  />
                  <LinearGradient
                    colors={[card.colors[0] + '55', 'transparent']}
                    style={styles.detailArtTint}
                  />
                  <View style={styles.detailArtHeader}>
                    <View
                      style={[
                        styles.detailBadge,
                        { backgroundColor: card.colors[0] },
                      ]}
                    >
                      <card.icon size={10} color={card.accent} />
                      <Text
                        style={[styles.detailBadgeText, { color: card.accent }]}
                      >
                        {card.subtitle.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.detailArtFooter}>
                    <Text style={styles.detailName}>{card.name.toUpperCase()}</Text>
                    <Text style={styles.detailShort}>{card.short}</Text>
                  </View>
                </View>

                <View style={styles.detailBlock}>
                  <View style={styles.detailBlockHeader}>
                    <Zap size={11} color={Theme.colors.gold} />
                    <Text style={styles.detailBlockTitle}>HABILIDADE</Text>
                  </View>
                  <Text style={styles.detailBlockText}>{card.ability}</Text>
                </View>

                {card.blocks && (
                  <View style={styles.detailBlock}>
                    <View style={styles.detailBlockHeader}>
                      <ShieldCheck size={11} color={Theme.colors.success} />
                      <Text
                        style={[
                          styles.detailBlockTitle,
                          { color: Theme.colors.success },
                        ]}
                      >
                        BLOQUEIO
                      </Text>
                    </View>
                    <Text style={styles.detailBlockText}>{card.blocks}</Text>
                  </View>
                )}

                <View style={styles.detailBlock}>
                  <View style={styles.detailBlockHeader}>
                    <AlertTriangle size={11} color={Theme.colors.bluff} />
                    <Text
                      style={[
                        styles.detailBlockTitle,
                        { color: Theme.colors.bluff },
                      ]}
                    >
                      BLEFE
                    </Text>
                  </View>
                  <Text style={styles.detailBlockText}>
                    Você pode declarar esta carta mesmo sem ela — mas qualquer
                    nobre pode DUVIDAR. Se pegarem seu blefe, você perde 1
                    influência. Se provarem que possui, o desafiante perde.
                  </Text>
                </View>
              </ScrollView>
            </View>
          )}

          {tab === 'actions' && (
            <ScrollView
              style={styles.actionsList}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sectionHeader}>AÇÕES BÁSICAS</Text>
              <Text style={styles.sectionSub}>
                Disponíveis a todos os nobres, sem necessidade de carta.
              </Text>
              {ACTIONS.filter((a) => a.type === 'basic').map((a) => (
                <ActionRow key={a.id} action={a} />
              ))}

              <Text style={[styles.sectionHeader, { marginTop: 14 }]}>
                AÇÕES DE PERSONAGEM
              </Text>
              <Text style={styles.sectionSub}>
                Requerem uma carta específica — mas você pode BLEFAR.
              </Text>
              {ACTIONS.filter((a) => a.type === 'character').map((a) => (
                <ActionRow key={a.id} action={a} />
              ))}
            </ScrollView>
          )}

          {tab === 'rules' && (
            <ScrollView
              style={styles.rulesList}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              <RuleSection
                title="OBJETIVO"
                icon={Crown}
                color={Theme.colors.gold}
              >
                Seja o último nobre com influência. Cada jogador começa com 2
                cartas (influências) e 2 moedas. Quando perde a última carta,
                está fora do jogo.
              </RuleSection>

              <RuleSection
                title="TURNO"
                icon={RefreshCw}
                color={Theme.colors.info}
              >
                No seu turno escolha UMA ação. Ela pode ser básica ou de
                personagem. Depois, os outros podem desafiar (se for de
                personagem) ou bloquear (se for bloqueável).
              </RuleSection>

              <RuleSection
                title="REGRA DAS 10 MOEDAS"
                icon={AlertTriangle}
                color={Theme.colors.error}
              >
                Se começar seu turno com 10 moedas ou mais, você DEVE dar
                Golpe. Nenhuma outra ação é permitida.
              </RuleSection>

              <RuleSection
                title="DESAFIO (DUVIDAR)"
                icon={AlertTriangle}
                color={Theme.colors.bluff}
              >
                Qualquer ação de personagem pode ser desafiada. Se o declarante
                provar ter a carta, o desafiante perde 1 influência e a carta
                provada é trocada. Se estava blefando, o declarante perde 1
                influência e a ação é cancelada.
              </RuleSection>

              <RuleSection
                title="BLOQUEIO"
                icon={ShieldCheck}
                color={Theme.colors.success}
              >
                Certas ações podem ser bloqueadas declarando a carta
                apropriada:
                {'\n'}• Ajuda Estrangeira → Duque
                {'\n'}• Assassinato → Condessa
                {'\n'}• Roubo → Capitão ou Embaixador
                {'\n'}O bloqueio também pode ser desafiado.
              </RuleSection>

              <RuleSection
                title="PERDER INFLUÊNCIA"
                icon={Skull}
                color={Theme.colors.imperialRed}
              >
                Você escolhe qual carta virar para baixo (revelando-a) quando
                perde influência. A carta revelada fica visível para todos e
                não pode mais ser usada.
              </RuleSection>

              <RuleSection
                title="ASSASSINATO"
                icon={Sword}
                color={Theme.colors.imperialRed}
              >
                Paga 3 moedas ao DECLARAR (mesmo que seja bloqueado ou
                desafiado). Se resolvido, o alvo perde 1 influência.
              </RuleSection>

              <RuleSection
                title="GOLPE"
                icon={Skull}
                color={Theme.colors.imperialRed}
              >
                Paga 7 moedas e força o alvo a perder 1 influência.
                Imbloqueável e indesafiável. A forma mais direta de vencer.
              </RuleSection>
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

function ActionRow({ action }: { action: ActionInfo }) {
  const Ic = action.icon;
  return (
    <View style={styles.actionRow}>
      <View
        style={[
          styles.actionIcon,
          action.type === 'character'
            ? styles.actionIconChar
            : styles.actionIconBasic,
        ]}
      >
        <Ic
          size={14}
          color={
            action.type === 'character'
              ? Theme.colors.bluff
              : Theme.colors.gold
          }
        />
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.actionTitleRow}>
          <Text style={styles.actionName}>{action.label.toUpperCase()}</Text>
          {action.cost > 0 && (
            <View style={styles.actionCost}>
              <Coins size={9} color={Theme.colors.gold} />
              <Text style={styles.actionCostText}>−{action.cost}</Text>
            </View>
          )}
          {action.requires && (
            <View style={styles.actionRequires}>
              <Text style={styles.actionRequiresText}>
                {action.requires.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.actionDesc}>{action.description}</Text>
        <View style={styles.actionTags}>
          <Tag
            label={action.challengeable ? 'DESAFIÁVEL' : 'INDESAFIÁVEL'}
            tone={action.challengeable ? 'bluff' : 'muted'}
          />
          <Tag
            label={action.blockable ? 'BLOQUEÁVEL' : 'IMBLOQUEÁVEL'}
            tone={action.blockable ? 'success' : 'muted'}
          />
        </View>
      </View>
    </View>
  );
}

function Tag({
  label,
  tone,
}: {
  label: string;
  tone: 'muted' | 'bluff' | 'success';
}) {
  const map = {
    muted: {
      bg: 'rgba(107, 115, 128, 0.12)',
      color: Theme.colors.textMuted,
      border: Theme.colors.borderSoft,
    },
    bluff: {
      bg: Theme.colors.bluffSoft,
      color: Theme.colors.bluff,
      border: 'rgba(155, 123, 212, 0.3)',
    },
    success: {
      bg: Theme.colors.successSoft,
      color: Theme.colors.success,
      border: 'rgba(79, 167, 106, 0.3)',
    },
  } as const;
  const s = map[tone];
  return (
    <View
      style={[
        styles.tag,
        { backgroundColor: s.bg, borderColor: s.border },
      ]}
    >
      <Text style={[styles.tagText, { color: s.color }]}>{label}</Text>
    </View>
  );
}

function RuleSection({
  title,
  icon: Ic,
  color,
  children,
}: {
  title: string;
  icon: LucideIcon;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.ruleSection}>
      <View style={styles.ruleHeader}>
        <View style={[styles.ruleIcon, { backgroundColor: color + '22' }]}>
          <Ic size={12} color={color} />
        </View>
        <Text style={[styles.ruleTitle, { color }]}>{title}</Text>
      </View>
      <Text style={styles.ruleBody}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    zIndex: 2000,
  },
  blurLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  modal: {
    width: '100%',
    height: '100%',
    maxWidth: 760,
    maxHeight: 440,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    overflow: 'hidden',
    flexDirection: 'column',
    ...Theme.shadows.premium,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    backgroundColor: 'rgba(198,161,91,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: Theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  headerSubtitle: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginTop: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
    backgroundColor: Theme.colors.secondary,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  tabActive: {
    backgroundColor: 'rgba(198,161,91,0.1)',
    borderColor: Theme.colors.goldLine,
  },
  tabText: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
  },

  body: {
    flex: 1,
    minHeight: 0,
  },

  /* Cards tab */
  cardsTab: {
    flex: 1,
    flexDirection: 'row',
  },
  cardList: {
    width: 160,
    borderRightWidth: 1,
    borderRightColor: Theme.colors.borderSoft,
    paddingHorizontal: 6,
  },
  cardListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: Theme.radius.sm,
    marginBottom: 4,
  },
  cardListItemActive: {
    backgroundColor: 'rgba(198,161,91,0.08)',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
  },
  cardListIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardListName: {
    color: Theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  cardListSub: {
    color: Theme.colors.textMuted,
    fontSize: 9,
    fontStyle: 'italic',
    marginTop: 1,
  },
  cardDetail: {
    flex: 1,
    padding: 10,
  },
  detailArtWrapper: {
    width: '100%',
    aspectRatio: 1.4,
    borderRadius: Theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.colors.goldLine,
    marginBottom: 10,
  },
  detailArt: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  detailArtGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  detailArtTint: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '40%',
  },
  detailArtHeader: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  detailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Theme.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  detailBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  detailArtFooter: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    right: 10,
  },
  detailName: {
    color: Theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2.5,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  detailShort: {
    color: Theme.colors.gold,
    fontSize: 10,
    fontWeight: '600',
    fontStyle: 'italic',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  detailBlock: {
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  detailBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  detailBlockTitle: {
    color: Theme.colors.gold,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
  },
  detailBlockText: {
    color: Theme.colors.text,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },

  /* Actions tab */
  actionsList: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  sectionHeader: {
    color: Theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.2,
    marginBottom: 2,
  },
  sectionSub: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.borderSoft,
    marginBottom: 6,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionIconBasic: {
    backgroundColor: 'rgba(198,161,91,0.08)',
    borderColor: Theme.colors.goldLine,
  },
  actionIconChar: {
    backgroundColor: Theme.colors.bluffSoft,
    borderColor: 'rgba(155,123,212,0.3)',
  },
  actionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  actionName: {
    color: Theme.colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  actionCost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Theme.radius.sm,
    backgroundColor: 'rgba(168,58,58,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168,58,58,0.3)',
  },
  actionCostText: {
    color: Theme.colors.imperialRed,
    fontSize: 9,
    fontWeight: '900',
  },
  actionRequires: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Theme.radius.sm,
    backgroundColor: Theme.colors.bluffSoft,
    borderWidth: 1,
    borderColor: 'rgba(155,123,212,0.3)',
  },
  actionRequiresText: {
    color: Theme.colors.bluff,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  actionDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 10.5,
    lineHeight: 15,
  },
  actionTags: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  /* Rules tab */
  rulesList: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  ruleSection: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.borderSoft,
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  ruleIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  ruleBody: {
    color: Theme.colors.text,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    paddingLeft: 30,
  },
});
