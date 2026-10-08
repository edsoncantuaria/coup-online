import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../game/online_game_controller.dart';
import '../../online/account_service.dart';
import '../../online/lobby_service.dart';
import '../../online/online_hub.dart';
import '../../online/social_service.dart';
import '../theme.dart';
import '../widgets/tv.dart';
import 'game_screen.dart';
import 'online_screen.dart';

/// A entrada do online: buscar partida com desconhecidos, salas abertas
/// (com quem criou), conta e amigos.
class LobbyScreen extends StatefulWidget {
  const LobbyScreen({
    super.key,
    required this.playerName,
    required this.serverUrl,
  });
  final String playerName;
  final String serverUrl;

  @override
  State<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends State<LobbyScreen> {
  late final OnlineHub hub = OnlineHub.forServer(widget.serverUrl);
  bool _starting = true;
  bool _online = false;
  OnlineGameController? _queuedTable;
  final _subs = <StreamSubscription<Object?>>[];

  AccountService get account => hub.account;
  LobbyService get lobby => hub.lobby;
  SocialService get social => hub.social;

  @override
  void initState() {
    super.initState();
    _subs
      ..add(lobby.matchFound.listen(_onMatch))
      ..add(social.invites.listen(_onInvite))
      ..add(
        social.friendRequests.listen(
          (f) => _snack('${f.username} quer ser seu amigo.'),
        ),
      );
    _start();
  }

  Future<void> _start() async {
    final ok = await hub.start();
    if (ok) await lobby.watchRooms();
    if (mounted) {
      setState(() {
        _starting = false;
        _online = ok;
      });
    }
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    if (lobby.queueStatus.searching) lobby.leaveQueue();
    _queuedTable?.dispose();
    lobby.unwatchRooms();
    super.dispose();
  }

  void _snack(String text, {SnackBarAction? action}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(text), action: action));
  }

  Future<void> _play(OnlineGameController table) async {
    await Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => GameScreen(controller: table)));
    if (!mounted) return;
    lobby.resetQueue();
    if (account.isLoggedIn) social.refresh();
    lobby.watchRooms();
  }

  // ------------------------------------------------------------ fila

  Future<void> _search() async {
    HapticFeedback.mediumImpact();
    _queuedTable?.dispose();
    final table = _queuedTable = hub.newTable();
    final reply = await lobby.joinQueue(playerName: widget.playerName);
    if (!reply.ok) {
      _queuedTable = null;
      table.dispose();
      _snack(reply.message ?? 'Não deu para entrar na fila.');
    }
  }

  Future<void> _cancel() async {
    await lobby.leaveQueue();
    _queuedTable?.dispose();
    _queuedTable = null;
  }

  void _onMatch(String roomId) {
    final table = _queuedTable;
    if (table == null || !mounted) return;
    _queuedTable = null;
    HapticFeedback.heavyImpact();
    _play(table);
  }

  // ------------------------------------------------------------ salas

  void _join(String roomId) {
    final table = hub.newTable()
      ..joinRoom(code: roomId, playerName: widget.playerName);
    _play(table);
  }

  void _onInvite(RoomInvite invite) => _snack(
    '${invite.from.username} chamou você para ${invite.roomName}.',
    action: SnackBarAction(
      label: 'ENTRAR',
      onPressed: () {
        social.dismissInvite(invite);
        _join(invite.roomId);
      },
    ),
  );

  // ------------------------------------------------------------ build

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    return Scaffold(
      backgroundColor: Tv.ink,
      body: ListenableBuilder(
        listenable: Listenable.merge([hub.connection, account, lobby, social]),
        builder: (context, _) {
          final main = [
            _searchBlock(),
            const SizedBox(height: 40),
            ..._rooms(),
          ];
          final side = [_account(), const SizedBox(height: 40), ..._friends()];
          return SafeArea(
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(child: _header()),
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(wide ? 40 : 20, 8, 20, 40),
                  sliver: SliverToBoxAdapter(
                    child: Align(
                      alignment: Alignment.topLeft,
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxWidth: wide ? 1100 : 600,
                        ),
                        child: wide
                            ? Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    flex: 3,
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: main,
                                    ),
                                  ),
                                  const SizedBox(width: 56),
                                  Expanded(
                                    flex: 2,
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: side,
                                    ),
                                  ),
                                ],
                              )
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  ...main,
                                  const SizedBox(height: 40),
                                  ...side,
                                ],
                              ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _header() {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final status = _starting
        ? 'Conectando'
        : hub.connection.connected
        ? 'No ar'
        : 'Fora do ar';
    return Padding(
      padding: EdgeInsets.fromLTRB(wide ? 28 : 8, 8, 20, 8),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Voltar',
            icon: const Icon(Icons.arrow_back, color: Tv.creditDim),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
          const SizedBox(width: 4),
          Expanded(child: Text('Online', style: TvType.title(wide ? 56 : 44))),
          Text(
            status.toUpperCase(),
            style: TvType.credit(
              11,
              color: hub.connection.connected ? Tv.proven : Tv.carmine,
              weight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _searchBlock() {
    final q = lobby.queueStatus;
    if (!_starting && !_online && !hub.connection.connected) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Sem sinal do servidor.', style: TvType.name(26)),
          const SizedBox(height: 6),
          Text(
            widget.serverUrl.toUpperCase(),
            style: TvType.credit(11, color: Tv.creditMuted),
          ),
          const SizedBox(height: 16),
          CueButton(
            label: 'Tentar de novo',
            quiet: true,
            onPressed: () {
              setState(() => _starting = true);
              _start();
            },
          ),
        ],
      );
    }
    if (q.searching) {
      final fill = q.botFillIn.inSeconds;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Procurando elenco…', style: TvType.title(36)),
          const SizedBox(height: 8),
          Text(
            [
              '${q.queued} na fila',
              if (q.position > 0) 'você é o ${q.position}º',
              fill > 0 ? 'bots completam em ${fill}s' : 'chamando bots',
            ].join(' · ').toUpperCase(),
            style: TvType.credit(11),
          ),
          const SizedBox(height: 16),
          _SearchTick(key: ValueKey(q.waited.inSeconds ~/ 60)),
          const SizedBox(height: 20),
          CueButton(label: 'Cancelar busca', quiet: true, onPressed: _cancel),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CueButton(
          label: 'Buscar partida',
          icon: Icons.bolt,
          onPressed: _starting ? null : _search,
        ),
        const SizedBox(height: 8),
        Text(
          'Mesa com desconhecidos. Se faltar gente, bots completam.'
              .toUpperCase(),
          style: TvType.credit(10.5),
        ),
      ],
    );
  }

  List<Widget> _rooms() {
    final rooms = lobby.rooms;
    return [
      Text('Salas abertas', style: TvType.title(30)),
      const SizedBox(height: 4),
      if (rooms.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Text(
            _starting ? 'Carregando salas…' : 'Nenhuma sala aberta agora.',
            style: const TextStyle(
              fontFamily: TvType.sans,
              fontSize: 15,
              color: Tv.creditDim,
            ),
          ),
        ),
      for (final r in rooms)
        CreditLine(
          title: r.displayName,
          size: 22,
          credit:
              'Criada por ${r.hostName} · ${r.players}/${r.maxPlayers} na mesa',
          onTap: r.freeSeats > 0 ? () => _join(r.roomId) : null,
          trailing: Text(
            r.freeSeats > 0 ? 'ENTRAR' : 'CHEIA',
            style: TvType.credit(
              11,
              color: r.freeSeats > 0 ? Tv.credit : Tv.creditMuted,
              weight: FontWeight.w700,
            ),
          ),
        ),
      CreditLine(
        title: 'Criar sala ou entrar com código',
        size: 20,
        credit: 'Sala privada para chamar amigos',
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => OnlineScreen(
              playerName: widget.playerName,
              initialServer: widget.serverUrl,
            ),
          ),
        ),
        trailing: const Icon(Icons.chevron_right, color: Tv.creditMuted),
      ),
    ];
  }

  Widget _account() {
    final user = account.user;
    if (user == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Sua conta', style: TvType.title(30)),
          const SizedBox(height: 4),
          Text(
            'Jogando como ${widget.playerName}, sem conta.',
            style: const TextStyle(
              fontFamily: TvType.sans,
              fontSize: 15,
              color: Tv.creditDim,
            ),
          ),
          const SizedBox(height: 12),
          CueButton(
            label: 'Entrar ou criar conta',
            quiet: true,
            onPressed: () => showAccountSheet(context, account).then((_) {
              if (account.isLoggedIn) social.refresh();
            }),
          ),
          const SizedBox(height: 8),
          Text(
            'Com conta, você adiciona amigos e chama eles para a sua mesa.'
                .toUpperCase(),
            style: TvType.credit(10),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('ESTRELANDO', style: TvType.credit(11)),
        const SizedBox(height: 2),
        Row(
          children: [
            Expanded(child: Text(user.username, style: TvType.title(34))),
            TextButton(onPressed: account.logout, child: const Text('SAIR')),
          ],
        ),
      ],
    );
  }

  List<Widget> _friends() {
    if (!account.isLoggedIn) return const [];
    final invites = social.pendingInvites;
    return [
      Row(
        children: [
          Expanded(child: Text('Amigos', style: TvType.title(30))),
          IconButton(
            tooltip: 'Adicionar amigo',
            icon: const Icon(Icons.person_add_alt, color: Tv.credit),
            onPressed: _addFriend,
          ),
        ],
      ),
      for (final i in invites)
        CreditLine(
          title: i.roomName,
          size: 20,
          credit: 'Convite de ${i.from.username}',
          onTap: () {
            social.dismissInvite(i);
            _join(i.roomId);
          },
          trailing: Text(
            'ENTRAR',
            style: TvType.credit(
              11,
              color: Tv.carmine,
              weight: FontWeight.w700,
            ),
          ),
        ),
      for (final f in social.incoming)
        CreditLine(
          title: f.username,
          size: 20,
          credit: 'Quer ser seu amigo',
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextButton(
                onPressed: () => social.respond(f.userId, accept: false),
                child: const Text('RECUSAR'),
              ),
              FilledButton(
                onPressed: () => social.respond(f.userId, accept: true),
                child: const Text('ACEITAR'),
              ),
            ],
          ),
        ),
      if (social.friends.isEmpty && social.incoming.isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 14),
          child: Text(
            'Ninguém ainda. Jogue uma partida e adicione quem jogou com você, '
            'ou procure pelo nome.',
            style: TextStyle(
              fontFamily: TvType.sans,
              fontSize: 15,
              height: 1.35,
              color: Tv.creditDim,
            ),
          ),
        ),
      for (final f in social.friends)
        CreditLine(
          title: f.username,
          size: 20,
          credit: friendStatusLabel(f.status),
          trailing: PopupMenuButton<String>(
            tooltip: 'Opções',
            icon: const Icon(Icons.more_horiz, color: Tv.creditMuted),
            onSelected: (_) => social.removeFriend(f.userId),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'remove', child: Text('Desfazer amizade')),
            ],
          ),
        ),
      for (final f in social.outgoing)
        CreditLine(
          title: f.username,
          size: 20,
          credit: 'Pedido enviado',
          trailing: TextButton(
            onPressed: () => social.removeFriend(f.userId),
            child: const Text('CANCELAR'),
          ),
        ),
    ];
  }

  Future<void> _addFriend() async {
    final ctrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Adicionar amigo'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Nome de usuário'),
          onSubmitted: (v) => Navigator.of(ctx).pop(v),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('CANCELAR'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(ctrl.text),
            child: const Text('PEDIR'),
          ),
        ],
      ),
    );
    if (name == null || name.trim().isEmpty) return;
    final r = await social.sendFriendRequest(username: name.trim());
    _snack(
      r.ok
          ? r.data['result'] == 'accepted'
                ? 'Agora vocês são amigos.'
                : 'Pedido enviado.'
          : r.message ?? 'Não deu para enviar o pedido.',
    );
    social.refresh();
  }
}

