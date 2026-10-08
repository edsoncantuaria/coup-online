import 'models.dart';

/// Variações de regra por jogador, usadas pelo modo campanha (punições e
/// bênçãos). [HouseRules.standard] é o Coup oficial; o modo online sempre
/// usa ele.
class HouseRules {
  const HouseRules({
    this.startCoins = const {},
    this.startCards = const {},
    this.coupCost = const {},
    this.assassinCostAgainst = const {},
    this.stealAmount = const {},
    this.forbidden = const {},
    this.firstPlayerId,
    this.shields = const {},
    this.turnTax = const {},
    this.challengeBiasAgainst = const {},
    this.exposeOneCard = const {},
  });

  static const standard = HouseRules();

  /// Moedas iniciais (padrão 2).
  final Map<String, int> startCoins;

  /// Influências iniciais (padrão 2).
  final Map<String, int> startCards;

  /// Custo do Golpe para quem age (padrão 7).
  final Map<String, int> coupCost;

  /// Custo para assassinar este alvo (padrão 3).
  final Map<String, int> assassinCostAgainst;

  /// Quanto a Extorsão deste jogador rouba (padrão 2).
  final Map<String, int> stealAmount;

  /// Ações que este jogador não pode declarar.
  final Map<String, Set<ActionType>> forbidden;

  /// Quem começa; nulo = sorteio.
  final String? firstPlayerId;

  /// Quantas perdas de influência este jogador ignora na partida.
  final Map<String, int> shields;

  /// A cada N turnos deste jogador, ele paga 1 moeda à Coroa.
  final Map<String, int> turnTax;

  /// Quanto os bots somam à chance de desafiar este jogador.
  final Map<String, double> challengeBiasAgainst;

  /// Jogadores com uma carta conhecida pelos bots desde o início.
  final Set<String> exposeOneCard;

  int coinsAtStart(String id) => startCoins[id] ?? 2;
  int cardsAtStart(String id) => startCards[id] ?? 2;
  int coupCostFor(String id) => coupCost[id] ?? 7;
  int assassinCost(String? targetId) =>
      targetId == null ? 3 : (assassinCostAgainst[targetId] ?? 3);
  int stealFor(String id) => stealAmount[id] ?? 2;
  bool allows(String id, ActionType t) =>
      !(forbidden[id]?.contains(t) ?? false);
  double challengeBias(String id) => challengeBiasAgainst[id] ?? 0;
}
