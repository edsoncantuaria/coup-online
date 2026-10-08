import 'package:flutter/material.dart';

import '../../engine/models.dart';
import '../../game/online_game_controller.dart';
import '../../online/online_hub.dart';
import '../../online/social_service.dart';
import '../theme.dart';
import 'tv.dart';

/// O hub da conexão desta mesa, quando ela veio do Online (conta e amigos).
OnlineHub? hubOf(OnlineGameController c) {
  final h = OnlineHub.current;
  return h != null && identical(h.connection, c.connection) ? h : null;
}

/// Folha de um jogador da mesa online: adicionar como amigo e denunciar.
Future<void> showPlayerSheet(
  BuildContext context,
  OnlineGameController c,
  Player p,
) async {
  final hub = hubOf(c);
  // Mesa aberta por código, fora do hub: denúncia ainda funciona.
  final social = hub?.social ?? SocialService(c.connection);
  try {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PlayerSheet(
        controller: c,
        player: p,
        social: social,
        loggedIn: hub?.account.isLoggedIn ?? false,
      ),
    );
  } finally {
    if (hub == null) social.dispose();
  }
}

class _PlayerSheet extends StatefulWidget {
  const _PlayerSheet({
    required this.controller,
    required this.player,
    required this.social,
    required this.loggedIn,
  });
  final OnlineGameController controller;
  final Player player;
  final SocialService social;
  final bool loggedIn;

  @override
  State<_PlayerSheet> createState() => _PlayerSheetState();
}

class _PlayerSheetState extends State<_PlayerSheet> {
  ReportReason? _reason;
  final _note = TextEditingController();
  bool _sending = false;
  String? _done;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _addFriend(String userId) async {
    final r = await widget.social.sendFriendRequest(userId: userId);
    if (!mounted) return;
    setState(
      () => _done = r.ok
          ? r.data['result'] == 'already_friends'
                ? 'Vocês já são amigos.'
                : r.data['result'] == 'accepted'
                ? 'Agora vocês são amigos.'
                : 'Pedido de amizade enviado.'
          : r.message ?? 'Não deu para enviar o pedido.',
    );
  }

  Future<void> _report() async {
    final reason = _reason;
    if (reason == null) return;
    setState(() => _sending = true);
    final r = await widget.social.report(
      playerId: widget.player.id,
      reason: reason,
      note: _note.text,
    );
    if (!mounted) return;
    setState(() {
      _sending = false;
      _done = r.ok
          ? 'Denúncia enviada. Obrigado por avisar.'
          : r.message ?? 'Não deu para enviar a denúncia.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.player;
    final userId = widget.controller.userIdOf(p.id);
    final body = TextStyle(
      fontFamily: TvType.sans,
      fontSize: 14,
      height: 1.35,
      color: Tv.creditDim,
    );
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(p.name, style: TvType.title(36)),
              const SizedBox(height: 4),
              Text(
                (p.isBot
                        ? 'Bot da mesa'
                        : userId != null
                        ? 'Jogador com conta'
                        : 'Convidado sem conta')
                    .toUpperCase(),
                style: TvType.credit(11),
              ),
              if (_done != null) ...[
                const SizedBox(height: 20),
                Text(_done!, style: TvType.name(20)),
              ] else ...[
                if (!p.isBot && userId != null) ...[
                  const SizedBox(height: 16),
                  if (widget.loggedIn)
                    CueButton(
                      label: 'Adicionar amigo',
                      quiet: true,
                      icon: Icons.person_add_alt,
                      onPressed: () => _addFriend(userId),
                    )
                  else
                    Text(
                      'Entre numa conta no Online para adicionar amigos.',
                      style: body,
                    ),
                ],
                if (!p.isBot) ...[
                  const SizedBox(height: 24),
                  Text('DENUNCIAR', style: TvType.credit(11)),
                  for (final r in ReportReason.values)
                    CreditLine(
                      title: r.label,
                      size: 20,
                      credit: switch (r) {
                        ReportReason.voiceAbuse =>
                          'Ofensas, assédio ou barulho no chat de voz',
                        ReportReason.antiGame =>
                          'Entregar o jogo, combinar jogadas, abandonar',
                      },
                      onTap: () => setState(() => _reason = r),
                      trailing: Icon(
                        _reason == r
                            ? Icons.radio_button_checked
                            : Icons.radio_button_off,
                        color: _reason == r ? Tv.carmine : Tv.creditMuted,
                      ),
                    ),
                  if (_reason != null) ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: _note,
                      maxLength: SocialService.maxReportNote,
                      maxLines: 3,
                      minLines: 1,
                      decoration: const InputDecoration(
                        labelText: 'O que aconteceu? (opcional)',
                      ),
                    ),
                    const SizedBox(height: 8),
                    CueButton(
                      label: 'Enviar denúncia',
                      onPressed: _sending ? null : _report,
                    ),
                  ],
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Convidar amigos online para a sala em que você está.
Future<void> showInviteSheet(BuildContext context, OnlineHub hub) {
  hub.social.refresh();
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => ListenableBuilder(
      listenable: hub.social,
      builder: (context, _) {
        final online = hub.social.friends.where((f) => f.isOnline).toList();
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
            children: [
              Text('Chamar amigos', style: TvType.title(32)),
              const SizedBox(height: 8),
              if (online.isEmpty)
                const Text(
                  'Nenhum amigo online agora.',
                  style: TextStyle(
                    fontFamily: TvType.sans,
                    fontSize: 15,
                    color: Tv.creditDim,
                  ),
                ),
              for (final f in online) _InviteLine(hub: hub, friend: f),
            ],
          ),
        );
      },
    ),
  );
}

class _InviteLine extends StatefulWidget {
  const _InviteLine({required this.hub, required this.friend});
  final OnlineHub hub;
  final Friend friend;

  @override
  State<_InviteLine> createState() => _InviteLineState();
}

class _InviteLineState extends State<_InviteLine> {
  String? _state;

  @override
  Widget build(BuildContext context) => CreditLine(
    title: widget.friend.username,
    size: 20,
    credit: _state ?? 'Online',
    onTap: _state != null
        ? null
        : () async {
            final r = await widget.hub.social.inviteToRoom(
              widget.friend.userId,
            );
            if (mounted) {
              setState(
                () => _state = r.ok
                    ? 'Convite enviado'
                    : r.message ?? 'Não deu para convidar',
              );
            }
          },
    trailing: Text(
      _state == null ? 'CHAMAR' : '',
      style: TvType.credit(11, color: Tv.credit, weight: FontWeight.w700),
    ),
  );
}
