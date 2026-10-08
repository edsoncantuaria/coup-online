import 'dart:math';

import 'package:flutter/material.dart';

import '../../engine/models.dart';
import '../theme.dart';

/// Peças do mundo "novela": closes, letterbox, créditos e cartões de título.

/// Onde fica o rosto de cada retrato (as artes têm uma faixa de pergaminho
/// embaixo, que o close sempre deixa de fora).
Alignment faceOf(Role r) => switch (r) {
  Role.duke => const Alignment(0.0, -0.62),
  Role.assassin => const Alignment(0.0, -0.55),
  Role.captain => const Alignment(-0.24, -0.66),
  Role.ambassador => const Alignment(0.0, -0.62),
  Role.contessa => const Alignment(0.04, -0.66),
};

/// Gradação da novela: tira um pouco da saturação e puxa as sombras para o
/// ameixa, para todos os retratos parecerem do mesmo capítulo.
const _grade = ColorFilter.matrix([
  0.86, 0.10, 0.04, 0, 6, //
  0.06, 0.80, 0.06, 0, -2, //
  0.06, 0.08, 0.84, 0, 8, //
  0, 0, 0, 1, 0,
]);

/// Close de um personagem, recortado no rosto. [zoom] > 1 aproxima.
class CloseUp extends StatelessWidget {
  const CloseUp({
    super.key,
    required this.role,
    this.zoom = 1.0,
    this.dim = 0.0,
    this.grayscale = false,
  });

  final Role role;
  final double zoom;

  /// Escurece a imagem (0 a 1), para texto por cima.
  final double dim;

  /// Usado no congelamento do desafio.
  final bool grayscale;

  @override
  Widget build(BuildContext context) {
    final face = faceOf(role);
    Widget img = Image.asset(
      roleArt(role),
      fit: BoxFit.fill,
      filterQuality: FilterQuality.medium,
      gaplessPlayback: true,
    );
    img = ColorFiltered(
      colorFilter: grayscale
          ? const ColorFilter.matrix([
              0.30, 0.55, 0.15, 0, 0, //
              0.24, 0.45, 0.12, 0, 0, //
              0.26, 0.48, 0.13, 0, 0, //
              0, 0, 0, 1, 0,
            ])
          : _grade,
      child: img,
    );
    return ClipRect(
      child: LayoutBuilder(
        builder: (context, c) {
          final w = c.maxWidth;
          final h = c.maxHeight;
          // A arte é quadrada; só a faixa entre 12% e 72% da altura entra
          // em cena (em cima há placas com o nome em algumas artes e embaixo
          // a faixa de pergaminho com o nome impresso).
          final art = max(h / (_visible - _topCut), w) * zoom;
          final left = (w - art) * (face.x + 1) / 2;
          final top = ((h - art) * (face.y + 1) / 2)
              .clamp(min(h - art * _visible, 0.0), 0.0)
              .toDouble();
          return Stack(
            clipBehavior: Clip.hardEdge,
            children: [
              Positioned(
                left: left,
                top: top,
                width: art,
                height: art,
                child: img,
              ),
              if (dim > 0)
                Positioned.fill(
                  child: ColoredBox(color: Tv.ink.withValues(alpha: dim)),
                ),
            ],
          );
        },
      ),
    );
  }

  static const _visible = 0.72;
  static const _topCut = 0.12;
}

/// Close que aproxima devagar, como o plano de abertura de uma novela.
class PushInCloseUp extends StatefulWidget {
  const PushInCloseUp({
    super.key,
    required this.role,
    this.from = 1.0,
    this.to = 1.12,
    this.duration = const Duration(seconds: 14),
  });
  final Role role;
  final double from;
  final double to;
  final Duration duration;

  @override
  State<PushInCloseUp> createState() => _PushInCloseUpState();
}

class _PushInCloseUpState extends State<PushInCloseUp>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: widget.duration,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      _c.value = 0.4;
    } else if (!_c.isAnimating) {
      _c.forward(from: 0);
    }
  }

  @override
  void didUpdateWidget(covariant PushInCloseUp old) {
    super.didUpdateWidget(old);
    if (old.role != widget.role && !MediaQuery.of(context).disableAnimations) {
      _c.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (context, _) => CloseUp(
      role: widget.role,
      zoom:
          widget.from +
          (widget.to - widget.from) * Curves.easeOutCubic.transform(_c.value),
    ),
  );
}

