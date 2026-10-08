---
version: 1
slug: "lib-ui-screens-home-screen-dart"
primary_target: "lib/ui/screens/home_screen.dart"
related_targets: ["lib/ui/screens/game_screen.dart","lib/ui/screens/campaign_screen.dart","lib/ui/screens/online_screen.dart"]
---

# Surface brief: app shell (home, game table, campaign, online)

Scope: every screen of the Flutter app. Visitor mode: Experience (the player is inside the game; the work leads from the first viewport). Audience: pt-BR mobile players of bluffing games, short frenetic sessions. Constraints: Material back/touch targets on Android, reduced motion respected, real character art only.

## Direction contract

THESIS: Every match is a chapter of a primetime palace telenovela: claims are cast credits, challenges are freeze-frame cliffhangers, reveals are hard cuts. Refuses the category default of gold-on-parchment medieval card-game chrome, embers and crests.

OWN-WORLD: Broadcast black tinted plum as ground; character portraits as full-bleed close-ups graded plum-to-warm; one hot carmine reserved for the cliffhanger (challenge, freeze, danger); warm white credits. Bodoni Moda italic for names and title cards, Archivo Narrow caps for credits, labels and numbers. Letterbox bars, lower-third credit bars with a hairline rule, chapter cards. No cards-as-containers, no gradients on text, no glows.

STORY: The player always knows whose scene it is and who claims what, feels the tension spike on every claim, and acts within seconds; results cut straight to the next chapter.

FIRST VIEWPORT: Home is a cold open: one character close-up fills the screen behind letterbox bars, slowly pushing in, recast each visit. The title card "Intriga" sits in the lower third in Bodoni italic. Below it, menu items are set as credit lines; the campaign's next chapter is the primary action, full width, carmine. Table: the rivals are a cast strip at the top. The current actor gets a close-up band, claims land as lower-thirds, and the player's hand sits at the bottom with one Agir action.

FORM: telenovela opening and cliffhanger grammar, candidate 3 of 7 on the ordered list, seed key 9782cf13.
Raised by bioluminescent wake: claims leave fading traces on each cast portrait, so the table remembers who said what.
Raised by VU meter bridge: coins and threat move with mass and overshoot, never instantly.
Raised by cyclorama dawn: each phase (Ação, Desafio, Bloqueio, Revelação) is a named lighting cue on the letterbox, never colour alone.
Raised by ASCII scene: one strict grid governs every screen.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
