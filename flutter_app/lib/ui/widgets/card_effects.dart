import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/models.dart';
import '../theme.dart';

/// Posição de cada jogador na mesa, para as animações saírem de quem age e
/// chegarem em quem sofre a ação.
class SeatAnchors {
  final Map<String, GlobalKey> _keys = {};
  GlobalKey keyFor(String playerId) =>
      _keys.putIfAbsent(playerId, () => GlobalKey(debugLabel: playerId));

  Offset? centerOf(String? playerId, RenderBox overlay) {
    if (playerId == null) return null;
    final box = _keys[playerId]?.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return null;
    final global = box.localToGlobal(box.size.center(Offset.zero));
    return overlay.globalToLocal(global);
  }
}

enum EffectKind {
  income,
  foreignAid,
  tax,
  steal,
  assassinate,
  exchange,
  coup,
  blockContessa,
  blockDuke,
  blockCaptain,
  blockAmbassador,
}

const _durations = {
  EffectKind.income: 900,
  EffectKind.foreignAid: 1200,
  EffectKind.tax: 1600,
  EffectKind.steal: 1600,
  EffectKind.assassinate: 1500,
  EffectKind.exchange: 1700,
  EffectKind.coup: 1600,
  EffectKind.blockContessa: 1600,
  EffectKind.blockDuke: 1400,
  EffectKind.blockCaptain: 1400,
  EffectKind.blockAmbassador: 1400,
};

class _Effect {
  _Effect(this.kind, this.fromId, this.toId);
  final EffectKind kind;

  /// Quem age (ou quem bloqueia).
  final String fromId;

  /// Quem sofre a ação (ou quem teve a ação bloqueada).
  final String? toId;
}

/// Camada de efeitos da mesa. Cada personagem tem a sua animação, tocada
/// quando a ação resolve (Duque, Capitão, Assassino, Embaixador, Golpe) ou
/// quando alguém declara um bloqueio (Condessa, Duque, Capitão, Embaixador).
class CardEffectsLayer extends StatefulWidget {
  const CardEffectsLayer({
    super.key,
    required this.state,
    required this.myId,
    required this.anchors,
    required this.child,
  });

  final GameState state;
  final String myId;
  final SeatAnchors anchors;
  final Widget child;

  @override
  State<CardEffectsLayer> createState() => _CardEffectsLayerState();
}

class _CardEffectsLayerState extends State<CardEffectsLayer>
    with SingleTickerProviderStateMixin {
  late final _ctrl = AnimationController(vsync: this);
  final _overlayKey = GlobalKey();
  int? _seenResolved;
  String? _seenBlock;
  _Effect? _effect;

  @override
  void initState() {
    super.initState();
    // Não reapresenta o que já aconteceu antes de a tela abrir.
    _seenResolved = widget.state.lastResolved?.stamp;
    _seenBlock = _blockKey(widget.state);
    _ctrl.addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted) {
        setState(() => _effect = null);
      }
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  static String? _blockKey(GameState s) {
    final pb = s.pendingBlock;
    if (pb == null) return null;
    return '${s.turnIndex}-${s.currentAction?.type.wire}-${pb.blockerId}-${pb.role.name}';
  }

  @override
  void didUpdateWidget(CardEffectsLayer old) {
    super.didUpdateWidget(old);
    final s = widget.state;
    _Effect? next;

    final bk = _blockKey(s);
    if (bk != null && bk != _seenBlock) {
      final pb = s.pendingBlock!;
      next = _Effect(
        switch (pb.role) {
          Role.contessa => EffectKind.blockContessa,
          Role.duke => EffectKind.blockDuke,
          Role.captain => EffectKind.blockCaptain,
          _ => EffectKind.blockAmbassador,
        },
        pb.blockerId,
        s.currentAction?.source,
      );
    }
    _seenBlock = bk;

    final r = s.lastResolved;
    if (r != null && r.stamp != _seenResolved) {
      _seenResolved = r.stamp;
      // Ação bloqueada já teve o seu efeito no momento do bloqueio.
      final blocked = r.summary.startsWith('Bloqueio');
      final kind = switch (r.actionType) {
        'income' => EffectKind.income,
        'foreign_aid' => EffectKind.foreignAid,
        'tax' => EffectKind.tax,
        'steal' => EffectKind.steal,
        'assassinate' => EffectKind.assassinate,
        'exchange' => EffectKind.exchange,
        'coup' => EffectKind.coup,
        _ => null,
      };
      if (!blocked && kind != null) next = _Effect(kind, r.actorId, r.targetId);
    }

    if (next != null && !MediaQuery.of(context).disableAnimations) {
      _play(next);
    }
  }

  void _play(_Effect e) {
    final involvesMe = e.fromId == widget.myId || e.toId == widget.myId;
    if (involvesMe) {
      switch (e.kind) {
        case EffectKind.assassinate || EffectKind.coup:
          HapticFeedback.heavyImpact();
        case EffectKind.income || EffectKind.foreignAid || EffectKind.tax:
          HapticFeedback.selectionClick();
        default:
          HapticFeedback.mediumImpact();
      }
    }
    setState(() => _effect = e);
    _ctrl
      ..duration = Duration(milliseconds: _durations[e.kind]!)
      ..forward(from: 0);
  }

  Offset _shake() {
    final e = _effect;
    if (e == null) return Offset.zero;
    final t = _ctrl.value;
    double amp;
    switch (e.kind) {
      case EffectKind.coup:
        amp = t < 0.32 ? 0 : 10 * math.max(0, 1 - (t - 0.32) / 0.35);
      case EffectKind.assassinate:
        amp = t < 0.33 ? 0 : 4 * math.max(0, 1 - (t - 0.33) / 0.2);
      default:
        return Offset.zero;
    }
    return Offset(math.sin(t * 90) * amp, math.cos(t * 77) * amp * 0.6);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      key: _overlayKey,
      children: [
        AnimatedBuilder(
          animation: _ctrl,
          child: widget.child,
          builder: (_, child) =>
              Transform.translate(offset: _shake(), child: child),
        ),
        if (_effect != null)
          Positioned.fill(
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _ctrl,
                builder: (context, _) {
                  final box =
                      _overlayKey.currentContext?.findRenderObject()
                          as RenderBox?;
                  if (box == null || !box.hasSize) {
                    return const SizedBox.shrink();
                  }
                  final size = box.size;
                  final fallback = size.center(Offset.zero);
                  final e = _effect!;
                  final from =
                      widget.anchors.centerOf(e.fromId, box) ?? fallback;
                  final to = widget.anchors.centerOf(e.toId, box);
                  return CustomPaint(
                    painter: EffectPainter(
                      kind: e.kind,
                      t: _ctrl.value,
                      from: from,
                      to: to,
                    ),
                  );
                },
              ),
            ),
          ),
      ],
    );
  }
}

