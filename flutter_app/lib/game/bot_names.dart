import 'dart:math';

const _noblePool = [
  'Duque Aldric',
  'Duquesa Elara',
  'Duque Roderic',
  'Duquesa Séraphine',
  'Duque Corvan',
  'Duquesa Isolde',
  'Conde Baltasar',
  'Condessa Margarida',
  'Conde Teobaldo',
  'Condessa Valentina',
  'Conde Leopold',
  'Condessa Clarice',
  'Barão Rufus',
  'Baronesa Helvetia',
  'Barão Eustáquio',
  'Baronesa Lucrécia',
  'Barão Godofredo',
  'Baronesa Ofélia',
  'Sir Tristão',
  'Sir Percival',
  'Sir Galahad',
  'Sir Ronan',
  'Capitão Harren',
  'Dama Ysabel',
  'Dama Morgana',
  'Lorde Mortimer',
  'Lorde Edmund',
  'Lady Beatrice',
  'Lady Rosalind',
  'Mestre Alistair',
  'Mestra Arabella',
];

/// Sorteia [count] nomes nobres distintos para os bots.
List<String> pickBotNames(int count, [Random? rng]) {
  final pool = [..._noblePool]..shuffle(rng ?? Random());
  return pool.take(count).toList();
}
