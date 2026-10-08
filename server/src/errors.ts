/** Erro de regra de negócio, com código estável que o cliente pode tratar. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function errorPayload(err: unknown) {
  if (err instanceof AppError) return { ok: false, code: err.code, message: err.message };
  console.error('[server] erro inesperado:', err);
  return { ok: false, code: 'INTERNAL', message: 'Erro interno do servidor.' };
}

/** Lê um campo string de um objeto vindo do cliente, sem confiar no tipo. */
export function str(data: unknown, key: string): string {
  if (!data || typeof data !== 'object') return '';
  const v = (data as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

// Controle, larguras zero e marcas de direção (permitiriam nomes enganosos).
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]', 'g');

/** Tira caracteres de controle e espaços repetidos de um texto livre. */
export function cleanText(s: string, max: number): string {
  return s
    .normalize('NFKC')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
