# Design: Intriga

The visual world is **Caixas de fósforo**: a drawer of night-club matchbooks. Edson chose it on 2026-10-08. The full contract is in `.impeccable/surfaces/lib-ui-screens-home-screen-dart.md`; this file records how the code carries it.

## Tokens (`lib/ui/theme.dart`, class `Tv`)

| Token | Value | Use |
|---|---|---|
| `ink` | #120E0C | Ground (drawer black) |
| `stage` / `stageHigh` | #1C1714 / #26201B | Sheets, dialogs, prompt bar |
| `rule` | #3A322B | Dividers |
| `credit` / `creditDim` / `creditMuted` | #EFE6D2 / #C2B6A0 / #978B78 | Text: primary, secondary, muted (all ≥ 4.8:1 on every ground) |
| `oxblood` | #6B1622 | Primary action fill (`CueButton`, `FilledButton`) |
| `bottle` | #1E3B2D | Alternate cover colour |
| `foil` | #D9B25A | Script titles, primary label, selected state, coins |
| `striker` | #5E5852 | Striker strip on cover edges and phase cues |
| `carmine` | #B8322A | Match head: challenge button, danger fills, the "Agir" block |
| `carmineText` | #E8705F | Red text on dark grounds |
| `char` | #2B2420 | Burnt match |
| `proven` / `bluff` / `cue` | #6FBF8A / #B99AE8 / #8DB8E0 | Proven claim, bluff, deciding |

Rival covers take one of five club colours from `clubColor(id)` in `opponent_seat.dart`.

## Type (`TvType`)

- **`title`:** Yellowtail (Apache 2.0) in foil. Used only for titles such as "Intriga", "Sua jogada." and "Blefe.".
- **`name`:** Archivo Narrow 700, for names, actions and menu lines.
- **`credit`:** Archivo Narrow caps, tracked at 0.14em, for the striker-strip text, labels and states.
- **`figure`:** Archivo Narrow with tabular figures, for coins and timers.

## Pieces (`lib/ui/widgets/tv.dart`)

- **`StrikerStrip`:** the grey band with diagonal grain.
- **`LetterboxBar`:** a striker strip that carries the phase cue: AÇÃO, DESAFIO?, BLOQUEIO, REVELAÇÃO. It turns match-head red when hot.
- **`CueButton`:** the oxblood cover with a foil caps label and a striker edge. The quiet variant is a striker outline.
- **`CreditLine`:** a tappable line made of a name, a caps credit and a rule.
- **`LowerThird`:** the claim credit under a portrait.
- **`CloseUp` / `PushInCloseUp`:** the character art, cropped to the face and printed with a warm grade. The art has no text.
- **`MatchStick`:** one unit of influence. It shows whole or burnt, with the role initial underneath once the role is known.
- **`BallisticCount`:** the coin count, which moves with overshoot.
- **`EffectPainter`** (`card_effects.dart`): the action and block animations, printed like the card art. Shapes are flat with an ink outline and a misregistered ink shadow, and coarse halftone dots stand in for light. Each role reuses its card's colour and motif: the Duke's purse and gold-on-oxblood sunburst, the Assassin's violet X (red only at the strike), the Captain's anchor and chain links, the Ambassador's sealed letter and diamond, and the Contessa's lilac moon with rose stars. Draw motifs in the painter, not with Material icons.

## Signature moment

When a challenge resolves or a match burns, `FreezeFrame` (`stage.dart`) plays in this order:

1. A one-frame warm strike flash.
2. The greyscale portrait.
3. The verdict in script ("Provado.", "Blefe.", "Um palito a menos." or, for the last influence, "Apagou.") with a caps credit.
4. On a loss, a `BurningMatch` (`tv.dart`) strikes, burns down to char and goes out with a wisp of smoke.

Each scene lasts `Pacing.freeze` (3.4 s). A challenge and the loss it causes play one after the other, never on top of each other. This is the single authored motion on the table. Reduced motion skips the push-in.

## Pacing

`lib/game/pacing.dart` holds the table's tempo, and the server (`RoomManager.ts`) uses the same numbers. After each play the table waits for its scene to finish: 3.4 s per freeze and up to 2.6 s for a card effect. Bots think 5–10 s before choosing an action and 1.5–3 s before reacting, since reactions are asked one player at a time. Every decision has a 30 s clock. Three timeouts in a row eliminate the player; this happens between plays, so nobody else's play gets cancelled.

## Sound

`lib/ui/sounds.dart` plays the effects in `assets/sounds/`, which `tool/make_sounds.py` synthesises (no third-party samples). Each card animation has its own sound. There is a gavel plus "proven" or "bluff" for a challenge, the match burning for a loss, two wood knocks on your turn, ticks in the last 5 seconds, and a sting for a win or a loss. Sound can be toggled in the game's ⋮ menu and the choice is saved on the device. Audio failures never break the game.

## Rules kept

- No glows or blurred halos. No gradient text. No nested cards. No emoji icons.
- A phase or a bluff is never shown by colour alone. Bluff blocks read "· BLEFE".
- Touch targets are at least 48dp. The primary button is 56dp, and Agir is 96×64.
- All copy is in pt-BR.

## Rasters

- **Character art:** `assets/cards/*.png`, matchbook-print portraits made in Gemini (prompts in `ART_PROMPTS.md`), shared with `client/`. The art carries no text; `InfluenceCard` prints the name.
- **App icons:** generated by `tool/make_icons.py` (`python3 tool/make_icons.py . preview.png`; oxblood cover, one standing match, striker band). Regenerate them rather than editing the PNGs by hand.
