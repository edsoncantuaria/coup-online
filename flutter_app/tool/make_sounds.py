"""Sintetiza os efeitos sonoros do Intriga em assets/sounds/*.wav.

Tudo é gerado aqui (ruído filtrado, parciais de sino e madeira), sem
amostras de terceiros. Rode da pasta flutter_app:

    python3 tool/make_sounds.py

Mono, 44.1 kHz, 16 bits. Os sons são curtos (a maioria abaixo de 1 s).
"""

import math
import os
import sys
import wave

import numpy as np

SR = 44100
RNG = np.random.default_rng(7)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "sounds")


# ------------------------------------------------------------------ básicos

def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def silence(dur):
    return np.zeros(int(dur * SR))


def noise(dur):
    return RNG.uniform(-1, 1, int(dur * SR))


def env_exp(n, tau):
    """Decaimento exponencial com constante [tau] segundos."""
    return np.exp(-np.arange(n) / SR / tau)


def env_ar(n, attack, release):
    """Subida linear em [attack] s e queda exponencial."""
    a = int(attack * SR)
    e = np.ones(n)
    if a > 0:
        e[:a] = np.linspace(0, 1, a)
    e[a:] = np.exp(-np.arange(n - a) / SR / release)
    return e


def lowpass(x, cutoff, order=1):
    """Passa-baixa de [order] polos em cascata (cutoff pode variar no tempo)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.asarray(x, dtype=float)
    for _ in range(order):
        out = np.empty_like(y)
        acc = 0.0
        for i in range(len(y)):
            acc += a[i] * (y[i] - acc)
            out[i] = acc
        y = out
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def bandpass(x, f0, q):
    """Biquad passa-faixa (RBJ), f0 pode variar no tempo."""
    f = np.broadcast_to(np.asarray(f0, dtype=float), x.shape)
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        w = 2 * np.pi * min(f[i], SR * 0.45) / SR
        alpha = math.sin(w) / (2 * q)
        cw = math.cos(w)
        a0 = 1 + alpha
        b0 = alpha / a0
        b2 = -alpha / a0
        a1 = -2 * cw / a0
        a2 = (1 - alpha) / a0
        out = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1 = x1, x[i]
        y2, y1 = y1, out
        y[i] = out
    return y


def partials(dur, freqs, amps, taus):
    """Soma de senoides com decaimentos próprios (sinos, metal, madeira)."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for f, a, tau in zip(freqs, amps, taus):
        out += a * np.sin(2 * np.pi * f * t + RNG.uniform(0, 2 * np.pi)) * np.exp(-t / tau)
    return out


def at(base, sound, start):
    """Mistura [sound] em [base] a partir de [start] segundos."""
    i = int(start * SR)
    end = min(len(base), i + len(sound))
    base[i:end] += sound[: end - i]
    return base


def fit(x, peak=0.85, loud=0.14):
    """Nivela pelo volume percebido (RMS da parte audível) e limita o pico
    com uma saturação suave, para nenhum som sumir nem estourar."""
    m = np.max(np.abs(x))
    if m == 0:
        return x
    x = x / m
    active = np.abs(x) > 0.02
    for k in np.linspace(1, 8, 57):
        y = np.tanh(k * x) / np.tanh(k)
        if np.sqrt(np.mean(y[active] ** 2)) * peak >= loud:
            break
    x = y * peak
    # Rampa curta no fim para não estalar.
    r = min(len(x), int(0.01 * SR))
    x[-r:] *= np.linspace(1, 0, r)
    return x


