/**
 * Sound manager — sistema de áudio SFX para o Coup.
 *
 * Construído sobre `expo-audio` (substituto oficial de `expo-av` no SDK 54+).
 *
 * Princípios:
 *  - Preload de todos os sons na inicialização (sem criar instâncias por play).
 *  - Pool de 2 "voices" por som → retriggers rápidos não se cortam.
 *  - Variação orgânica (volume ±5%, pitch ±4%, delay 0–40ms).
 *  - Cooldown por som → evita poluição sonora em bursts.
 *  - Volume global + mute global (persistem via storage externo).
 *  - Loops temporais (TIMER_TICK / TIMER_URGENT) com `startLoop` / `stopLoop`.
 *
 * API pública:
 *   initAudio()                  – chama uma vez no boot do app.
 *   playSfx('COIN_GAIN')         – dispara um one-shot.
 *   stopSfx('TIMER_TICK')        – para um som (ou loop).
 *   stopAllSfx()                 – silencia tudo imediatamente.
 *   startLoop('TIMER_TICK')      – inicia um som em loop.
 *   stopLoop('TIMER_TICK')       – encerra o loop.
 *   setMuted(true)               – muta/desmuta globalmente.
 *   setMasterVolume(0.8)         – volume geral (0–1).
 *
 * Retro-compat: mantém `play(legacyKey)` aceitando as chaves antigas usadas
 * no app hoje (`reveal_success`, `coin_gain`, etc.), redirecionando para as
 * novas chaves semânticas.
 */

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

// ────────────────────────────────────────────────────────────────────────
// Tipos e catálogo

export type SfxKey =
  | 'COIN_GAIN'
  | 'COIN_LOSS'
  | 'CARD_FLIP'
  | 'CARD_REVEAL'
  | 'CHALLENGE'
  | 'BLOCK'
  | 'BLUFF_FAIL'
  | 'SUCCESS'
  | 'LOG'
  | 'LOSE_CARD'
  | 'TIMER_TICK'
  | 'TIMER_URGENT'
  | 'VICTORY'
  | 'DEFEAT';

interface SfxConfig {
  /** Asset resolvido por `require(...)`. */
  asset: number;
  /** Volume base (0–1). Multiplicado pelo volume global. */
  baseVolume: number;
  /** Intervalo mínimo (ms) entre disparos consecutivos. */
  cooldownMs: number;
  /** Quando true, varia playback rate (e portanto pitch) ±4%. */
  pitchVariation: boolean;
  /** Quando true, vive em loop (tick de relógio). */
  loopable?: boolean;
  /** Número de "voices" no pool. Para retriggers rápidos use 2+. */
  voices?: number;
}

// Mapa semântico → arquivo + perfil de mix.
// Faixas típicas de mix:
//   UI leve (LOG)           → 0.30–0.40
//   Físico (moedas/flip)    → 0.55–0.65
//   Importante (reveal/etc) → 0.70–0.80
const SFX_CATALOG: Record<SfxKey, SfxConfig> = {
  // — Momentos importantes (clímax): altos, sem variação de pitch
  CHALLENGE: {
    asset: require('../assets/sounds/desafio.mp3'),
    baseVolume: 0.78,
    cooldownMs: 140,
    pitchVariation: false,
  },
  CARD_REVEAL: {
    asset: require('../assets/sounds/carta-revelada.mp3'),
    baseVolume: 0.75,
    cooldownMs: 120,
    pitchVariation: false,
  },
  LOSE_CARD: {
    asset: require('../assets/sounds/perda-carta.mp3'),
    baseVolume: 0.80,
    cooldownMs: 140,
    pitchVariation: false,
  },
  BLOCK: {
    asset: require('../assets/sounds/bloqueio.mp3'),
    baseVolume: 0.70,
    cooldownMs: 120,
    pitchVariation: false,
  },
  BLUFF_FAIL: {
    asset: require('../assets/sounds/blefe.mp3'),
    baseVolume: 0.78,
    cooldownMs: 140,
    pitchVariation: false,
  },

  // — Confirmações / feedback de ação
  SUCCESS: {
    asset: require('../assets/sounds/confirmado.mp3'),
    baseVolume: 0.60,
    cooldownMs: 80,
    pitchVariation: true,
  },

  // — Feedback físico: médios, com variação pra não ficar mecânico
  COIN_GAIN: {
    asset: require('../assets/sounds/ganhar-moeda.mp3'),
    baseVolume: 0.62,
    cooldownMs: 60,
    pitchVariation: true,
    voices: 2,
  },
  COIN_LOSS: {
    asset: require('../assets/sounds/perda-moeda.mp3'),
    baseVolume: 0.58,
    cooldownMs: 60,
    pitchVariation: true,
    voices: 2,
  },
  CARD_FLIP: {
    asset: require('../assets/sounds/carta-virar.mp3'),
    baseVolume: 0.55,
    cooldownMs: 80,
    pitchVariation: true,
    voices: 2,
  },

  // — UI discreta
  LOG: {
    asset: require('../assets/sounds/novo-log.mp3'),
    baseVolume: 0.32,
    cooldownMs: 90,
    pitchVariation: true,
    voices: 2,
  },

  // — Stingers de fim de partida (momentos emocionais grandes)
  VICTORY: {
    asset: require('../assets/sounds/vitoria.mp3'),
    baseVolume: 0.90,
    cooldownMs: 800,
    pitchVariation: false,
  },
  DEFEAT: {
    asset: require('../assets/sounds/falha.mp3'),
    baseVolume: 0.85,
    cooldownMs: 800,
    pitchVariation: false,
  },

  // — Loops temporais (não variar pitch, não sobrepor)
  TIMER_TICK: {
    asset: require('../assets/sounds/relogio-tempo.mp3'),
    baseVolume: 0.40,
    cooldownMs: 0,
    pitchVariation: false,
    loopable: true,
  },
  TIMER_URGENT: {
    asset: require('../assets/sounds/relogio-rapido.mp3'),
    baseVolume: 0.55,
    cooldownMs: 0,
    pitchVariation: false,
    loopable: true,
  },
};

