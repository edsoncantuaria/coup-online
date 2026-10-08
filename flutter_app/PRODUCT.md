# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

Flutter app shipping to Android, iOS and Web from one codebase. Android phones are the inferred primary target (not yet confirmed by the owner); iOS and the web build must keep working with the same design.

## Users

People who like social deduction and bluffing games, playing on their phones in short sessions: alone against bots (offline, campaign), or online with strangers found by matchmaking and later with the friends they make there. Portuguese-speaking (pt-BR) first.

## Product Purpose

Intriga is a bluffing card game of influence at court, with the same rules as the board game Coup. Each player holds two hidden characters, claims powers they may not have, and challenges or blocks the others' claims. The last player with influence wins. Success means sessions that feel addictive and frenetic ("viciante, frenético", in the owner's words): fast turns, constant tension, and a reason to play one more match.

## Positioning

A complete mobile Coup experience, with offline modes no tabletop adaptation offers:
- bots at three skill levels, the hardest of which counts cards and reads bluffs;
- a roguelike campaign of seven courts, where each match draws a random curse and blessings are rare;
- online rooms with voice chat.

## Operating Context

- **Offline:**
  - quick match against 1–5 bots, with difficulty and bot personality chosen;
  - the campaign, whose progress is saved on the device.
- **Online:**
  - Socket.io server, with rooms joined by code and voice chat inside rooms.
  - In progress: accounts, matchmaking with strangers, open-room browser showing each room's creator, friends added after a match, and reports for voice abuse or anti-game behaviour.
- **Session shape:** one match lasts a few minutes, with a 30s turn clock (12s under one campaign curse). Decisions (challenge, block, pass) must be made within seconds while other players watch.

## Capabilities and Constraints

- **Rules:** the official Coup rules. The campaign varies them per player through house rules; online always uses the official rules.
- **Characters:** Duke, Assassin, Captain, Ambassador, Contessa. Character art lives in `assets/cards/`.
- **Language:** all UI copy is in Portuguese (pt-BR).
- **Name:** "Coup" is a trademark of the board game's publisher, so the product is called Intriga. Store copy may say "inspired by Coup".
- **Accessibility:** respect the system's reduced-motion setting. Haptics are used for key moments.

## Brand Commitments

- **Name:** Intriga.
- **Tagline:** "Blefe · Influência · Poder".
- **Feel:** the owner asked for an addictive, frenetic game feel, and explicitly rejected generic "AI slop" UI.

## Evidence on Hand

- **Art:** five character illustrations in `assets/cards/`.
- **Absent:** no player counts, reviews, or store listing exist yet. Do not invent them.

## Product Principles

- Speed of decision over decoration: the player must read the table state and act within seconds.
- Tension is the product: every claim, challenge and reveal should land as an event.
- One more match: results flow straight into the next game or campaign step.
- Bluffing must stay readable: hidden information is clear about what is known and what is claimed.
