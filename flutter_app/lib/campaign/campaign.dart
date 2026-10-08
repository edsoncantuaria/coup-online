import 'dart:math';

import 'package:flutter/material.dart';

import '../engine/bot.dart';
import '../engine/house_rules.dart';
import '../engine/models.dart';

/// Vidas extras no início: perder uma partida custa uma vida e repete a
/// corte com outra punição.
const startingLives = 1;

/// Id do jogador humano nas partidas offline.
const campaignHumanId = 'human-1';

// ------------------------------------------------------------------ cortes

class Court {
  const Court(
    this.name,
    this.bots,
    this.personalities, {
    this.curses = 1,
    this.skill = BotSkill.normal,
    this.hardBots = 0,
  });
  final String name;
  final int bots;
  final List<BotPersonality> personalities;
  final int curses;

  /// Nível dos rivais desta corte.
  final BotSkill skill;

  /// Quantos rivais jogam no Difícil, a elite da corte.
  final int hardBots;

  /// Nível de cada rival, na ordem dos assentos.
  List<BotSkill> skillsFor(int count) => [
    for (var i = 0; i < count; i++) i < hardBots ? BotSkill.hard : skill,
  ];
}

const _easy = [BotPersonality.cautious, BotPersonality.balanced];
const _all = BotPersonality.values;
const _hard = [
  BotPersonality.tyrant,
  BotPersonality.bluffer,
  BotPersonality.balanced,
];

/// As sete cortes da campanha, da vila ao trono.
const courts = [
  Court('Vila de Pedra', 1, _easy, skill: BotSkill.easy),
  Court('Taverna do Porto', 2, _easy, skill: BotSkill.easy),
  Court('Mercado de Sedas', 2, _all),
  Court('Mosteiro Sombrio', 3, _all),
  Court('Fortaleza do Norte', 3, _hard, hardBots: 1),
  Court('Salão dos Espelhos', 3, _hard, hardBots: 1),
  Court('Trono de Ferro', 4, _hard, curses: 2, hardBots: 1),
];

// ---------------------------------------------------------------- punições

enum CurseId {
  emptyPockets,
  richRival,
  costlyCoup,
  markedTarget,
  spies,
  suspicious,
  shortClock,
  lastInLine,
  crowdedCourt,
  noFavors,
  royalToll,
  hangingByThread,
}

class Curse {
  const Curse(
    this.id,
    this.name,
    this.description,
    this.icon, {
    this.fromCourt = 0,
    this.untilCourt = 6,
  });
  final CurseId id;
  final String name;
  final String description;
  final IconData icon;

  /// Cortes (índice a partir de 0) em que esta punição pode sair.
  final int fromCourt;
  final int untilCourt;
}