// ------------------------------------------------------------------ painter

// Os efeitos falam a mesma língua das artes das cartas: capa de caixa de
// fósforos impressa. Formas chapadas com contorno de tinta preta, uma
// sombra de registro deslocada e retícula de pontos no lugar de brilho.

const _gold = Color(0xFFF2C14E);
const _goldDeep = Color(0xFFB8862B);
const _blood = Color(0xFFE53935);
const _oxblood = Color(0xFF7A1F1F);
const _violet = Color(0xFFB39AD9);
const _steel = Color(0xFF8FB8D8);
const _parchment = Color(0xFFF2D68A);
const _ochre = Color(0xFF8C6F3D);
const _wax = Color(0xFF8C3B3B);
const _lilac = Color(0xFFDCD4E6);
const _rose = Color(0xFFE38FB3);
const _fire = Color(0xFFFF7A1A);

/// Deslocamento da sombra de registro.
const _misreg = Offset(2, 2.5);

/// Desenha um quadro de cada efeito. [t] vai de 0 a 1.
class EffectPainter extends CustomPainter {
  EffectPainter({
    required this.kind,
    required this.t,
    required this.from,
    this.to,
  });

  final EffectKind kind;
  final double t;
  final Offset from;
  final Offset? to;

  @override
  void paint(Canvas canvas, Size size) {
    switch (kind) {
      case EffectKind.income:
        _income(canvas);
      case EffectKind.foreignAid:
        _foreignAid(canvas, size);
      case EffectKind.tax:
        _tax(canvas, size);
      case EffectKind.steal:
        _steal(canvas);
      case EffectKind.assassinate:
        _assassinate(canvas, size);
      case EffectKind.exchange:
        _exchange(canvas, size);
      case EffectKind.coup:
        _coup(canvas, size);
      case EffectKind.blockContessa:
        _blockContessa(canvas);
      case EffectKind.blockDuke:
        _blockDuke(canvas);
      case EffectKind.blockCaptain:
        _blockCaptain(canvas);
      case EffectKind.blockAmbassador:
        _blockAmbassador(canvas);
    }
  }

  // ------------------------------------------------------------- helpers

  /// Progresso local de [t] dentro de [a, b], já limitado a 0..1.
  double _seg(double a, double b) => ((t - a) / (b - a)).clamp(0.0, 1.0);

  double _fadeOut(double from) =>
      t < from ? 1 : (1 - (t - from) / (1 - from)).clamp(0.0, 1.0);

  Offset _arc(Offset a, Offset b, double p, {double lift = 80}) {
    final mid = Offset.lerp(a, b, 0.5)! - Offset(0, lift);
    final q = 1 - p;
    return a * (q * q) + mid * (2 * q * p) + b * (p * p);
  }

  Paint _fill(Color color, double alpha) =>
      Paint()..color = color.withValues(alpha: alpha.clamp(0.0, 1.0));

  Paint _line(Color color, double width, double alpha) => Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = width
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round
    ..color = color.withValues(alpha: alpha.clamp(0.0, 1.0));