def write(name, x, peak=0.85, loud=0.14):
    x = fit(np.asarray(x, dtype=float), peak, loud)
    data = (x * 32767).astype("<i2").tobytes()
    path = os.path.join(OUT, f"{name}.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(f"{name}.wav  {len(x) / SR:.2f}s")


# --------------------------------------------------------------- materiais

def coin(pitch=1.0, dur=0.45):
    """Moeda batendo: parciais inarmônicos agudos com estalo de ataque."""
    f = np.array([2350, 3640, 5110, 6720, 8030]) * pitch
    body = partials(dur, f, [1, 0.7, 0.5, 0.35, 0.2], [0.18, 0.12, 0.08, 0.05, 0.04])
    click = highpass(noise(0.006), 3000) * 0.6
    return at(body, click, 0)


def clank(pitch=1.0, dur=0.5, weight=1.0):
    """Metal pesado (corrente, âncora)."""
    f = np.array([310, 742, 1190, 1730, 2410, 3170]) * pitch
    body = partials(dur, f, [0.5, 1, 0.8, 0.6, 0.4, 0.3], [0.25, 0.2, 0.14, 0.1, 0.07, 0.05])
    hit = lowpass(noise(0.03), 2500) * env_exp(int(0.03 * SR), 0.008) * weight
    return at(body, hit, 0)


def bell(f0, dur=1.6, bright=1.0):
    """Sino macio (parciais de sino de mão)."""
    ratios = [1, 2.0, 2.76, 4.07, 5.43]
    amps = [1, 0.35, 0.5 * bright, 0.25 * bright, 0.15 * bright]
    taus = [0.9, 0.6, 0.45, 0.3, 0.2]
    return partials(dur, [f0 * r for r in ratios], amps, taus)


def wood(f0=900, dur=0.18):
    """Batida em madeira (bloco), seca."""
    body = partials(dur, [f0, f0 * 2.4, f0 * 4.1], [1, 0.4, 0.15], [0.03, 0.018, 0.01])
    tick = bandpass(noise(0.01), 2500, 2) * 0.5
    return at(body, tick, 0)


def thump(f0=90, dur=0.35, tau=0.08):
    """Baque grave (carimbo, âncora no chão)."""
    t = t_axis(dur)
    sweep = f0 * (1 + 0.8 * np.exp(-t / 0.02))
    phase = 2 * np.pi * np.cumsum(sweep) / SR
    return np.sin(phase) * np.exp(-t / tau)


def whoosh(dur, f_start, f_end, q=1.2):
    n = int(dur * SR)
    f = np.geomspace(f_start, f_end, n)
    shape = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    return bandpass(noise(dur), f, q) * shape


def strike_scratch(dur=0.09):
    """O palito raspando na lixa."""
    n = int(dur * SR)
    grit = bandpass(noise(dur), 3200, 0.8)
    # Grãos: o ruído pulsa enquanto o palito arrasta.
    grain = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 70 * np.arange(n) / SR + RNG.uniform(0, 6)))
    return grit * grain * env_ar(n, 0.005, 0.05)


def ignite(dur=0.45):
    """A cabeça pegando fogo: um sopro que encorpa e assenta."""
    n = int(dur * SR)
    body = lowpass(noise(dur), np.linspace(3500, 800, n), order=3) * 3
    return body * env_ar(n, 0.02, 0.16)


def crackle(dur, density=40):
    out = silence(dur)
    for _ in range(int(dur * density)):
        pop = highpass(noise(0.004), 2000) * RNG.uniform(0.2, 1)
        at(out, pop, RNG.uniform(0, dur - 0.005))
    return out


# ---------------------------------------------------------------- os sons

def match_strike():
    x = silence(0.65)
    at(x, strike_scratch(), 0)
    at(x, ignite() * 0.9, 0.06)
    return x


def burn_out():
    """Fósforo queimando até o fim e apagando com um chiado."""
    dur = 2.2
    n = int(dur * SR)
    x = silence(dur)
    at(x, strike_scratch() * 0.8, 0)
    at(x, ignite() * 0.9, 0.06)
    flame = lowpass(noise(dur), 600, order=3) * 1.4 * np.clip(1.15 - np.arange(n) / n, 0, 1)
    at(x, flame, 0.25)
    at(x, lowpass(crackle(1.6, 30), 4000, order=2) * 0.5, 0.3)
    # Apaga: um "fff" curto subindo e sumindo.
    fizz = whoosh(0.45, 1200, 3500, 0.8) * 0.7
    at(x, fizz, 1.65)
    return x