const curseInfo = {
  CurseId.emptyPockets: Curse(
    CurseId.emptyPockets,
    'Bolsos Furados',
    'Você começa a partida sem nenhuma moeda.',
    Icons.money_off,
  ),
  CurseId.richRival: Curse(
    CurseId.richRival,
    'Rival Abastado',
    'Um dos rivais começa com 5 moedas.',
    Icons.savings,
  ),
  CurseId.costlyCoup: Curse(
    CurseId.costlyCoup,
    'Golpe Caro',
    'Seu Golpe de Estado custa 2 moedas a mais.',
    Icons.local_fire_department,
  ),
  CurseId.markedTarget: Curse(
    CurseId.markedTarget,
    'Alvo Marcado',
    'Assassinar você custa só 1 moeda. Os rivais sabem disso.',
    Icons.gps_fixed,
    fromCourt: 1,
    untilCourt: 5,
  ),
  CurseId.spies: Curse(
    CurseId.spies,
    'Espiões na Corte',
    'Os rivais conhecem uma das suas cartas iniciais.',
    Icons.visibility,
  ),
  CurseId.suspicious: Curse(
    CurseId.suspicious,
    'Nobres Desconfiados',
    'Os rivais desafiam suas declarações com muito mais frequência.',
    Icons.policy,
  ),
  CurseId.shortClock: Curse(
    CurseId.shortClock,
    'Relógio Curto',
    'Você tem só 12 segundos para cada decisão.',
    Icons.timer,
  ),
  CurseId.lastInLine: Curse(
    CurseId.lastInLine,
    'Último da Fila',
    'Todos os rivais jogam antes de você na primeira rodada.',
    Icons.low_priority,
  ),
  CurseId.crowdedCourt: Curse(
    CurseId.crowdedCourt,
    'Corte Lotada',
    'Um rival a mais senta à mesa.',
    Icons.groups,
    untilCourt: 5,
  ),
  CurseId.noFavors: Curse(
    CurseId.noFavors,
    'Sem Favores',
    'Você não pode pedir Ajuda Externa.',
    Icons.block,
  ),
  CurseId.royalToll: Curse(
    CurseId.royalToll,
    'Pedágio Real',
    'A cada 3 turnos seus, você paga 1 moeda à Coroa.',
    Icons.account_balance_wallet,
  ),
  CurseId.hangingByThread: Curse(
    CurseId.hangingByThread,
    'Por um Fio',
    'Você começa com uma só influência, mas com 7 moedas.',
    Icons.heart_broken,
    untilCourt: 0,
  ),
};

// ----------------------------------------------------------------- bênçãos

enum BlessingId {
  inheritance,
  contessaVeil,
  lightHand,
  cheapCoup,
  initiative,
  secondChance,
  keenEye,
  reputation,
}

class Blessing {
  const Blessing(
    this.id,
    this.name,
    this.description,
    this.icon, {
    this.stackable = false,
  });
  final BlessingId id;
  final String name;
  final String description;
  final IconData icon;
  final bool stackable;
}

const blessingInfo = {
  BlessingId.inheritance: Blessing(
    BlessingId.inheritance,
    'Herança',
    '+2 moedas no início de cada partida.',
    Icons.paid,
    stackable: true,
  ),
  BlessingId.contessaVeil: Blessing(
    BlessingId.contessaVeil,
    'Véu da Condessa',
    'Uma vez por partida, você ignora a perda de uma influência.',
    Icons.shield_moon,
    stackable: true,
  ),
  BlessingId.lightHand: Blessing(
    BlessingId.lightHand,
    'Mão Leve',
    'Sua Extorsão rouba até 3 moedas.',
    Icons.anchor,
  ),
  BlessingId.cheapCoup: Blessing(
    BlessingId.cheapCoup,
    'Golpe Barato',
    'Seu Golpe de Estado custa 1 moeda a menos.',
    Icons.local_fire_department,
    stackable: true,
  ),
  BlessingId.initiative: Blessing(
    BlessingId.initiative,
    'Iniciativa',
    'Você sempre começa a partida.',
    Icons.flag,
  ),
  BlessingId.secondChance: Blessing(
    BlessingId.secondChance,
    'Segunda Chance',
    '+1 vida: perder uma partida não encerra a campanha.',
    Icons.favorite,
    stackable: true,
  ),
  BlessingId.keenEye: Blessing(
    BlessingId.keenEye,
    'Olho Clínico',
    'No início de cada partida, você vê uma carta de cada rival.',
    Icons.remove_red_eye,
  ),
  BlessingId.reputation: Blessing(
    BlessingId.reputation,
    'Reputação',
    'Os rivais hesitam mais antes de desafiar você.',
    Icons.workspace_premium,
  ),
};

// -------------------------------------------------------------------- run

enum RunStatus { active, won, lost }

class CourtResult {
  CourtResult(this.court, this.curses, this.won);
  final int court;
  final List<CurseId> curses;
  final bool won;

  Map<String, dynamic> toJson() => {
    'court': court,
    'curses': curses.map((c) => c.name).toList(),
    'won': won,
  };