// ────────────────────────────────────────────────────────────────────────
// Estado interno

interface Voice {
  player: AudioPlayer;
  inUseUntil: number;
}

interface SfxSlot {
  config: SfxConfig;
  voices: Voice[];
  nextVoice: number;
  lastPlayedAt: number;
}

let INITIALIZED = false;
let MUTED = false;
let MASTER_VOLUME = 1;
/** Volume dos efeitos (0–1), independente da música. */
let SFX_VOLUME = 1;

// ─── BGM (música de fundo) ──────────────────────────────────────────────
export type MusicTrack = 'menu' | 'game';

const MUSIC_ASSETS: Record<MusicTrack, number> = {
  menu: require('../assets/sounds/musica-menu.mp3'),
  game: require('../assets/sounds/musica-ingame.mp3'),
};

// Volume-alvo por faixa (base, antes de aplicar mute/volume do usuário).
const MUSIC_BASE_VOLUME: Record<MusicTrack, number> = {
  menu: 0.55,
  game: 0.42, // mais baixo em jogo para não competir com SFX
};

let MUSIC_VOLUME = 1; // multiplicador do usuário (0–1)
// "Ducking" temporário para quando um som importante precisa respirar
// (stinger de vitória/derrota, por exemplo). 1 = sem ducking.
let MUSIC_DUCK = 1;
const musicPlayers: Partial<Record<MusicTrack, AudioPlayer>> = {};
let activeTrack: MusicTrack | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
const slots: Partial<Record<SfxKey, SfxSlot>> = {};

// Chaves legadas usadas pelo código existente → novas chaves semânticas.
const LEGACY_MAP: Record<string, SfxKey> = {
  coin_gain: 'COIN_GAIN',
  coin_loss: 'COIN_LOSS',
  card_flip: 'CARD_FLIP',
  reveal_success: 'CARD_REVEAL',
  reveal_bluff: 'BLUFF_FAIL',
  challenge: 'CHALLENGE',
  block: 'BLOCK',
  turn_start: 'SUCCESS',
  victory: 'VICTORY',
  defeat: 'DEFEAT',
  click: 'LOG',
};

// ────────────────────────────────────────────────────────────────────────
// Helpers

const now = () => Date.now();

const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);

function createSlot(key: SfxKey, config: SfxConfig): SfxSlot {
  const voiceCount = Math.max(1, config.voices ?? 1);
  const voices: Voice[] = [];
  for (let i = 0; i < voiceCount; i++) {
    try {
      const player = createAudioPlayer(config.asset);
      // Sons são "preload-ready" assim que o player é criado;
      // expo-audio já mantém o decoder quente após a primeira reprodução.
      if (config.loopable) player.loop = true;
      voices.push({ player, inUseUntil: 0 });
    } catch (err) {
      if (__DEV__) {
        console.warn(`[sound] Falha ao carregar ${key}:`, err);
      }
    }
  }
  return { config, voices, nextVoice: 0, lastPlayedAt: 0 };
}