def turn():
    """Sua vez: duas batidas de madeira."""
    x = silence(0.4)
    at(x, wood(880), 0)
    at(x, wood(1180) * 0.8, 0.11)
    return x


def tick():
    return wood(1500, 0.08) * 0.8


def income():
    x = silence(0.5)
    at(x, coin(1.0), 0)
    return x


def foreign_aid():
    x = silence(0.75)
    at(x, coin(0.94), 0)
    at(x, coin(1.06) * 0.9, 0.16)
    return x


def tax():
    """Duque: cascata de moedas e um sino grave de tesouro."""
    x = silence(1.6)
    at(x, bell(196, 1.5, 0.6) * 0.45, 0)
    for i, p in enumerate([1.0, 1.12, 0.92, 1.05, 0.98, 1.18]):
        at(x, coin(p) * (0.9 - i * 0.06), 0.35 + i * 0.09 + RNG.uniform(0, 0.03))
    return x


def steal():
    """Capitão: corrente arrastando e a âncora puxando as moedas."""
    x = silence(1.6)
    at(x, whoosh(0.35, 300, 1200) * 0.5, 0)
    for i in range(7):
        at(x, clank(RNG.uniform(1.4, 2.0), 0.25) * 0.35, 0.12 + i * 0.05)
    at(x, clank(0.9, 0.7, 1.4), 0.5)
    at(x, coin(1.05) * 0.6, 0.95)
    at(x, coin(0.95) * 0.55, 1.08)
    return x


def assassinate():
    """Assassino: a adaga corta o ar, crava e deixa dois talhos."""
    x = silence(1.1)
    at(x, whoosh(0.28, 600, 6000, 1.5), 0)
    stab = highpass(noise(0.02), 2500) * env_exp(int(0.02 * SR), 0.004)
    at(x, stab * 1.2, 0.28)
    at(x, thump(70, 0.4, 0.07) * 0.9, 0.28)
    at(x, whoosh(0.16, 3000, 9000, 2.5) * 0.6, 0.45)
    at(x, whoosh(0.16, 2500, 8000, 2.5) * 0.55, 0.6)
    return x


def exchange():
    """Embaixador: baralho embaralhado."""
    x = silence(1.2)
    t = 0.0
    gap = 0.012
    while t < 0.7:
        flick = bandpass(noise(0.012), RNG.uniform(1800, 3200), 1.5) * env_exp(int(0.012 * SR), 0.003)
        at(x, flick * RNG.uniform(0.5, 1), t)
        t += gap
        gap *= 1.035
    # As cartas assentam na mesa.
    at(x, lowpass(noise(0.06), 1500) * env_exp(int(0.06 * SR), 0.015) * 1.4, 0.8)
    return x


def coup():
    """Golpe: o estrondo e o eco da mesa tremendo."""
    dur = 2.0
    x = silence(dur)
    at(x, whoosh(0.4, 200, 900, 0.9) * 0.6, 0)
    boom = thump(55, 1.4, 0.35)
    rumble = lowpass(noise(1.6), 180, order=4) * env_ar(int(1.6 * SR), 0.01, 0.4) * 6
    blast = lowpass(noise(0.3), 1500, order=3) * env_exp(int(0.3 * SR), 0.05) * 2
    at(x, boom, 0.45)
    at(x, rumble * 1.4, 0.45)
    at(x, blast * 0.8, 0.45)
    at(x, lowpass(crackle(0.8, 45), 3000, order=2) * 0.5, 0.55)
    return x