  static CourtResult fromJson(Map j) => CourtResult(j['court'] as int, [
    for (final c in j['curses'] as List) CurseId.values.byName(c as String),
  ], j['won'] as bool);
}

/// Uma campanha em andamento: corte atual, vidas, bênçãos acumuladas e as
/// punições já sorteadas para a próxima partida.
class CampaignRun {
  CampaignRun({
    required this.seed,
    this.court = 0,
    this.lives = 0,
    List<BlessingId>? blessings,
    List<CurseId>? curses,
    Set<CurseId>? usedCurses,
    List<BlessingId>? offer,
    List<CourtResult>? history,
    this.status = RunStatus.active,
  }) : blessings = blessings ?? [],
       curses = curses ?? [],
       usedCurses = usedCurses ?? {},
       offer = offer ?? [],
       history = history ?? [];

  /// Nova campanha com as punições da primeira corte já sorteadas.
  factory CampaignRun.start({Random? random}) {
    final rng = random ?? Random();
    final run = CampaignRun(seed: rng.nextInt(1 << 30), lives: startingLives);
    run.rollCurses(rng);
    return run;
  }

  final int seed;
  int court;
  int lives;
  final List<BlessingId> blessings;

  /// Punições da partida atual.
  List<CurseId> curses;
  final Set<CurseId> usedCurses;

  /// Bênçãos oferecidas após a vitória, aguardando escolha.
  List<BlessingId> offer;
  final List<CourtResult> history;
  RunStatus status;

  Court get currentCourt => courts[court];
  bool get choosingBlessing => offer.isNotEmpty;
  int count(BlessingId b) => blessings.where((x) => x == b).length;
  bool has(BlessingId b) => blessings.contains(b);
  bool hasCurse(CurseId c) => curses.contains(c);

  /// Sorteia as punições da corte atual, sem repetir as já vistas na
  /// campanha enquanto houver opção.
  void rollCurses(Random rng) {
    final n = currentCourt.curses;
    List<CurseId> pool([bool allowUsed = false]) => [
      for (final c in curseInfo.values)
        if (court >= c.fromCourt &&
            court <= c.untilCourt &&
            (allowUsed || !usedCurses.contains(c.id)))
          c.id,
    ];
    var options = pool();
    if (options.length < n) options = pool(true);
    options.shuffle(rng);
    curses = options.take(n).toList();
    usedCurses.addAll(curses);
  }

  /// Registra o resultado da partida atual e avança a campanha.
  void finishMatch(bool won, Random rng) {
    history.add(CourtResult(court, List.of(curses), won));
    if (!won) {
      if (lives > 0) {
        lives -= 1; // tenta de novo a mesma corte, com nova punição
        rollCurses(rng);
      } else {
        status = RunStatus.lost;
      }
      return;
    }
    if (court == courts.length - 1) {
      status = RunStatus.won;
      return;
    }
    offer = _rollOffer(rng);
  }

  List<BlessingId> _rollOffer(Random rng) {
    final options = [
      for (final b in blessingInfo.values)
        if (b.stackable || !has(b.id)) b.id,
    ]..shuffle(rng);
    return options.take(3).toList();
  }

  /// Escolhe a bênção oferecida e segue para a próxima corte.
  void chooseBlessing(BlessingId b, Random rng) {
    if (!offer.contains(b)) return;
    blessings.add(b);
    if (b == BlessingId.secondChance) lives += 1;
    offer = [];
    court += 1;
    rollCurses(rng);
  }

  Map<String, dynamic> toJson() => {
    'seed': seed,
    'court': court,
    'lives': lives,
    'blessings': blessings.map((b) => b.name).toList(),
    'curses': curses.map((c) => c.name).toList(),
    'usedCurses': usedCurses.map((c) => c.name).toList(),
    'offer': offer.map((b) => b.name).toList(),
    'history': history.map((h) => h.toJson()).toList(),
    'status': status.name,
  };

