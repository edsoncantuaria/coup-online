export const translateRole = (role: string): string => {
  const dict: Record<string, string> = {
    duke: 'Duque',
    assassin: 'Assassino',
    captain: 'Capitão',
    ambassador: 'Embaixador',
    contessa: 'Condessa'
  };
  return dict[role] || role;
};

export const translateAction = (type: string): string => {
  const dict: Record<string, string> = {
    income: 'Renda',
    foreign_aid: 'Ajuda Externa',
    tax: 'Taxa (Duque)',
    steal: 'Extorsão (Capitão)',
    assassinate: 'Assassinato',
    exchange: 'Troca (Embaixador)',
    coup: 'Golpe de Estado',
    challenge: 'Desafio',
    block: 'Bloqueio'
  };
  return dict[type] || type;
};

export const translatePhase = (p: string): string => {
  switch (p) {
    case 'action': return 'Sua Vez';
    case 'challenge': return 'Desafio Pendente';
    case 'block': return 'Bloqueio Disponível';
    case 'lobby': return 'No Saguão';
    case 'game_over': return 'Fim de Jogo';
    case 'losing_influence': return 'Sacrifício';
    default: return p;
  }
};