function ensureSlot(key: SfxKey): SfxSlot | null {
  const existing = slots[key];
  if (existing) return existing;
  const cfg = SFX_CATALOG[key];
  if (!cfg) return null;
  const slot = createSlot(key, cfg);
  slots[key] = slot;
  return slot;
}

function applyVariation(
  voice: Voice,
  cfg: SfxConfig,
  volumeScale: number,
): void {
  const jitterVol = rand(0.9, 1.0);
  voice.player.volume = Math.max(
    0,
    Math.min(
      1,
      cfg.baseVolume * jitterVol * volumeScale * MASTER_VOLUME * SFX_VOLUME,
    ),
  );
  if (cfg.pitchVariation) {
    const rate = rand(0.96, 1.04);
    // Segundo argumento omitido ⇒ a mudança de rate altera pitch também
    // (efeito "fresco" desejado). Se quisesse preservar pitch, usar 'high'.
    try {
      voice.player.setPlaybackRate?.(rate);
    } catch {
      // Alguns devices Android podem não suportar — ignora silenciosamente.
    }
  } else {
    try {
      voice.player.setPlaybackRate?.(1);
    } catch {
      // idem
    }
  }
}

// ────────────────────────────────────────────────────────────────────────
// API pública

/**
 * Inicializa o sistema. Seguro chamar múltiplas vezes.
 * Deve rodar uma vez no boot do app (ex.: `_layout.tsx`).
 */
export async function initAudio(): Promise<void> {
  if (INITIALIZED) return;
  INITIALIZED = true;

  // Modo de áudio: toca mesmo com o celular no silencioso (iOS) e
  // convive com música de fundo em outros apps sem tomar o foco.
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
  } catch (err) {
    if (__DEV__) console.warn('[sound] setAudioModeAsync falhou:', err);
  }

  // Preload de todos os sons em paralelo.
  (Object.keys(SFX_CATALOG) as SfxKey[]).forEach((key) => ensureSlot(key));

  // Preload da BGM (silencioso, sem tocar).
  (Object.keys(MUSIC_ASSETS) as MusicTrack[]).forEach((track) => {
    try {
      const p = createAudioPlayer(MUSIC_ASSETS[track]);
      p.loop = true;
      p.volume = 0;
      musicPlayers[track] = p;
    } catch (err) {
      if (__DEV__) console.warn(`[sound] BGM ${track} preload falhou:`, err);
    }
  });
}

/** Muta/desmuta globalmente (persistir via AsyncStorage fora daqui). */
export function setMutedFlag(muted: boolean): void {
  MUTED = muted;
  if (muted) {
    stopAllSfx();
    // Pausa música suavemente (mantendo a faixa ativa no estado interno
    // para que desmutar volte a tocar de onde parou).
    fadeMusicTo(0, 220, () => {
      if (activeTrack) musicPlayers[activeTrack]?.pause();
    });
  } else if (activeTrack) {
    // Retoma a última faixa ao desmutar.
    const p = musicPlayers[activeTrack];
    if (p) {
      try {
        p.play();
      } catch {
        /* noop */
      }
      fadeMusicTo(musicTargetVolume(activeTrack), 480);
    }
  }
}

/** Mantido para retro-compat com callsites antigos. */
export const setMuted = setMutedFlag;

export function isMuted(): boolean {
  return MUTED;
}

/** Volume global (0–1). */
export function setMasterVolume(v: number): void {
  MASTER_VOLUME = Math.max(0, Math.min(1, v));
}

export function getMasterVolume(): number {
  return MASTER_VOLUME;
}

export function setSfxVolume(v: number): void {
  SFX_VOLUME = Math.max(0, Math.min(1, v));
}

export function getSfxVolume(): number {
  return SFX_VOLUME;
}

interface PlayOptions {
  /** Força o volume (multiplicado em cima do base + master). 1 = normal. */
  volume?: number;
  /** Atrasa o disparo (ms). Default: 0–40ms aleatório. */
  delayMs?: number;
  /** Ignora cooldown. Use com parcimônia (eventos críticos). */
  force?: boolean;
}

/**
 * Dispara um SFX. Silenciosamente ignorado se:
 *  - sistema não inicializado (auto-inicializa em 1º uso)
 *  - muted
 *  - cooldown ativo para a chave
 *  - todas as voices estão em uso e não há uma livre
 */
