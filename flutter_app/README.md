# Coup em Flutter

Nova versão do Coup para **Android, iOS e Web**, num único código Flutter.
Substitui o app Expo/React Native de `client/` e conversa com o mesmo servidor de `server/`.

## Rodar

```bash
cd flutter_app
flutter pub get
flutter run -d chrome          # web
flutter run                    # Android/iOS com aparelho ou emulador
```

O endereço padrão do servidor online é `http://localhost:3000`. Para um build apontando para outro servidor:

```bash
flutter build web --dart-define=COUP_SERVER_URL=https://seu-servidor
flutter build apk --dart-define=COUP_SERVER_URL=https://seu-servidor
```

O jogador também pode trocar o servidor na tela Online (fica salvo no aparelho).

## Campanha

Modo roguelike offline: 7 cortes em sequência, cada partida com uma punição
sorteada (ex.: começar sem moedas, Golpe mais caro, rivais que conhecem uma
das suas cartas). Vencer dá uma bênção à escolha; perder gasta a vida extra
ou encerra a campanha. Punições, bênçãos e cortes ficam em
`lib/campaign/campaign.dart`. O teste `test/campaign_test.dart` simula milhares
de partidas para garantir que nenhuma punição deixe a corte impossível; rode
com `--dart-define=CALIBRATE=true` para ver a tabela de taxas de vitória.

## Níveis dos bots

Fácil, Normal e Difícil, escolhidos na Partida Livre. O Difícil
(`lib/engine/bot_tracker.dart`) lembra de cada declaração da mesa, conta as
cartas já reveladas e estima a chance de cada rival ter o personagem que diz
ter; desafia, bloqueia e blefa pesando esse risco. Na campanha, as cortes 1 e
2 têm rivais Fáceis e as cortes 5 a 7 têm um rival Difícil. O teste
`test/bot_skill_test.dart` faz um torneio simulado e exige que o Difícil vença
os outros níveis.

## Chat de voz

Nas salas online, o ícone de fone na barra superior entra no chat de voz
(áudio WebRTC direto entre os jogadores; o servidor só repassa a sinalização).
O STUN público do Google resolve a maioria das redes. Em redes com NAT
restrito (4G, redes corporativas) é preciso um servidor TURN:

```
flutter run --dart-define=COUP_TURN_URL=turn:seu-host:3478 \
  --dart-define=COUP_TURN_USER=usuario --dart-define=COUP_TURN_PASS=senha
```

## Estrutura

| Pasta | O que tem |
| --- | --- |
| `lib/engine/` | Regras do Coup (`coup_engine.dart`), modelos e IA dos bots. Dart puro, sem Flutter. Porta fiel de `client/engine/CoupEngine.ts`. |
| `lib/game/` | Controladores de partida: `LocalGameController` (offline contra bots) e `OnlineGameController` (socket.io). A UI só conhece a interface `GameController`. |
| `lib/ui/` | Tema, cartas, assentos da mesa e telas (menu, mesa, online, regras). |
| `assets/cards/` | Arte das cartas (a mesma do app antigo). |

## Testes

```bash
flutter test                                   # regras, bots e partidas completas na UI
# ponta a ponta com o servidor real:
(cd ../server && npx tsc && PORT=3999 BOT_DELAY_MS=30 node dist/index.js) &
COUP_E2E_URL=http://localhost:3999 flutter test test/online_e2e_test.dart
```