  /// Forma impressa: sombra de registro, cor chapada e contorno de tinta.
  void _print(
    Canvas c,
    Path path,
    Color color,
    double alpha, {
    double outline = 2.5,
  }) {
    if (alpha <= 0) return;
    c.drawPath(path.shift(_misreg), _fill(Tv.ink, 0.85 * alpha));
    c.drawPath(path, _fill(color, alpha));
    c.drawPath(path, _line(Tv.ink, outline, alpha));
  }

  /// Traço impresso: sombra, contorno de tinta e a cor por cima.
  void _printStroke(
    Canvas c,
    Path path,
    Color color,
    double width,
    double alpha,
  ) {
    if (alpha <= 0) return;
    c.drawPath(path.shift(_misreg), _line(Tv.ink, width + 3, 0.85 * alpha));
    c.drawPath(path, _line(Tv.ink, width + 3, alpha));
    c.drawPath(path, _line(color, width, alpha));
  }

  /// Retícula: pontos que encolhem do centro para fora, no lugar do brilho.
  void _dots(Canvas c, Offset at, double radius, Color color, double alpha) {
    if (alpha <= 0 || radius < 2) return;
    final step = math.max(6.0, radius / 14);
    final paint = _fill(color, alpha);
    final n = (radius / step).ceil();
    for (var j = -n; j <= n; j++) {
      for (var i = -n; i <= n; i++) {
        final o = Offset(i * step + (j.isOdd ? step / 2 : 0), j * step * 0.87);
        final d = o.distance / radius;
        if (d >= 1) continue;
        c.drawCircle(at + o, step * 0.5 * (1 - d), paint);
      }
    }
  }

  /// Anel com contorno de tinta.
  void _ring(
    Canvas c,
    Offset at,
    double radius,
    Color color,
    double width,
    double alpha,
  ) {
    if (alpha <= 0) return;
    c.drawCircle(at, radius, _line(Tv.ink, width + 3, alpha));
    c.drawCircle(at, radius, _line(color, width, alpha));
  }

  /// Escurece a mesa com tinta chapada.
  void _shade(Canvas c, Size s, double alpha) {
    if (alpha <= 0) return;
    c.drawRect(Offset.zero & s, _fill(Tv.ink, alpha));
  }

  /// Anel que se abre quando algo chega em [at]; invisível fora de 0 < p < 1.
  void _landing(Canvas c, Offset at, double p, Color color) {
    if (p <= 0 || p >= 1) return;
    _ring(c, at, 16 + 34 * Curves.easeOut.transform(p), color, 3, 1 - p);
  }

  void _coin(
    Canvas c,
    Offset at,
    double r, {
    double alpha = 1,
    double spin = 0,
  }) {
    if (alpha <= 0) return;
    // A moeda "gira" achatando no eixo X.
    final sx = math.cos(spin).abs().clamp(0.25, 1.0);
    c.save();
    c.translate(at.dx, at.dy);
    c.scale(sx, 1);
    c.drawCircle(_misreg, r, _fill(Tv.ink, 0.85 * alpha));
    c.drawCircle(Offset.zero, r, _fill(_goldDeep, alpha));
    c.drawCircle(Offset.zero, r * 0.8, _fill(_gold, alpha));
    c.drawCircle(Offset.zero, r * 0.55, _line(_goldDeep, r * 0.12, alpha));
    c.drawCircle(Offset.zero, r, _line(Tv.ink, 2, alpha));
    c.restore();
  }

  /// Estrela de quatro pontas (as da arte da Condessa).
  Path _star(Offset at, double r) {
    final p = Path();
    for (var i = 0; i < 8; i++) {
      final a = i * math.pi / 4 - math.pi / 2;
      final rr = i.isEven ? r : r * 0.32;
      final v = at + Offset(math.cos(a), math.sin(a)) * rr;
      i == 0 ? p.moveTo(v.dx, v.dy) : p.lineTo(v.dx, v.dy);
    }
    return p..close();
  }

  /// Losango (o motivo da faixa do Embaixador).
  Path _diamond(Offset at, double w, double h) => Path()
    ..moveTo(at.dx, at.dy - h / 2)
    ..lineTo(at.dx + w / 2, at.dy)
    ..lineTo(at.dx, at.dy + h / 2)
    ..lineTo(at.dx - w / 2, at.dy)
    ..close();

  // ------------------------------------------------------------- motifs

