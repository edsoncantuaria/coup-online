/**
 * Nomes imersivos para bots da corte.
 * Cada nome carrega título nobiliárquico + prenome + sobrenome/epíteto,
 * mantendo o tom medieval do jogo.
 *
 * A personalidade do bot fica no estado interno (player.personality) e continua
 * sendo usada pelo BotManager — ela não precisa aparecer no nome exibido.
 */

const NOBLE_POOL: string[] = [
  // Duques e duquesas
  'Duque Aldric',
  'Duquesa Elara',
  'Duque Roderic',
  'Duquesa Séraphine',
  'Duque Corvan',
  'Duquesa Isolde',

  // Condes e condessas
  'Conde Baltasar',
  'Condessa Margarida',
  'Conde Teobaldo',
  'Condessa Valentina',
  'Conde Leopold',
  'Condessa Clarice',

  // Barões e baronesas
  'Barão Rufus',
  'Baronesa Helvetia',
  'Barão Eustáquio',
  'Baronesa Lucrécia',
  'Barão Godofredo',
  'Baronesa Ofélia',

  // Capitães e cavaleiros
  'Sir Tristão',
  'Sir Percival',
  'Sir Galahad',
  'Sir Ronan',
  'Capitão Harren',
  'Dama Ysabel',
  'Dama Morgana',

  // Epítetos de corte
  'Lorde Mortimer',
  'Lorde Edmund',
  'Lady Beatrice',
  'Lady Rosalind',
  'Mestre Alistair',
  'Mestra Arabella',
];

/**
 * Sorteia um nome de bot que não esteja sendo usado por nenhum dos jogadores
 * listados em `taken`. Se o pool acabar, adiciona um sufixo romano para
 * diferenciar (pouco provável em partidas com até 6 nobres).
 */
export function pickBotName(taken: string[]): string {
  const usedLower = new Set(taken.map((n) => n.trim().toLowerCase()));
  const available = NOBLE_POOL.filter((n) => !usedLower.has(n.toLowerCase()));

  if (available.length > 0) {
    const idx = Math.floor(Math.random() * available.length);
    return available[idx];
  }

  // Pool exausto — cai num sufixo (raro em partidas reais)
  const base = NOBLE_POOL[Math.floor(Math.random() * NOBLE_POOL.length)];
  let suffix = 2;
  while (usedLower.has(`${base} ${toRoman(suffix)}`.toLowerCase())) suffix += 1;
  return `${base} ${toRoman(suffix)}`;
}

function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  let x = n;
  for (const [value, sym] of map) {
    while (x >= value) {
      out += sym;
      x -= value;
    }
  }
  return out;
}
