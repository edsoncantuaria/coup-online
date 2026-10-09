# Intriga

**Intriga** é um jogo de blefe e influência na corte, inspirado no Coup, para **Android, iOS e Web**, num único código Flutter.
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

## Marca

O nome do app vem de `lib/branding.dart`. A fonte de títulos é a Cinzel
(SIL Open Font License, em `assets/fonts/`). Os ícones de Android, iOS e Web
foram gerados a partir do mesmo desenho do brasão (`lib/ui/widgets/emblem.dart`).
"Coup" é marca da editora do jogo de tabuleiro, por isso o app se chama Intriga.

## Campanha

Modo roguelike offline: 7 cortes em sequência, cada partida com uma punição
sorteada (ex.: começar sem moedas, Golpe mais caro, rivais que conhecem uma
das suas cartas). Bênçãos são raras: vencer as cortes 1 e 4 garante uma
à escolha, e a corte 6 dá 50% de chance. Perder gasta a vida extra
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

## Contas, Buscar partida, amigos e denúncias

A camada de dados fica em `lib/online/` (as telas ainda vão usá-la):

| Arquivo | O que faz |
| --- | --- |
| `online_connection.dart` | `OnlineConnection`: um socket só para conta, lobby, amigos e partida. `request()` manda um evento e espera o ack (`ServerReply`). |
| `account_service.dart` | `AccountService`: criar conta, entrar, sair, `restore()` da sessão salva (token no `SharedPreferences`). Quem não entra joga como convidado. |
| `lobby_service.dart` | `LobbyService`: salas abertas (`rooms`, `watchRooms()`) e fila de partida (`joinQueue()`, `queueStatus`, `queueStatusStream`, `matchFound`). |
| `social_service.dart` | `SocialService`: amigos com situação ao vivo, pedidos, convite para a sala (`inviteToRoom`, stream `invites`) e denúncias (`report`). |

Para jogar a partida da fila ou entrar por convite, crie o controlador com a
mesma conexão: `OnlineGameController.shared(connection)`.

- **Entrar**: no alto da abertura, o botão Entrar abre três caminhos:
  jogar como convidado (só um nome), entrar com login ou criar conta
  (`lib/ui/widgets/entry_sheet.dart`). Com uma sessão salva, a abertura
  retoma a conta sozinha.
- **Contas**: usuário (3 a 20 letras, números, `.`, `-`, `_`), email e senha
  (6+). Entra com o usuário ou com o email. Logado, o nome na mesa é sempre o
  da conta.
- **Email**: ao criar a conta o servidor manda um link de confirmação (vale
  48 h; dá para pedir de novo na tela da conta). "Esqueci a senha" manda um
  link que abre uma página do próprio servidor para criar a senha nova (vale
  1 h, uso único, derruba as sessões abertas). Contas antigas, sem email,
  continuam entrando pelo usuário.
- **Buscar partida**: a fila junta quem está sem sala numa partida pública.
  Com 6 na fila começa na hora; com 4 ou 5, espera uns segundos por mais
  gente; se o primeiro da fila esperar 20 s, bots completam a mesa (até 4).
- **Salas abertas**: aparecem as salas públicas no lobby, com quem criou e
  quantos lugares estão ocupados. Salas privadas (marcadas como privadas ou
  com senha) só entram por código ou convite.
- **Amigos**: depois de jogar com alguém logado, peça amizade pelo id da conta
  (`OnlineGameController.userIdOf`) ou pelo nome de usuário; o outro aceita.
  A lista mostra offline, online, buscando partida, no lobby ou em partida.
  Convite para sala vale 10 minutos e dispensa a senha.
- **Denúncias**: abuso no chat de voz ou antijogo, com observação opcional
  (até 280 caracteres), contra quem jogou com você. Limite de 5 a cada 10
  minutos por conta (convidados: por IP) e uma por jogador por partida.

### Onde o servidor guarda os dados