  /// Bolsa de moedas do Duque.
  void _purse(Canvas c, Offset at, double s, double alpha) {
    if (alpha <= 0 || s < 1) return;
    c.save();
    c.translate(at.dx, at.dy);
    final body = Path()
      ..moveTo(-0.12 * s, -0.22 * s)
      ..cubicTo(-0.46 * s, -0.04 * s, -0.42 * s, 0.38 * s, 0, 0.38 * s)
      ..cubicTo(0.42 * s, 0.38 * s, 0.46 * s, -0.04 * s, 0.12 * s, -0.22 * s)
      ..close();
    final ruffle = Path()
      ..moveTo(-0.12 * s, -0.22 * s)
      ..lineTo(-0.24 * s, -0.4 * s)
      ..lineTo(-0.07 * s, -0.33 * s)
      ..lineTo(0, -0.44 * s)
      ..lineTo(0.07 * s, -0.33 * s)
      ..lineTo(0.24 * s, -0.4 * s)
      ..lineTo(0.12 * s, -0.22 * s)
      ..close();
    _print(c, ruffle, _goldDeep, alpha);
    _print(c, body, _gold, alpha);
    final tie = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(0, -0.22 * s),
            width: 0.34 * s,
            height: 0.08 * s,
          ),
          Radius.circular(0.03 * s),
        ),
      );
    _print(c, tie, _oxblood, alpha, outline: 1.5);
    // Hachura de sombra no lado da bolsa.
    final hatch = _line(_goldDeep, 1.5, alpha);
    for (var i = 0; i < 4; i++) {
      final y = (0.02 + i * 0.08) * s;
      c.drawLine(Offset(0.16 * s, y), Offset(0.3 * s, y - 0.06 * s), hatch);
    }
    c.restore();
  }

  /// Âncora do Capitão, apontando para baixo quando [rotation] é 0.
  void _anchor(
    Canvas c,
    Offset at,
    double s,
    Color color,
    double alpha, {
    double rotation = 0,
  }) {
    if (alpha <= 0) return;
    c.save();
    c.translate(at.dx, at.dy);
    c.rotate(rotation);
    final w = math.max(2.5, s * 0.1);
    final path = Path()
      ..addOval(Rect.fromCircle(center: Offset(0, -0.4 * s), radius: 0.09 * s))
      ..moveTo(0, -0.31 * s)
      ..lineTo(0, 0.42 * s)
      ..moveTo(-0.2 * s, -0.2 * s)
      ..lineTo(0.2 * s, -0.2 * s)
      ..moveTo(-0.36 * s, 0.1 * s)
      ..quadraticBezierTo(-0.3 * s, 0.42 * s, 0, 0.42 * s)
      ..quadraticBezierTo(0.3 * s, 0.42 * s, 0.36 * s, 0.1 * s);
    _printStroke(c, path, color, w, alpha);
    // Unhas nas pontas dos braços.
    for (final side in [-1.0, 1.0]) {
      final fluke = Path()
        ..moveTo(side * 0.36 * s, 0.0)
        ..lineTo(side * 0.46 * s, 0.16 * s)
        ..lineTo(side * 0.26 * s, 0.14 * s)
        ..close();
      _print(c, fluke, color, alpha, outline: 2);
    }
    c.restore();
  }

  /// Carta lacrada do Embaixador.
  void _letter(Canvas c, Offset at, double s, double alpha) {
    if (alpha <= 0 || s < 1) return;
    final rect = Rect.fromCenter(center: at, width: s, height: s * 0.66);
    _print(c, Path()..addRect(rect), Tv.credit, alpha);
    final flap = Path()
      ..moveTo(rect.left, rect.top)
      ..lineTo(at.dx, at.dy + s * 0.05)
      ..lineTo(rect.right, rect.top);
    c.drawPath(flap, _line(Tv.ink, 2, alpha));
    _print(
      c,
      Path()..addOval(
        Rect.fromCircle(center: at + Offset(0, s * 0.05), radius: s * 0.13),
      ),
      _wax,
      alpha,
      outline: 1.5,
    );
  }

  /// Lua crescente da Condessa.
  void _moon(Canvas c, Offset at, double s, double alpha) {
    if (alpha <= 0 || s < 1) return;
    final moon = Path.combine(
      PathOperation.difference,
      Path()..addOval(Rect.fromCircle(center: at, radius: s * 0.45)),
      Path()..addOval(
        Rect.fromCircle(
          center: at + Offset(s * 0.2, -s * 0.1),
          radius: s * 0.38,
        ),
      ),
    );
    _print(c, moon, _lilac, alpha);
  }

  /// Adaga desenhada apontando para [angle] (radianos).
  void _dagger(
    Canvas c,
    Offset at,
    double angle,
    double len,
    Color color, {
    double alpha = 1,
  }) {
    c.save();
    c.translate(at.dx, at.dy);
    c.rotate(angle);
    final blade = Path()
      ..moveTo(len * 0.5, 0)
      ..lineTo(-len * 0.05, -len * 0.09)
      ..lineTo(-len * 0.05, len * 0.09)
      ..close();
    final guard = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(-len * 0.07, 0),
            width: len * 0.07,
            height: len * 0.34,
          ),
          const Radius.circular(2),
        ),
      );
    final grip = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(-len * 0.42, -len * 0.05, len * 0.33, len * 0.1),
          const Radius.circular(3),
        ),
      );
    final pommel = Path()
      ..addOval(
        Rect.fromCircle(center: Offset(-len * 0.45, 0), radius: len * 0.07),
      );
    _print(c, grip, const Color(0xFF3B2A4F), alpha, outline: 2);
    _print(c, blade, const Color(0xFFF3E9DF), alpha, outline: 2);
    // O fio da lâmina na cor do personagem.
    c.drawLine(
      Offset(len * 0.45, 0),
      Offset(-len * 0.02, 0),
      _line(color, 1.5, alpha),
    );
    _print(c, guard, color, alpha, outline: 2);
    _print(c, pommel, color, alpha, outline: 2);
    c.restore();
  }

  double get _pulse => math.sin(_seg(0, 1) * math.pi);

  // ------------------------------------------------------------- effects

  /// Renda: uma moeda salta de quem agiu.
  void _income(Canvas c) {
    final p = Curves.easeOut.transform(_seg(0, 0.7));
    _coin(
      c,
      from - Offset(0, 46 * p),
      11 + 3 * math.sin(p * math.pi),
      alpha: _fadeOut(0.55),
      spin: p * math.pi * 3,
    );
  }

  /// Ajuda Externa: duas moedas chegam de fora da mesa.
  void _foreignAid(Canvas c, Size s) {
    for (var i = 0; i < 2; i++) {
      final p = Curves.easeInOut.transform(_seg(i * 0.15, 0.7 + i * 0.15));
      if (p <= 0) continue;
      final start = Offset(i == 0 ? -20 : s.width + 20, s.height * 0.35);
      _coin(
        c,
        _arc(start, from, p, lift: 120),
        11,
        alpha: p >= 1 ? _fadeOut(0.85) : 1,
        spin: p * math.pi * 4,
      );
    }
    _landing(c, from, _seg(0.7, 1), _gold);
  }

  /// Duque (Taxa): o medalhão do Duque (raios dourados sobre vinho, como
  /// na carta) surge perto de quem cobrou, a caminho do centro, e três
  /// moedas jorram da bolsa para o tesouro dele. Fica fora do meio da
  /// tela para não tampar o rosto do close.
  void _tax(Canvas c, Size s) {
    final toward = Offset.lerp(
      from,
      Offset(s.width / 2, s.height * 0.42),
      0.4,
    )!;
    final center = Offset(
      toward.dx,
      toward.dy.clamp(80.0, math.max(80.0, s.height - 80)),
    );
    final appear = Curves.easeOutBack.transform(_seg(0, 0.25));
    final crestAlpha = _fadeOut(0.7);
    final r = 72 * appear;
    _dots(c, center, 140 * appear, _oxblood, 0.7 * crestAlpha);
    if (r > 1) {
      final disc = Path()..addOval(Rect.fromCircle(center: center, radius: r));
      _print(c, disc, _oxblood, crestAlpha, outline: 3);
      // Raios girando dentro do medalhão.
      c.save();
      c.clipPath(disc);
      final rays = _fill(_gold, 0.9 * crestAlpha);
      for (var i = 0; i < 12; i++) {
        final a = i * math.pi / 6 + t * 1.2;
        c.drawPath(
          Path()
            ..moveTo(center.dx, center.dy)
            ..lineTo(
              center.dx + math.cos(a - 0.09) * r,
              center.dy + math.sin(a - 0.09) * r,
            )
            ..lineTo(
              center.dx + math.cos(a + 0.09) * r,
              center.dy + math.sin(a + 0.09) * r,
            )
            ..close(),
          rays,
        );
      }
      c.restore();
      _ring(c, center, r * 0.42, _gold, 2, crestAlpha);
    }
    _purse(c, center, 62 * appear, crestAlpha);
    for (var i = 0; i < 3; i++) {
      final p = Curves.easeInCubic.transform(
        _seg(0.28 + i * 0.1, 0.75 + i * 0.1),
      );
      if (p <= 0) continue;
      final spread = Offset((i - 1) * 70.0, -30);
      final mid = center + spread;
      final pos = p < 0.3
          ? Offset.lerp(center, mid, p / 0.3)!
          : Offset.lerp(mid, from, (p - 0.3) / 0.7)!;
      _coin(c, pos, 12, alpha: p >= 1 ? 0 : 1, spin: p * 9 + i);
    }
    _landing(c, from, _seg(0.75, 1), _gold);
  }

  /// Capitão (Extorsão): a âncora é lançada até o alvo, presa por uma
  /// corrente de elos, e puxa duas moedas de volta para o Capitão.
  void _steal(Canvas c) {
    final target = to ?? from - const Offset(0, 160);
    final out = Curves.easeOutCubic.transform(_seg(0, 0.35));
    final back = Curves.easeInOutCubic.transform(_seg(0.45, 0.95));
    final anchorPos = back > 0
        ? _arc(target, from, back, lift: -40)
        : _arc(from, target, out, lift: 60);
    // Corrente: elos alternando de frente e de lado.
    final chainAlpha = _fadeOut(0.85);
    final dir = anchorPos - from;
    final dist = dir.distance;
    if (dist > 8) {
      final angle = math.atan2(dir.dy, dir.dx);
      final links = (dist / 11).floor();
      for (var i = 0; i < links; i++) {
        final pos = Offset.lerp(from, anchorPos, (i + 0.5) / links)!;
        c.save();
        c.translate(pos.dx, pos.dy);
        c.rotate(angle);
        final link = Rect.fromCenter(
          center: Offset.zero,
          width: 13,
          height: i.isEven ? 8 : 3,
        );
        c.drawOval(link, _line(Tv.ink, 4.5, chainAlpha));
        c.drawOval(link, _line(_steel, 2, chainAlpha));
        c.restore();
      }
    }
    final swing = math.sin(t * 18) * 0.3 * (1 - _seg(0.35, 0.45));
    _anchor(c, anchorPos, 38, _steel, _fadeOut(0.9), rotation: swing);
    // Impacto no alvo.
    final hit = _seg(0.33, 0.55);
    if (hit > 0 && hit < 1) {
      _dots(c, target, 30 + 30 * hit, _steel, 0.6 * (1 - hit));
    }
    _ring(c, target, 14 + 34 * hit, _steel, 3, hit > 0 ? 1 - hit : 0);
    // Moedas arrancadas do alvo.
    for (var i = 0; i < 2; i++) {
      final p = Curves.easeInOutCubic.transform(_seg(0.47 + i * 0.06, 0.95));
      if (p <= 0 || p >= 1) continue;
      final jitter = Offset(i == 0 ? -14 : 14, 6);
      _coin(
        c,
        _arc(target + jitter, from + jitter, p, lift: -40),
        10,
        spin: p * 10 + i,
      );
    }
    _landing(c, from, _seg(0.92, 1), _gold);
  }

  /// Assassino: a mesa escurece, a adaga cruza até a vítima e deixa dois
  /// cortes em X violeta (os da carta). O vermelho só aparece no golpe.
  void _assassinate(Canvas c, Size s) {
    final target = to ?? from - const Offset(0, 160);
    _shade(c, s, 0.6 * _pulse);
    final fly = Curves.easeInExpo.transform(_seg(0.08, 0.33));
    final dir = target - from;
    final angle = math.atan2(dir.dy, dir.dx);
    if (fly < 1) {
      // Rastro em retícula.
      for (var i = 1; i <= 6; i++) {
        final p = (fly - i * 0.04).clamp(0.0, 1.0);
        _dots(c, Offset.lerp(from, target, p)!, 12, _violet, 0.7 * (1 - i / 7));
      }
      _dagger(c, Offset.lerp(from, target, fly)!, angle, 56, _violet);
    }
    final hit = _seg(0.33, 1);
    if (hit > 0) {
      // O golpe: um estouro vermelho curto que vira retícula violeta.
      final strike = _seg(0.33, 0.5);
      if (strike < 1) {
        _dots(
          c,
          target,
          50 + 50 * Curves.easeOut.transform(strike),
          _blood,
          0.9 * (1 - strike),
        );
      }
      _dots(
        c,
        target,
        90 * Curves.easeOut.transform(hit),
        _violet,
        0.45 * (1 - hit),
      );
      final alpha = 1 - _seg(0.6, 1);
      final draw1 = _seg(0.33, 0.45);
      final draw2 = _seg(0.42, 0.54);
      const len = 46.0;
      final a1 = target + const Offset(-len, -len);
      final b1 = target + const Offset(len, len);
      final a2 = target + const Offset(len, -len);
      final b2 = target + const Offset(-len, len);
      final core = _line(_blood, 2, 1 - strike);
      for (final (a, b, d) in [(a1, b1, draw1), (a2, b2, draw2)]) {
        if (d <= 0) continue;
        final cut = Path()
          ..moveTo(a.dx, a.dy)
          ..lineTo(Offset.lerp(a, b, d)!.dx, Offset.lerp(a, b, d)!.dy);
        _printStroke(c, cut, _violet, 6, alpha);
        if (strike < 1) c.drawPath(cut, core);
      }
    }
  }

  /// Embaixador: quatro cartas saem de quem trocou, giram em leque como num
  /// embaralhar e voltam para a mão, em volta da carta lacrada. O leque
  /// abre para o lado de dentro da tela (para baixo nos assentos do topo).
  void _exchange(Canvas c, Size s) {
    final side = from.dy < s.height / 2 ? 1.0 : -1.0;
    final open = Curves.easeOutBack.transform(_seg(0, 0.3));
    final close = Curves.easeInBack.transform(_seg(0.72, 1));
    final k = (open * (1 - close)).clamp(0.0, 1.5);
    final radius = 70 * k;
    final center = from + Offset(0, 70 * k * side);
    _dots(c, center, 110 * k, _parchment, 0.45);
    for (var i = 0; i < 4; i++) {
      // As cartas trocam de lugar girando em volta do centro.
      final base = side * math.pi / 2 + (i - 1.5) * 0.55;
      final orbit = _seg(0.3, 0.72) * math.pi * 2 * (i.isEven ? 1 : -1) * 0.5;
      final a = base + orbit;
      final pos = center + Offset(math.cos(a), math.sin(a)) * radius;
      c.save();
      c.translate(pos.dx, pos.dy);
      c.rotate(a + math.pi / 2);
      final rect = RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset.zero, width: 30, height: 44),
        const Radius.circular(3),
      );
      _print(c, Path()..addRRect(rect), _ochre, 1);
      c.drawRRect(rect.deflate(4), _line(_parchment, 1.2, 1));
      c.drawPath(_diamond(Offset.zero, 12, 18), _fill(_parchment, 1));
      c.restore();
    }
    _letter(c, center, 40 * k, 1);
  }

  /// Golpe: uma bola de fogo cai sobre o alvo; ondas de choque e a mesa
  /// treme.
  void _coup(Canvas c, Size s) {
    final target = to ?? from - const Offset(0, 160);
    final fly = Curves.easeInQuad.transform(_seg(0, 0.32));
    if (fly < 1) {
      final pos = _arc(from, target, fly, lift: 160);
      for (var i = 1; i <= 8; i++) {
        final p = (fly - i * 0.03).clamp(0.0, 1.0);
        _dots(
          c,
          _arc(from, target, p, lift: 160),
          18 - i.toDouble(),
          _fire,
          0.8 * (1 - i / 9),
        );
      }
      _print(
        c,
        Path()..addOval(Rect.fromCircle(center: pos, radius: 18)),
        _fire,
        1,
        outline: 3,
      );
      c.drawCircle(pos - const Offset(3, 3), 8, _fill(Tv.credit, 1));
    }
    final hit = _seg(0.32, 1);
    if (hit > 0) {
      // Clarão chapado na mesa toda.
      c.drawRect(Offset.zero & s, _fill(_fire, 0.3 * (1 - _seg(0.32, 0.5))));
      _dots(
        c,
        target,
        130 * Curves.easeOut.transform(hit),
        _fire,
        0.85 * (1 - hit),
      );
      for (var i = 0; i < 3; i++) {
        final w = _seg(0.32 + i * 0.08, 0.9 + i * 0.03);
        _ring(
          c,
          target,
          20 + 140 * Curves.easeOut.transform(w),
          i == 0 ? Tv.credit : _fire,
          5 - i.toDouble(),
          w > 0 ? (1 - w) : 0,
        );
      }
      // Faíscas.
      final rnd = math.Random(7);
      final p = Curves.easeOut.transform(_seg(0.32, 0.85));
      for (var i = 0; i < 16; i++) {
        final a = rnd.nextDouble() * math.pi * 2;
        final speed = 60 + rnd.nextDouble() * 90;
        final u = Offset(math.cos(a), math.sin(a));
        final p0 = target + u * speed * p;
        final p1 = target + u * speed * math.max(0, p - 0.12);
        c.drawLine(p1, p0, _line(Tv.ink, 6, 1 - p));
        c.drawLine(p1, p0, _line(i.isEven ? _fire : _gold, 3, 1 - p));
      }
    }
  }

  /// Condessa: a lua dela se ergue com uma redoma lilás e estrelas rosa
  /// girando, e a adaga do Assassino se parte ao bater no escudo.
  void _blockContessa(Canvas c) {
    final rise = Curves.easeOutBack.transform(_seg(0, 0.3));
    final alpha = _fadeOut(0.75);
    final r = 56 * rise;
    _dots(c, from, r * 1.6, _rose, 0.5 * alpha);
    c.drawCircle(from, math.max(0, r), _fill(_lilac, 0.16 * alpha));
    _ring(c, from, r, _lilac, 2.5, 0.9 * alpha);
    // Estrelas girando.
    for (var i = 0; i < 6; i++) {
      final a = i * math.pi / 3 + t * 4;
      final pos = from + Offset(math.cos(a), math.sin(a)) * (r + 12);
      _print(c, _star(pos, 8 * rise), _rose, alpha, outline: 1.5);
    }
    _moon(c, from, 40 * rise, alpha);
    // A adaga vem de quem tentou assassinar e quebra no escudo.
    final attacker = to;
    if (attacker != null) {
      final dir = from - attacker;
      final dist = dir.distance;
      if (dist > r + 10) {
        final stop = from - dir / dist * (r + 8);
        final fly = Curves.easeInCubic.transform(_seg(0.15, 0.42));
        final angle = math.atan2(dir.dy, dir.dx);
        if (fly < 1 && fly > 0) {
          _dagger(c, Offset.lerp(attacker, stop, fly)!, angle, 44, _violet);
        }
        final shatter = _seg(0.42, 0.8);
        if (shatter > 0 && shatter < 1) {
          for (var i = 0; i < 7; i++) {
            final a = angle + math.pi + (i - 3) * 0.35;
            final pos = stop + Offset(math.cos(a), math.sin(a)) * 50 * shatter;
            c.save();
            c.translate(pos.dx, pos.dy);
            c.rotate(a + shatter * 6);
            _print(
              c,
              Path()
                ..moveTo(0, -5)
                ..lineTo(6, 4)
                ..lineTo(-5, 4)
                ..close(),
              _violet,
              1 - shatter,
              outline: 1.5,
            );
            c.restore();
          }
          _ring(c, stop, 6 + 20 * shatter, Tv.credit, 2, 1 - shatter);
        }
      }
    }
  }

  /// Duque bloqueando Ajuda Externa: uma barreira vinho de borda dourada
  /// com a bolsa no meio repele as moedas.
  void _blockDuke(Canvas c) {
    final rise = Curves.easeOutBack.transform(_seg(0, 0.3));
    final alpha = _fadeOut(0.7);
    _dots(c, from, 100 * rise, _oxblood, 0.6 * alpha);
    Path hex(double radius) {
      final path = Path();
      for (var i = 0; i < 6; i++) {
        final a = i * math.pi / 3 - math.pi / 2;
        final p = from + Offset(math.cos(a), math.sin(a)) * radius;
        i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
      }
      return path..close();
    }

    if (rise > 0.02) {
      _print(c, hex(54 * rise), _oxblood, 0.9 * alpha, outline: 3);
      c.drawPath(hex(46 * rise), _line(_gold, 2.5, alpha));
    }
    _purse(c, from, 34 * rise, alpha);
    // Moedas que batem e voltam.
    for (var i = 0; i < 2; i++) {
      final p = _seg(0.2 + i * 0.1, 0.9);
      if (p <= 0 || p >= 1) continue;
      final side = i == 0 ? -1.0 : 1.0;
      final start = from + Offset(side * 120, -90);
      final wall = from + Offset(side * 50, -30);
      final pos = p < 0.45
          ? Offset.lerp(start, wall, p / 0.45)!
          : Offset.lerp(
              wall,
              wall + Offset(side * 70, -60),
              (p - 0.45) / 0.55,
            )!;
      _coin(c, pos, 9, alpha: 1 - _seg(0.7, 0.9), spin: p * 12);
    }
  }

  /// Capitão bloqueando: a âncora crava no chão diante dele e ondas azuis
  /// empurram o ladrão.
  void _blockCaptain(Canvas c) {
    final drop = Curves.bounceOut.transform(_seg(0, 0.4));
    final alpha = _fadeOut(0.7);
    final pos = from - Offset(0, 90 * (1 - drop));
    final splash = _seg(0.3, 0.8);
    if (splash > 0 && splash < 1) {
      _dots(c, from, 30 + 50 * splash, _steel, 0.5 * (1 - splash) * alpha);
    }
    for (var i = 0; i < 2; i++) {
      final w = (splash - i * 0.15).clamp(0.0, 1.0);
      _ring(c, from, 20 + 60 * w, _steel, 3, w > 0 ? (1 - w) * alpha : 0);
    }
    _anchor(c, pos, 50, _steel, alpha);
  }

  /// Embaixador bloqueando: o lacre diplomático desce carimbando o veto.
  void _blockAmbassador(Canvas c) {
    final stamp = Curves.easeInCubic.transform(_seg(0, 0.3));
    final alpha = _fadeOut(0.7);
    final scale = 2.6 - 1.6 * stamp;
    final r = 30 * scale;
    // Lacre de cera: borda ondulada, como cera esmagada.
    final wax = Path();
    for (var i = 0; i <= 24; i++) {
      final a = i * math.pi * 2 / 24;
      final rr = r * (i.isEven ? 1.0 : 0.92);
      final v = from + Offset(math.cos(a), math.sin(a)) * rr;
      i == 0 ? wax.moveTo(v.dx, v.dy) : wax.lineTo(v.dx, v.dy);
    }
    wax.close();
    _print(c, wax, _wax, 0.95 * alpha, outline: 3);
    c.drawCircle(from, r * 0.72, _line(_parchment, 1.8, alpha));
    _print(
      c,
      _diamond(from, r * 0.62, r * 0.9),
      _parchment,
      alpha,
      outline: 1.5,
    );
    final dust = _seg(0.3, 0.7);
    if (dust > 0 && dust < 1) {
      _dots(c, from, r + 34 * dust, _parchment, 0.5 * (1 - dust) * alpha);
    }
    _ring(
      c,
      from,
      r + 30 * dust,
      _parchment,
      2,
      dust > 0 ? (1 - dust) * alpha : 0,
    );
  }

  @override
  bool shouldRepaint(EffectPainter old) =>
      old.t != t || old.kind != kind || old.from != from || old.to != to;
}
