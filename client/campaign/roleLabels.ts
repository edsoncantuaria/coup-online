import type { Role } from '../engine/types';

const LABELS: Partial<Record<Role, string>> = {
  duke: 'Duque',
  assassin: 'Assassino',
  captain: 'Capitão',
  ambassador: 'Embaixador',
  contessa: 'Condessa',
};

export function campaignRoleLabel(role: Role | string): string {
  return LABELS[role as Role] ?? String(role);
}