export function playSfx(key: SfxKey, opts: PlayOptions = {}): void {
  if (MUTED || SFX_VOLUME < 0.001) return;
  if (!INITIALIZED) void initAudio();

  const slot = ensureSlot(key);
  if (!slot || slot.voices.length === 0) return;

  const t = now();
  const cfg = slot.config;

  // Cooldown — evita dois disparos do mesmo som colados demais.
  if (!opts.force && t - slot.lastPlayedAt < cfg.cooldownMs) return;

  // Escolhe a próxima voice livre (preferência round-robin).
  let chosen: Voice | null = null;
  const n = slot.voices.length;
  for (let i = 0; i < n; i++) {
    const idx = (slot.nextVoice + i) % n;
    const v = slot.voices[idx];
    if (v.inUseUntil <= t) {
      chosen = v;
      slot.nextVoice = (idx + 1) % n;
      break;
    }
  }
  // Todas ocupadas → cancela a mais antiga (drop policy previsível).
  if (!chosen) {
    chosen = slot.voices[slot.nextVoice];
    slot.nextVoice = (slot.nextVoice + 1) % n;
  }

  const delay = opts.delayMs ?? Math.floor(rand(0, 40));
  const volumeScale = opts.volume ?? 1;
  const voice = chosen;

  const fire = () => {
    try {
      applyVariation(voice, cfg, volumeScale);
      voice.player.seekTo(0);
      voice.player.play();
      // Aproximação conservadora: reserva ~800ms (a maioria dos SFX
      // curtos termina nesse intervalo). Se pular o tempo, o round-robin
      // cuida de reusar mesmo assim.
      voice.inUseUntil = now() + 800;
    } catch (err) {
      if (__DEV__) console.warn(`[sound] play(${key}) erro:`, err);
    }
  };

  slot.lastPlayedAt = t + delay;
  if (delay > 0) setTimeout(fire, delay);
  else fire();
}

/** Para imediatamente todas as voices de um som. */
export function stopSfx(key: SfxKey): void {
  const slot = slots[key];
  if (!slot) return;
  for (const v of slot.voices) {
    try {
      v.player.pause();
      v.player.seekTo(0);
      v.inUseUntil = 0;
    } catch {
      /* noop */
    }
  }
}

/** Para todos os SFX (ex.: ao mutar ou sair da tela de jogo). */
export function stopAllSfx(): void {
  (Object.keys(slots) as SfxKey[]).forEach(stopSfx);
}

/** Inicia um som em loop (só funciona com chaves `loopable`). */
export function startLoop(key: SfxKey): void {
  if (MUTED || SFX_VOLUME < 0.001) return;
  if (!INITIALIZED) void initAudio();

  const slot = ensureSlot(key);
  if (!slot || slot.voices.length === 0) return;
  if (!slot.config.loopable) {
    if (__DEV__) console.warn(`[sound] startLoop("${key}") — não é loopable`);
    return;
  }

  const voice = slot.voices[0];
  try {
    applyVariation(voice, slot.config, 1);
    voice.player.loop = true;
    voice.player.seekTo(0);
    voice.player.play();
    voice.inUseUntil = Number.POSITIVE_INFINITY;
  } catch (err) {
    if (__DEV__) console.warn(`[sound] startLoop(${key}) erro:`, err);
  }
}

/** Encerra o loop iniciado por `startLoop`. */
export function stopLoop(key: SfxKey): void {
  stopSfx(key);
}

// ────────────────────────────────────────────────────────────────────────
// Música de fundo (BGM) — menu ↔ jogo com crossfade

function musicTargetVolume(track: MusicTrack): number {
  return Math.max(
    0,
    Math.min(
      1,
      MUSIC_BASE_VOLUME[track] * MUSIC_VOLUME * MASTER_VOLUME * MUSIC_DUCK,
    ),
  );
}

/**
 * "Ducking" da música: abaixa temporariamente o volume para que um
 * stinger (vitória/derrota/reveal crítico) tenha destaque emocional.
 * `factor` = 0..1 (ex: 0.25 = 25% do volume normal).
 * `releaseMs` = tempo até restaurar automaticamente (0 = não restaura).
 */
