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
  Role.captain => const Alignment(0.0, -0.6),
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
          // em cena, para o close ficar no rosto e não no corpo.
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

/// Um palito em close, aceso pela [progress] da cena (0 a 1): risca e
/// pega fogo, a chama come a madeira de cima para baixo, apaga e sobe um
/// fio de fumaça. Desenhado como as cartas: cor chapada e contorno de tinta.
class BurningMatch extends StatelessWidget {
  const BurningMatch({super.key, required this.progress, this.height = 140});
  final double progress;
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: height * 0.42,
    height: height,
    child: CustomPaint(painter: _BurningMatchPainter(progress)),
  );
}

class _BurningMatchPainter extends CustomPainter {
  _BurningMatchPainter(this.t);
  final double t;

  static const _wood = Color(0xFFE8D3A8);
  static const _flameOuter = Color(0xFFFF7A1A);
  static const _flameInner = Color(0xFFFFD27A);
  static const _smoke = Color(0xFF8A8079);

  double _seg(double a, double b) => ((t - a) / (b - a)).clamp(0.0, 1.0);

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;
    final stickW = w * 0.2;
    final top = h * 0.34; // onde começa o palito (acima fica a chama)
    final headH = stickW * 1.5;
    final ink = Paint()
      ..color = Tv.ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeJoin = StrokeJoin.round;

    // Quanto da madeira já virou carvão (de cima para baixo).
    final burn = Curves.easeIn.transform(_seg(0.12, 0.78)) * 0.62;
    final out = _seg(0.76, 0.82); // apagando
    final charLine = top + headH + (h - top - headH) * burn;

    // Madeira.
    final stick = Rect.fromLTRB(
      cx - stickW / 2,
      top + headH * 0.5,
      cx + stickW / 2,
      h,
    );
    canvas.drawRect(
      stick.shift(const Offset(2, 2.5)),
      Paint()..color = Tv.ink.withValues(alpha: 0.85),
    );
    canvas.drawRect(stick, Paint()..color = _wood);
    // Carvão: a parte queimada, preta e um pouco mais fina, curvando.
    if (burn > 0) {
      final charPath = Path()
        ..moveTo(cx - stickW * 0.42, top + headH * 0.5)
        ..lineTo(cx + stickW * 0.42, top + headH * 0.5)
        ..lineTo(cx + stickW / 2, charLine)
        ..lineTo(cx - stickW / 2, charLine)
        ..close();
      canvas.drawPath(charPath, Paint()..color = Tv.char);
      // Brasa na fronteira, enquanto ainda queima.
      if (out < 1) {
        canvas.drawRect(
          Rect.fromLTWH(cx - stickW / 2, charLine - 3, stickW, 4),
          Paint()..color = _flameOuter.withValues(alpha: 1 - out),
        );
      }
    }
    canvas.drawRect(stick, ink);

    // Cabeça: vermelha antes de acender, preta depois.
    final head = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(cx, top + headH * 0.5),
        width: stickW * 1.5,
        height: headH,
      ),
      Radius.circular(stickW),
    );
    final lit = _seg(0.02, 0.08);
    canvas.drawRRect(
      head,
      Paint()..color = Color.lerp(Tv.carmine, Tv.char, lit)!,
    );
    canvas.drawRRect(head, ink);

    // Chama: surge, encorpa, encolhe com a madeira e some.
    final grow = Curves.easeOutBack.transform(_seg(0.03, 0.14));
    final fade = 1 - _seg(0.6, 0.8);
    final flameH = h * 0.32 * grow * (0.55 + 0.45 * fade);
    if (flameH > 1 && out < 1) {
      final flicker = sin(t * 70) * 0.08 + sin(t * 113) * 0.05;
      final base = Offset(
        cx,
        max(top + headH * 0.3, charLine - (h - top) * 0.05),
      );
      Path tear(double fw, double fh, double lean) => Path()
        ..moveTo(base.dx - fw / 2, base.dy)
        ..quadraticBezierTo(
          base.dx - fw * 0.65,
          base.dy - fh * 0.45,
          base.dx + lean,
          base.dy - fh,
        )
        ..quadraticBezierTo(
          base.dx + fw * 0.65,
          base.dy - fh * 0.45,
          base.dx + fw / 2,
          base.dy,
        )
        ..quadraticBezierTo(
          base.dx,
          base.dy + fw * 0.35,
          base.dx - fw / 2,
          base.dy,
        )
        ..close();
      final fw = stickW * 2.1 * (0.6 + 0.4 * grow);
      final outer = tear(fw, flameH * (1 + flicker), fw * flicker * 2);
      canvas.drawPath(
        outer.shift(const Offset(2, 2.5)),
        Paint()..color = Tv.ink.withValues(alpha: 0.6 * (1 - out)),
      );
      canvas.drawPath(
        outer,
        Paint()..color = _flameOuter.withValues(alpha: 1 - out),
      );
      canvas.drawPath(
        tear(fw * 0.5, flameH * 0.55, fw * flicker),
        Paint()..color = _flameInner.withValues(alpha: 1 - out),
      );
      canvas.drawPath(outer, ink..color = Tv.ink.withValues(alpha: 1 - out));
    }

    // Fumaça: um fio que sobe ondulando depois de apagar.
    final smoke = _seg(0.8, 1.0);
    if (smoke > 0) {
      final from = Offset(cx, charLine - 4);
      final path = Path()..moveTo(from.dx, from.dy);
      const steps = 14;
      for (var i = 1; i <= steps; i++) {
        final k = i / steps;
        final y = from.dy - k * h * 0.6 * Curves.easeOut.transform(smoke);
        final x = from.dx + sin(k * 7 + t * 9) * w * 0.18 * k;
        path.lineTo(x, y);
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = _smoke.withValues(alpha: 0.9 * (1 - smoke * 0.7))
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  @override
  bool shouldRepaint(_BurningMatchPainter old) => old.t != t;
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