  static CampaignRun fromJson(Map j) => CampaignRun(
    seed: j['seed'] as int,
    court: j['court'] as int,
    lives: j['lives'] as int,
    blessings: [
      for (final b in j['blessings'] as List)
        BlessingId.values.byName(b as String),
    ],
    curses: [
      for (final c in j['curses'] as List) CurseId.values.byName(c as String),
    ],
    usedCurses: {
      for (final c in j['usedCurses'] as List)
        CurseId.values.byName(c as String),
    },
    offer: [
      for (final b in j['offer'] as List) BlessingId.values.byName(b as String),
    ],
    history: [
      for (final h in j['history'] as List) CourtResult.fromJson(h as Map),
    ],
    status: RunStatus.values.byName(j['status'] as String),
  );
}

// ------------------------------------------------------------------ partida

/// Tudo o que a partida da corte atual precisa: rivais, regras e relógio.
class MatchSetup {
  MatchSetup({
    required this.botCount,
    required this.personalities,
    required this.rules,
    required this.turnSeconds,
    required this.keenEye,
    required this.skills,
  });

  final int botCount;

  /// Nível de cada rival.
  final List<BotSkill> skills;
  final List<BotPersonality> personalities;
  final HouseRules rules;
  final int turnSeconds;

  /// Bênção "Olho Clínico": mostrar uma carta de cada rival.
  final bool keenEye;

  static MatchSetup forRun(CampaignRun run, Random rng) {
    const me = campaignHumanId;
    final c = run.currentCourt;
    final bots = (c.bots + (run.hasCurse(CurseId.crowdedCourt) ? 1 : 0)).clamp(
      1,
      5,
    );
    final personalities = [
      for (var i = 0; i < bots; i++)
        c.personalities[rng.nextInt(c.personalities.length)],
    ];

    final inheritance = 2 * run.count(BlessingId.inheritance);
    var coins = 2;
    var cards = 2;
    if (run.hasCurse(CurseId.emptyPockets)) coins = 0;
    if (run.hasCurse(CurseId.hangingByThread)) {
      coins = 7;
      cards = 1;
    }
    coins += inheritance;

    final coupCost =
        (7 +
                (run.hasCurse(CurseId.costlyCoup) ? 2 : 0) -
                run.count(BlessingId.cheapCoup))
            .clamp(5, 9);

    String? first;
    final initiative = run.has(BlessingId.initiative);
    final last = run.hasCurse(CurseId.lastInLine);
    if (initiative && !last) first = me;
    if (last && !initiative) first = 'bot-0';

    final bias =
        (run.hasCurse(CurseId.suspicious) ? 0.3 : 0) +
        (run.has(BlessingId.reputation) ? -0.15 : 0);

    return MatchSetup(
      botCount: bots,
      personalities: personalities,
      skills: c.skillsFor(bots),
      turnSeconds: run.hasCurse(CurseId.shortClock) ? 12 : 30,
      keenEye: run.has(BlessingId.keenEye),
      rules: HouseRules(
        startCoins: {
          me: coins,
          if (run.hasCurse(CurseId.richRival)) 'bot-0': 5,
        },
        startCards: {me: cards},
        coupCost: {me: coupCost},
        assassinCostAgainst: {if (run.hasCurse(CurseId.markedTarget)) me: 1},
        stealAmount: {if (run.has(BlessingId.lightHand)) me: 3},
        forbidden: {
          if (run.hasCurse(CurseId.noFavors)) me: {ActionType.foreignAid},
        },
        firstPlayerId: first,
        shields: {
          if (run.has(BlessingId.contessaVeil))
            me: run.count(BlessingId.contessaVeil),
        },
        turnTax: {if (run.hasCurse(CurseId.royalToll)) me: 3},
        challengeBiasAgainst: {if (bias != 0) me: bias.toDouble()},
        exposeOneCard: {if (run.hasCurse(CurseId.spies)) me},
      ),
    );
  }
}
