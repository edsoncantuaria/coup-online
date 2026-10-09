# Prompts das artes (Gemini)

Artes de `assets/cards/*.png`, geradas no Gemini (gemini.google.com).
Direção: **capa de caixa de fósforos impressa em serigrafia**, o mesmo mundo
"Caixas de fósforo" do app (ver `DESIGN.md`). Cada personagem usa a cor da
própria animação em `lib/ui/widgets/card_effects.dart`, para a arte e o efeito
parecerem a mesma coisa.

## Regras de enquadramento (o código depende disto)

- Quadrado 1:1, salvo em 1024×1024.
- `InfluenceCard` corta as laterais (carta 1:1,45): tudo que importa fica nos
  2/3 centrais da largura.
- `CloseUp` mostra a faixa entre 12% e 72% da altura, mirando o rosto
  (`faceOf` em `tv.dart`): cabeça no terço superior, centralizada.
- **Sem texto na arte.** O nome do personagem é desenhado pelo app.

## Bloco de estilo (cole no início de cada prompt)

```
Board game card illustration printed like a 1950s nightclub matchbook cover:
hand-inked with a thick confident brush line, flat spot colours only (at most
four inks: warm black #120E0C, cream paper #EFE6D2, matte gold #D9B25A, plus
the character colour), shading done with hatching and coarse halftone dots,
slight print misregistration, uncoated paper grain. Stylised, graphic,
readable at small size, like a printed card from a real tabletop game.
Square 1:1 composition: one character, centred, head in the upper third,
everything important inside the central two thirds of the width (the sides
will be cropped), simple flat background in one ink with a single bold
graphic motif. NO smooth gradients, NO glossy digital painting, NO cinematic
lighting, NO 3D render look, NO plastic skin, NO bokeh. NO text, letters,
numbers, logo, banner, frame, border or signature anywhere.
```

## Personagens

### Duque (`duke.png`) — vinho #6B1622 + raios dourados

Animação: brilho carmesim com raios de sol dourados e o ícone de tesouro.

```
[estilo] Character: the Duke, a heavy-set renaissance nobleman in his fifties,
trimmed grey beard, heavy-lidded smug eyes, fur-collared oxblood (#6B1622)
robe, thick gold chain of office. He holds a fat coin purse up near his
chest, three gold coins spilling from it. Background: flat oxblood with a
gold sunburst of straight rays radiating from behind his head.
```

### Assassino (`assassin.png`) — violeta #B39AD9 sobre roxo #2A1838

Animação: punhal em diagonal e dois cortes em X sobre vinheta escura.

```
[estilo] Character: the Assassin, lean figure in a deep purple (#2A1838)
hood and scarf covering the lower face, only sharp narrow eyes visible,
lit from one side so half the face is solid black. One gloved hand raises a
long thin dagger diagonally across the chest, blade picked out in pale
violet (#B39AD9). Background: flat deep purple with two crossed diagonal
slash marks in pale violet behind the figure.
```

### Capitão (`captain.png`) — azul-aço #8FB8D8 sobre marinho #173247

Animação: âncora e corrente puxando moedas do alvo.

```
[estilo] Character: the Captain, weathered naval officer in his forties,
square jaw, short dark beard, scar across one eyebrow, bicorne hat, navy
(#173247) coat with brass buttons. A heavy iron chain is wrapped around his
forearm and hangs down to a ship's anchor he rests on his shoulder.
Background: flat navy with a big steel-blue (#8FB8D8) circle like a ship's
porthole behind his head.
```

### Embaixador (`ambassador.png`) — ocre/dourado #F2D68A + lacre #8C3B3B

Animação: caixa de cartas que abre e troca; bloqueio com martelo e lacre vermelho.

```
[estilo] Character: the Ambassador, slim elegant diplomat in his thirties,
clean-shaven, knowing half-smile, ochre (#4B3A17) and gold doublet with a
starched white ruff. He fans out two playing cards in one hand and holds up a
folded letter closed with a big red wax seal (#8C3B3B) in the other.
Background: flat ochre with a pale gold (#F2D68A) diamond-pattern band like
a diplomatic sash behind him.
```

### Condessa (`contessa.png`) — rosa #E38FB3 + lilás #DCD4E6 sobre ameixa #3A2234

Animação: escudo com lua que barra o ataque.

```
[estilo] Character: the Contessa, poised noblewoman in her thirties, pale
skin, dark hair in a high braided updo, cool unimpressed gaze, plum (#3A2234)
gown with high lace collar, pearl choker. She raises one open hand palm
forward, a calm "stop" gesture, holding a closed fan in the other. Background:
flat plum with a large lilac (#DCD4E6) crescent moon behind her head and a few
small rose (#E38FB3) stars.
```

## Pós-processamento

O Gemini entrega PNG/JPEG maior que 1024: redimensionar para 1024×1024 e
salvar como JPEG qualidade ~88 com extensão `.png` (o Flutter lê pelo
conteúdo, e é assim que os arquivos atuais já estão).