export function duckMusic(factor: number, releaseMs: number = 3000): void {
  MUSIC_DUCK = Math.max(0, Math.min(1, factor));
  if (activeTrack) {
    fadeMusicTo(musicTargetVolume(activeTrack), 260);
  }
  if (releaseMs > 0) {
    setTimeout(() => {
      MUSIC_DUCK = 1;
      if (activeTrack) fadeMusicTo(musicTargetVolume(activeTrack), 600);
    }, releaseMs);
  }
}

/**
 * Ramp linear do volume de UMA música ativa até `target` em `durationMs`.
 * Cancela qualquer fade anterior.
 */
function fadeMusicTo(
  target: number,
  durationMs: number,
  onDone?: () => void,
): void {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
  if (!activeTrack) {
    onDone?.();
    return;
  }
  const player = musicPlayers[activeTrack];
  if (!player) {
    onDone?.();
    return;
  }
  const from = player.volume ?? 0;
  if (durationMs <= 0 || Math.abs(from - target) < 0.01) {
    player.volume = target;
    onDone?.();
    return;
  }
  const stepMs = 40;
  const steps = Math.max(1, Math.round(durationMs / stepMs));
  let i = 0;
  fadeTimer = setInterval(() => {
    i++;
    const t = i / steps;
    const v = from + (target - from) * t;
    try {
      if (activeTrack) {
        const p = musicPlayers[activeTrack];
        if (p) p.volume = Math.max(0, Math.min(1, v));
      }
    } catch {
      /* noop */
    }
    if (i >= steps) {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      onDone?.();
    }
  }, stepMs);
}

/**
 * Toca uma faixa de fundo. Se já houver outra tocando, faz crossfade.
 * É idempotente — chamar com a mesma faixa repetidamente é no-op.
 */
export function playMusic(track: MusicTrack): void {
  if (!INITIALIZED) void initAudio();
  if (activeTrack === track) {
    // Garante que está tocando (ex.: retomou de mute).
    if (!MUTED) {
      const p = musicPlayers[track];
      if (p) {
        try {
          p.play();
        } catch {
          /* noop */
        }
      }
    }
    return;
  }

  const prev = activeTrack;
  activeTrack = track;

  const next = musicPlayers[track];
  if (!next) return;

  // Inicia a nova em volume 0 e sobe.
  try {
    next.volume = 0;
    next.seekTo(0);
    if (!MUTED) next.play();
  } catch (err) {
    if (__DEV__) console.warn(`[sound] playMusic(${track}) erro:`, err);
  }

  // Fade-out na anterior em paralelo.
  if (prev && musicPlayers[prev]) {
    const old = musicPlayers[prev]!;
    const from = old.volume ?? 0;
    const steps = 14;
    const stepMs = 36;
    let i = 0;
    const t = setInterval(() => {
      i++;
      const k = 1 - i / steps;
      try {
        old.volume = Math.max(0, from * k);
      } catch {
        /* noop */
      }
      if (i >= steps) {
        clearInterval(t);
        try {
          old.pause();
          old.seekTo(0);
        } catch {
          /* noop */
        }
      }
    }, stepMs);
  }

  // Fade-in da nova até o volume alvo.
  if (!MUTED) {
    fadeMusicTo(musicTargetVolume(track), 520);
  }
}

/** Para a música atual com fade-out. */
export function stopMusic(durationMs: number = 400): void {
  if (!activeTrack) return;
  const track = activeTrack;
  fadeMusicTo(0, durationMs, () => {
    try {
      musicPlayers[track]?.pause();
      musicPlayers[track]?.seekTo(0);
    } catch {
      /* noop */
    }
  });
  activeTrack = null;
}

/** Ajusta o volume da música (0–1). Aplica em tempo real. */
export function setMusicVolume(v: number): void {
  MUSIC_VOLUME = Math.max(0, Math.min(1, v));
  if (activeTrack && !MUTED) {
    const p = musicPlayers[activeTrack];
    if (p) p.volume = musicTargetVolume(activeTrack);
  }
}

export function getMusicVolume(): number {
  return MUSIC_VOLUME;
}

// ────────────────────────────────────────────────────────────────────────
// Retro-compat — mantém `play(legacyKey)` funcionando.

/**
 * @deprecated Use `playSfx('COIN_GAIN')` etc.
 * Mantido para não quebrar callsites antigos enquanto migramos.
 */
export function play(legacyKey: string): void {
  const upper = legacyKey.toUpperCase() as SfxKey;
  if (upper in SFX_CATALOG) {
    playSfx(upper);
    return;
  }
  const mapped = LEGACY_MAP[legacyKey];
  if (mapped) playSfx(mapped);
}

