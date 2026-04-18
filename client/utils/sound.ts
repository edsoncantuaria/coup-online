/**
 * Sound manager — estrutura pronta para áudio.
 *
 * Hoje este módulo opera como **stub seguro**: todas as funções são no-op.
 * Intencionalmente não importa `expo-av` (depreciado no SDK 54) nem
 * `expo-audio` enquanto não houver arquivos reais em `client/assets/sounds/`.
 *
 * Para ativar:
 *  1. Adicione os arquivos em `client/assets/sounds/*.mp3`.
 *  2. Instale `expo-audio`: `npx expo install expo-audio`.
 *  3. Substitua as implementações de `play`, `startBackgroundMusic` e
 *     `stopBackgroundMusic` pelas chamadas equivalentes de `expo-audio`.
 *  4. Troque `ENABLED_SFX` para `true`.
 *
 * O restante do app já chama `play(...)` em pontos-chave; quando o motor
 * real for ligado, todos os efeitos começam a tocar automaticamente.
 */

export type SfxKey =
  | 'click'
  | 'coin_gain'
  | 'coin_loss'
  | 'challenge'
  | 'block'
  | 'reveal_success'
  | 'reveal_bluff'
  | 'card_flip'
  | 'turn_start'
  | 'victory'
  | 'defeat';

const ENABLED_SFX = false;
let MUTED = false;

export const setMuted = (muted: boolean) => {
  MUTED = muted;
};

export const isMuted = () => MUTED;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function play(_key: SfxKey) {
  if (!ENABLED_SFX || MUTED) return;
  // Quando habilitar expo-audio, instanciar/reutilizar o AudioPlayer aqui
  // e executar `.play()` usando _key para mapear o asset.
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function startBackgroundMusic(_asset: number) {
  if (!ENABLED_SFX || MUTED) return;
  // Loop de música ambiente (integrar com expo-audio quando disponível)
}

export async function stopBackgroundMusic() {
  // no-op
}
