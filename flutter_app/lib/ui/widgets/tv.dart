import 'dart:math';

import 'package:flutter/material.dart';

import '../../engine/models.dart';
import '../theme.dart';

/// Peças do mundo "caixas de fósforo": capas com retrato, a lixa nas
/// bordas, letreiros em script dourado e os palitos da influência.

/// Onde fica o rosto de cada retrato (as artes têm uma faixa de pergaminho
/// embaixo, que o close sempre deixa de fora).
Alignment faceOf(Role r) => switch (r) {
  Role.duke => const Alignment(0.0, -0.62),
  Role.assassin => const Alignment(0.0, -0.55),
  Role.captain => const Alignment(-0.5, -0.66),
  Role.ambassador => const Alignment(0.0, -0.62),
  Role.contessa => const Alignment(0.04, -0.66),
};

/// Gradação de impressão de capa: tira saturação e esquenta, como tinta
/// em papel de caixinha, para todos os retratos parecerem da mesma gaveta.
const _grade = ColorFilter.matrix([
  0.90, 0.12, 0.02, 0, 8, //
  0.08, 0.82, 0.04, 0, 2, //
  0.04, 0.10, 0.70, 0, -4, //
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

/// A lixa da caixa de fósforo: faixa cinza com grão diagonal. Serve de
/// borda das capas e de faixa de deixa da fase.
class StrikerStrip extends StatelessWidget {
  const StrikerStrip({super.key, this.height = 8, this.color = Tv.striker});
  final double height;
  final Color color;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: height,
    width: double.infinity,
    child: CustomPaint(painter: _StrikerPainter(color)),
  );
}

class _StrikerPainter extends CustomPainter {
  _StrikerPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = color);
    final grain = Paint()
      ..color = Color.lerp(color, Colors.black, 0.22)!
      ..strokeWidth = 1;
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    for (var x = -size.height; x < size.width; x += 4) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        grain,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_StrikerPainter old) => old.color != color;
}

/// Faixa de lixa com a deixa da fase escrita nela, como o telefone do clube
/// na borda da caixinha. [hot] (desafio, bloqueio) vira a cabeça do palito.
class LetterboxBar extends StatelessWidget {
  const LetterboxBar({super.key, this.cue, this.height = 28, this.hot = false});

  /// Nome da deixa ("AÇÃO", "DESAFIO"...). Nunca só a cor carrega a fase.
  final String? cue;
  final double height;
  final bool hot;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: height,
    child: Stack(
      fit: StackFit.expand,
      children: [
        StrikerStrip(height: height, color: hot ? Tv.carmine : Tv.striker),
        if (cue != null)
          Center(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 120),
              child: Text(
                cue!,
                key: ValueKey(cue),
                style: TvType.credit(
                  11,
                  color: Tv.credit,
                  weight: FontWeight.w700,
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

/// Linha tocável: o nome em Archivo e uma linha em caixa alta embaixo.
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
      button: enabled,
      enabled: enabled,
      child: InkWell(
        onTap: onTap,
        splashColor: Tv.foil.withValues(alpha: 0.14),
        highlightColor: Tv.foil.withValues(alpha: 0.06),
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
                        size * 0.8,
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

/// Crédito sob um retrato: nome sobre o papel em caixa alta, com um fio em
/// cima. Usado para cada declaração na mesa.
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
      Container(width: 40, height: 2, color: roleColor),
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

/// Ação principal da tela: uma capa vinho com o rótulo em dourado e a lixa
/// na borda de baixo.
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

  /// Versão secundária: só o contorno da lixa, rótulo em papel.
  final bool quiet;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final fg = quiet
        ? (enabled ? Tv.credit : Tv.creditMuted)
        : (enabled ? Tv.foil : Tv.creditMuted);
    final label = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 20, color: fg),
          const SizedBox(width: 8),
        ],
        Flexible(
          child: Text(
            this.label.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TvType.credit(15, color: fg, weight: FontWeight.w700),
          ),
        ),
      ],
    );
    return Semantics(
      button: true,
      enabled: enabled,
      child: Material(
        color: quiet
            ? Colors.transparent
            : (enabled ? Tv.oxblood : Tv.stageHigh),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(3),
          side: quiet
              ? const BorderSide(color: Tv.striker, width: 1.5)
              : BorderSide.none,
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          splashColor: Tv.foil.withValues(alpha: 0.16),
          child: SizedBox(
            height: 56,
            child: Column(
              children: [
                Expanded(child: Center(child: label)),
                if (!quiet) const StrikerStrip(height: 6),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Um palito de fósforo: inteiro (influência viva) ou queimado (perdida).
/// [mark] escreve a inicial do papel no pé do palito quando ele é conhecido.
class MatchStick extends StatelessWidget {
  const MatchStick({
    super.key,
    this.burnt = false,
    this.height = 26,
    this.mark,
    this.markColor = Tv.credit,
  });
  final bool burnt;
  final double height;
  final String? mark;
  final Color markColor;

  @override
  Widget build(BuildContext context) {
    final stick = CustomPaint(painter: _MatchPainter(burnt: burnt));
    if (mark == null) {
      return SizedBox(width: height * 0.36, height: height, child: stick);
    }
    final markSize = (height * 0.32).clamp(9.0, 13.0);
    return SizedBox(
      width: max(height * 0.36, markSize),
      height: height,
      child: Column(
        children: [
          Expanded(
            child: SizedBox(width: height * 0.36, child: stick),
          ),
          Text(
            mark!,
            style: TvType.credit(
              markSize,
              color: markColor,
              weight: FontWeight.w700,
            ).copyWith(letterSpacing: 0, height: 1.1),
          ),
        ],
      ),
    );
  }
}

class _MatchPainter extends CustomPainter {
  _MatchPainter({required this.burnt});
  final bool burnt;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final stickW = w * 0.42;
    final cx = w / 2;
    final headH = h * 0.24;
    if (burnt) {
      // Queimado: só sobra metade, curvada e preta, com a cabeça em cinza.
      final path = Path()
        ..moveTo(cx - stickW / 2, h)
        ..lineTo(cx - stickW / 2, h * 0.55)
        ..quadraticBezierTo(cx - stickW / 2, h * 0.38, cx + stickW, h * 0.32)
        ..lineTo(cx + stickW, h * 0.32 + stickW)
        ..quadraticBezierTo(cx + stickW / 2, h * 0.45, cx + stickW / 2, h * 0.6)
        ..lineTo(cx + stickW / 2, h)
        ..close();
      canvas.drawPath(path, Paint()..color = Tv.char);
      canvas.drawPath(
        path,
        Paint()
          ..color = Tv.creditMuted
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1,
      );
      return;
    }
    canvas.drawRect(
      Rect.fromLTWH(cx - stickW / 2, headH * 0.6, stickW, h - headH * 0.6),
      Paint()..color = const Color(0xFFE8D3A8),
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 0, w, headH),
        Radius.circular(w / 2),
      ),
      Paint()..color = Tv.carmine,
    );
  }

  @override
  bool shouldRepaint(_MatchPainter old) => old.burnt != burnt;
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
