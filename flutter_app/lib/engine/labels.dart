import 'models.dart';

String roleLabel(Role r) => switch (r) {
  Role.duke => 'Duque',
  Role.assassin => 'Assassino',
  Role.captain => 'Capitão',
  Role.contessa => 'Condessa',
  Role.ambassador => 'Embaixador',
};

/// "o Duque", "a Condessa"...
String roleArticle(Role r) =>
    '${r == Role.contessa ? 'a' : 'o'} ${roleLabel(r)}';

String actionLabel(ActionType t) => switch (t) {
  ActionType.income => 'Renda',
  ActionType.foreignAid => 'Ajuda Externa',
  ActionType.tax => 'Taxa (Duque)',
  ActionType.steal => 'Extorsão (Capitão)',
  ActionType.assassinate => 'Assassinato',
  ActionType.exchange => 'Troca (Embaixador)',
  ActionType.coup => 'Golpe de Estado',
};

String personalityLabel(BotPersonality p) => switch (p) {
  BotPersonality.cautious => 'Cauteloso',
  BotPersonality.tyrant => 'Tirano',
  BotPersonality.bluffer => 'Blefador',
  BotPersonality.balanced => 'Equilibrado',
};
