import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../../game/online_game_controller.dart';
import '../../game/voice_chat.dart';
import '../theme.dart';
import 'common.dart';
import 'voice_controls.dart';

// -------------------------------------------------------------------- lobby

class LobbyView extends StatelessWidget {
  const LobbyView({super.key, required this.controller, this.voice});
  final OnlineGameController controller;
  final VoiceChat? voice;

  @override
  Widget build(BuildContext context) {
    final s = controller.state!;
    final code = controller.roomCode ?? '';
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
          children: [
            // Cartão de título da sala.
            Text(controller.roomName ?? 'Sala', style: TvType.title(40)),
            const SizedBox(height: 20),
            // O código como crédito, entre dois fios.
            Container(
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: const BoxDecoration(
                border: Border(
                  top: BorderSide(color: Tv.rule),
                  bottom: BorderSide(color: Tv.rule),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      SizedBox(
                        width: 96,
                        child: Text(
                          'CÓDIGO DA SALA',
                          style: TvType.credit(11, color: Tv.creditMuted),
                        ),
                      ),
                      Expanded(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: SelectableText(
                            code,
                            style: TvType.figure(40)
                                .copyWith(letterSpacing: 10),
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Copiar código',
                        icon: const Icon(Icons.copy, color: Tv.credit),
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: code));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Código copiado')),
                          );
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Envie para seus amigos entrarem pela tela Online.',
                    style: TextStyle(fontSize: 14, color: Tv.creditDim),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            // O elenco da sala, como créditos.
            Text(
              'NOBRES NA SALA (${s.players.length}/6)',
              style: TvType.credit(12, color: Tv.credit),
            ),
            const SizedBox(height: 4),
            for (final p in s.players)
              Container(
                constraints: const BoxConstraints(minHeight: 60),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: Tv.rule)),
                ),
                child: Row(
                  children: [
                    PlayerAvatar(player: p, size: 36),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            p.name,
                            style: TvType.name(20),
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            (p.id == controller.myId
                                    ? 'Você'
                                    : p.isBot
                                    ? 'Bot · ${personalityLabel(p.personality ?? BotPersonality.balanced)}'
                                    : 'Jogador')
                                .toUpperCase(),
                            style: TvType.credit(11),
                          ),
                        ],
                      ),
                    ),
                    VoiceBadge(muted: voice?.voiceOf(p.id), size: 14),
                    if (p.id == controller.hostId) ...[
                      const SizedBox(width: 10),
                      Text(
                        'ANFITRIÃO',
                        style: TvType.credit(11, color: Tv.credit),
                      ),
                    ],
                  ],
                ),
              ),
            if (voice != null && !voice!.joined) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: voice!.joining ? null : voice!.join,
                  icon: const Icon(Icons.headset_mic_outlined),
                  label: const Text('ENTRAR NO CHAT DE VOZ'),
                ),
              ),
            ],
            const SizedBox(height: 24),
            if (controller.amHost) ...[
              FilledButton.icon(
                onPressed: controller.startGame,
                icon: const Icon(Icons.play_arrow_rounded),
                label: Text(
                  s.players.length < 2
                      ? 'INICIAR (ENTRA 1 BOT)'
                      : 'INICIAR PARTIDA',
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: s.players.length < 6 ? controller.addBot : null,
                icon: const Icon(Icons.smart_toy_outlined),
                label: const Text('ADICIONAR BOT'),
              ),
            ] else
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Aguardando o anfitrião iniciar a partida...',
                  style: TextStyle(fontSize: 15, color: Tv.creditDim),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
