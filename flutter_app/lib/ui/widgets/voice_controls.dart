import 'package:flutter/material.dart';

import '../../game/voice_chat.dart';
import '../theme.dart';

/// Controle do chat de voz para a barra superior: entra na voz e, depois,
/// liga/desliga o microfone ou sai.
class VoiceButton extends StatelessWidget {
  const VoiceButton({super.key, required this.voice});
  final VoiceChat voice;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: voice,
      builder: (context, _) {
        if (voice.joining) {
          return const Padding(
            padding: EdgeInsets.all(14),
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          );
        }
        if (!voice.joined) {
          return IconButton(
            tooltip: 'Entrar no chat de voz',
            icon: const Icon(Icons.headset_mic_outlined),
            onPressed: () async {
              await voice.join();
              final err = voice.error;
              if (err != null && context.mounted) {
                ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text(err)));
              }
            },
          );
        }
        final muted = voice.muted;
        return Container(
          margin: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: (muted ? CoupColors.error : CoupColors.success).withValues(
              alpha: 0.14,
            ),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: muted ? 'Ligar microfone' : 'Silenciar microfone',
                icon: Icon(
                  muted ? Icons.mic_off : Icons.mic,
                  color: muted ? CoupColors.error : CoupColors.success,
                ),
                onPressed: voice.toggleMute,
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: 'Sair do chat de voz',
                icon: const Icon(
                  Icons.call_end,
                  size: 20,
                  color: CoupColors.textSecondary,
                ),
                onPressed: voice.leave,
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Indicador pequeno de quem está na voz: microfone verde ou cortado.
class VoiceBadge extends StatelessWidget {
  const VoiceBadge({super.key, required this.muted, this.size = 14});

  /// `null` = fora da voz (não desenha nada).
  final bool? muted;
  final double size;

  @override
  Widget build(BuildContext context) {
    final m = muted;
    if (m == null) return const SizedBox.shrink();
    final color = m ? CoupColors.error : CoupColors.success;
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: CoupColors.background,
        shape: BoxShape.circle,
        border: Border.all(color: color.withValues(alpha: 0.7)),
      ),
      child: Icon(m ? Icons.mic_off : Icons.mic, size: size, color: color),
    );
  }
}