/// Faixa preta do letterbox, com a deixa da cena (fase do jogo) escrita nela.
class LetterboxBar extends StatelessWidget {
  const LetterboxBar({super.key, this.cue, this.height = 28, this.hot = false});

  /// Nome da deixa ("AÇÃO", "DESAFIO"...). Nunca só a cor carrega a fase.
  final String? cue;
  final double height;

  /// Deixa quente (desafio, bloqueio): o texto vira carmim.
  final bool hot;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
    duration: const Duration(milliseconds: 220),
    height: height,
    color: Colors.black,
    alignment: Alignment.center,
    child: cue == null
        ? null
        : AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            child: Text(
              cue!,
              key: ValueKey(cue),
              style: TvType.credit(
                11,
                color: hot ? Tv.carmine : Tv.creditMuted,
                weight: FontWeight.w700,
              ),
            ),
          ),
  );
}

/// Linha de crédito tocável: o título em Bodoni itálico e uma linha de
/// crédito em caixa alta embaixo. É o "botão" do mundo novela.
class CreditLine extends StatelessWidget {
  const CreditLine({
    super.key,
    required this.title,
    this.credit,
    this.onTap,
    this.trailing,
    this.size = 26,
  });
  final String title;
  final String? credit;
  final VoidCallback? onTap;
  final Widget? trailing;
  final double size;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Semantics(
      button: true,
      enabled: enabled,
      child: InkWell(
        onTap: onTap,
        splashColor: Tv.carmine.withValues(alpha: 0.18),
        highlightColor: Tv.carmine.withValues(alpha: 0.08),
        child: Container(
          constraints: const BoxConstraints(minHeight: 56),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Tv.rule)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: TvType.name(
                        size,
                        color: enabled ? Tv.credit : Tv.creditMuted,
                      ),
                    ),
                    if (credit != null) ...[
                      const SizedBox(height: 4),
                      Text(credit!.toUpperCase(), style: TvType.credit(11)),
                    ],
                  ],
                ),
              ),
              ?trailing,
            ],
          ),
        ),
      ),
    );
  }
}

/// Crédito de "lower third": nome em itálico sobre o papel em caixa alta,
/// com um fio fino em cima. Usado para cada declaração na mesa.
class LowerThird extends StatelessWidget {
  const LowerThird({
    super.key,
    required this.name,
    required this.role,
    this.roleColor = Tv.creditDim,
    this.nameSize = 22,
  });
  final String name;
  final String role;
  final Color roleColor;
  final double nameSize;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(width: 40, height: 1, color: roleColor),
      const SizedBox(height: 6),
      Text(name, style: TvType.name(nameSize)),
      const SizedBox(height: 2),
      Text(
        role.toUpperCase(),
        style: TvType.credit(12, color: roleColor, weight: FontWeight.w700),
      ),
    ],
  );
}

/// Ação principal da tela: retângulo carmim, rótulo em caixa alta.
class CueButton extends StatelessWidget {
  const CueButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.quiet = false,
  });
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  /// Versão secundária: só o contorno em branco quente.
  final bool quiet;

  @override
  Widget build(BuildContext context) {
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
        Flexible(child: Text(label.toUpperCase(), maxLines: 1)),
      ],
    );
    return quiet
        ? OutlinedButton(onPressed: onPressed, child: child)
        : FilledButton(onPressed: onPressed, child: child);
  }
}

/// Moedas com movimento de ponteiro: o número corre até o valor novo com um
/// leve passo além e volta, nunca salta.
class BallisticCount extends StatelessWidget {
  const BallisticCount({super.key, required this.value, required this.style});
  final int value;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    return TweenAnimationBuilder<double>(
      tween: Tween(end: value.toDouble()),
      duration: reduce ? Duration.zero : const Duration(milliseconds: 650),
      curve: Curves.easeOutBack,
      builder: (context, v, _) => Text('${max(0, v.round())}', style: style),
    );
  }
}