def block_contessa():
    """Condessa: o escudo de lua, um sino claro com brilho."""
    x = silence(1.8)
    at(x, bell(880, 1.7, 1.0), 0)
    at(x, bell(1318.5, 1.4, 0.8) * 0.5, 0.08)
    shimmer = highpass(noise(0.9), 6000) * env_ar(int(0.9 * SR), 0.15, 0.25) * 0.12
    at(x, shimmer, 0)
    return x


def block_duke():
    """Duque barrando: gongo grave."""
    x = silence(1.8)
    at(x, bell(146.8, 1.8, 1.2), 0)
    at(x, thump(80, 0.3, 0.06) * 0.6, 0)
    return x


def block_captain():
    """Capitão barrando: a âncora crava no chão."""
    x = silence(1.4)
    at(x, whoosh(0.3, 250, 700) * 0.4, 0)
    at(x, thump(60, 0.6, 0.12), 0.3)
    at(x, clank(0.75, 0.9, 1.5) * 0.8, 0.3)
    return x


def block_ambassador():
    """Embaixador barrando: o lacre de cera carimba o veto."""
    x = silence(1.0)
    at(x, whoosh(0.2, 400, 1500) * 0.3, 0)
    at(x, thump(110, 0.4, 0.05) * 1.1, 0.2)
    paper = bandpass(noise(0.08), 1800, 0.9) * env_exp(int(0.08 * SR), 0.02) * 0.6
    at(x, paper, 0.2)
    return x


def proven():
    """Provado: duas notas subindo, firmes."""
    x = silence(1.2)
    at(x, bell(523.3, 1.0, 0.5), 0)
    at(x, bell(784.0, 1.1, 0.5), 0.16)
    return x


def bluff():
    """Blefe: o golpe seco e uma descida dissonante."""
    x = silence(1.3)
    at(x, thump(70, 0.5, 0.1) * 0.9, 0)
    at(x, bell(233.1, 1.2, 0.8) * 0.6, 0.05)
    at(x, bell(220.0, 1.2, 0.8) * 0.6, 0.05)
    return x


def challenge():
    """Alguém desafia: martelo batendo na mesa."""
    x = silence(0.5)
    at(x, wood(420, 0.25) * 1.2, 0)
    at(x, thump(95, 0.3, 0.05) * 0.8, 0)
    return x


def win():
    x = silence(2.2)
    for i, f in enumerate([392.0, 523.3, 659.3, 784.0]):
        at(x, bell(f, 1.6, 0.6) * (0.7 + 0.1 * i), i * 0.13)
    return x


def lose():
    x = silence(2.2)
    for i, f in enumerate([392.0, 349.2, 311.1, 261.6]):
        at(x, bell(f, 1.6, 0.5) * 0.8, i * 0.18)
    return x


SOUNDS = {
    "match_strike": match_strike,
    "burn_out": burn_out,
    "turn": turn,
    "tick": tick,
    "income": income,
    "foreign_aid": foreign_aid,
    "tax": tax,
    "steal": steal,
    "assassinate": assassinate,
    "exchange": exchange,
    "coup": coup,
    "block_contessa": block_contessa,
    "block_duke": block_duke,
    "block_captain": block_captain,
    "block_ambassador": block_ambassador,
    "proven": proven,
    "bluff": bluff,
    "challenge": challenge,
    "win": win,
    "lose": lose,
}

# Volume relativo: o golpe e o estrondo mais altos, os cliques baixos.
PEAKS = {"tick": 0.5, "turn": 0.6, "income": 0.6, "foreign_aid": 0.65, "coup": 0.95}
# Volume percebido alvo (RMS da parte audível); o padrão é 0.14.
LOUD = {"tick": 0.08, "turn": 0.09, "income": 0.1, "foreign_aid": 0.1, "coup": 0.2, "burn_out": 0.11}


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    only = set(sys.argv[1:])
    for name, fn in SOUNDS.items():
        if only and name not in only:
            continue
        write(name, fn(), PEAKS.get(name, 0.85), LOUD.get(name, 0.14))