String friendStatusLabel(FriendStatus s) => switch (s) {
  FriendStatus.offline => 'Fora do ar',
  FriendStatus.online => 'Online',
  FriendStatus.searching => 'Procurando partida',
  FriendStatus.inLobby => 'Numa sala',
  FriendStatus.inMatch => 'Em partida',
};

/// Um traço que corre enquanto a fila procura.
class _SearchTick extends StatefulWidget {
  const _SearchTick({super.key});

  @override
  State<_SearchTick> createState() => _SearchTickState();
}

class _SearchTickState extends State<_SearchTick>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      _c.value = 0.5;
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 2,
    child: Stack(
      children: [
        const Positioned.fill(child: ColoredBox(color: Tv.rule)),
        AnimatedBuilder(
          animation: _c,
          builder: (_, _) => Align(
            alignment: Alignment(
              Curves.easeInOutCubic.transform(_c.value) * 2 - 1,
              0,
            ),
            child: const FractionallySizedBox(
              widthFactor: 0.25,
              child: ColoredBox(color: Tv.carmine, child: SizedBox(height: 2)),
            ),
          ),
        ),
      ],
    ),
  );
}

// ------------------------------------------------------------ conta

/// Entrar ou criar conta, numa folha só.
Future<void> showAccountSheet(BuildContext context, AccountService account) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AccountSheet(account: account),
    );