Num banco SQLite, `intriga.db`, na pasta `DATA_DIR` (padrão `server/data/`,
fora do git). Usa o `node:sqlite` embutido no Node (22.16 ou mais novo), sem
dependência extra. Tabelas:

- `users`, `sessions` e `friend_links`: contas, sessões e amizades. A senha
  fica só como hash scrypt com sal aleatório; das sessões fica só o sha256 do
  token.
- `reports`: cada denúncia (quem, contra quem, sala, motivo e observação).
  Ainda não há painel; consulte direto, por exemplo o total por jogador:
  `sqlite3 server/data/intriga.db "SELECT target_name, COUNT(*) FROM reports GROUP BY target_key"`.

O esquema sobe sozinho na partida (`server/src/store/Database.ts`). Quem tinha
os antigos `accounts.json` e `reports.json` na pasta tem tudo importado na
primeira subida; os arquivos viram `*.imported`. Para backup, copie
`intriga.db` com o servidor parado (ou use `sqlite3 intriga.db ".backup copia.db"`).

Ajustes por variável de ambiente: `QUEUE_BOT_FILL_MS` (20000),
`QUEUE_GATHER_MS` (8000), `QUEUE_MIN_PLAYERS` (4), `QUEUE_BOT_FILL_TARGET` (4),
`REPORT_LIMIT` (5), `REPORT_WINDOW_MS` (600000), `REGISTER_LIMIT` (20 contas
por IP por hora) e `TRUST_PROXY=1` atrás de proxy reverso.

### Email (SMTP)

Sem `SMTP_HOST` os emails só aparecem no log do servidor (com o link), o
que basta para testar. Para mandar de verdade, defina:

| Variável | Exemplo | Para quê |
| --- | --- | --- |
| `PUBLIC_URL` | `https://intriga.exemplo.com` | Base dos links nos emails (padrão: `http://localhost:<porta>`) |
| `SMTP_HOST` | `smtp.resend.com` | Liga o envio por SMTP |
| `SMTP_PORT` | `587` | 587 (STARTTLS) ou 465 (TLS) |
| `SMTP_SECURE` | `true` | Força TLS direto; padrão é `true` só na 465 |
| `SMTP_USER` / `SMTP_PASS` | | Credenciais do provedor (nunca no git) |
| `MAIL_FROM` | `Intriga <no-reply@exemplo.com>` | Remetente |

Rotas: `POST /api/auth/verify-email`, `/resend-verification` (com
`Bearer`), `/forgot-password`, `/reset-password`, e as páginas
`GET /verify-email?token=` e `GET /reset-password?token=`. Pelo socket:
`account_resend_verification` e `account_forgot_password`.

## Estrutura

| Pasta | O que tem |
| --- | --- |
| `lib/engine/` | Regras do Coup (`coup_engine.dart`), modelos e IA dos bots. Dart puro, sem Flutter. Porta fiel de `client/engine/CoupEngine.ts`. |
| `lib/online/` | Conta, salas abertas, fila de partida, amigos e denúncias (sem telas). |
| `lib/game/` | Controladores de partida: `LocalGameController` (offline contra bots) e `OnlineGameController` (socket.io). A UI só conhece a interface `GameController`. |
| `lib/ui/` | Tema, cartas, assentos da mesa e telas (menu, mesa, online, regras). |
| `assets/cards/` | Arte das cartas (a mesma do app antigo). |

## Testes

```bash
flutter test                                   # regras, bots e partidas completas na UI
# ponta a ponta com o servidor real:
(cd ../server && npx tsc && PORT=3999 BOT_DELAY_MS=30 QUEUE_BOT_FILL_MS=3000 \
  DATA_DIR=/tmp/intriga-e2e node dist/index.js) &
COUP_E2E_URL=http://localhost:3999 flutter test test/online_e2e_test.dart
# servidor: contas, fila, salas abertas, amigos e denúncias
(cd ../server && npm test)
```