class _AccountSheet extends StatefulWidget {
  const _AccountSheet({required this.account});
  final AccountService account;

  @override
  State<_AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<_AccountSheet> {
  final _user = TextEditingController();
  final _pass = TextEditingController();
  bool _create = false;
  String? _error;

  @override
  void dispose() {
    _user.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final a = widget.account;
    final r = _create
        ? await a.register(_user.text, _pass.text)
        : await a.login(_user.text, _pass.text);
    if (!mounted) return;
    if (r.ok) {
      Navigator.of(context).pop();
    } else {
      setState(() => _error = r.message ?? 'Não deu certo.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = widget.account.busy;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _create ? 'Criar conta.' : 'Entrar.',
                style: TvType.title(36),
              ),
              const SizedBox(height: 4),
              Text(
                _create
                    ? 'Seu nome de usuário é o nome que aparece na mesa.'
                    : 'Com a conta, seus amigos te encontram.',
                style: const TextStyle(
                  fontFamily: TvType.sans,
                  fontSize: 14,
                  color: Tv.creditDim,
                ),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _user,
                autofocus: true,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.username],
                decoration: const InputDecoration(labelText: 'Usuário'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _pass,
                obscureText: true,
                autofillHints: [
                  _create ? AutofillHints.newPassword : AutofillHints.password,
                ],
                decoration: InputDecoration(
                  labelText: 'Senha',
                  helperText: _create ? 'Pelo menos 6 caracteres' : null,
                ),
                onSubmitted: (_) => _submit(),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(
                    fontFamily: TvType.sans,
                    color: Tv.carmine,
                  ),
                ),
              ],
              const SizedBox(height: 20),
              CueButton(
                label: _create ? 'Criar conta' : 'Entrar',
                onPressed: busy ? null : _submit,
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => setState(() {
                  _create = !_create;
                  _error = null;
                }),
                child: Text(
                  _create ? 'JÁ TENHO CONTA' : 'AINDA NÃO TENHO CONTA',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
