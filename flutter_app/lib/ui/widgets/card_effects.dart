import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/models.dart';

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

const _gold = Color(0xFFF2C14E);
const _goldDeep = Color(0xFFB8862B);
const _blood = Color(0xFFE53935);

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
        _exchange(canvas);
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
    c.drawCircle(
      Offset.zero,
      r * 1.8,
      Paint()
        ..color = _gold.withValues(alpha: 0.25 * alpha)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
    c.drawCircle(
      Offset.zero,
      r,
      Paint()..color = _goldDeep.withValues(alpha: alpha),
    );
    c.drawCircle(
      Offset.zero,
      r * 0.8,
      Paint()..color = _gold.withValues(alpha: alpha),
    );
    c.drawCircle(
      Offset.zero,
      r * 0.55,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.12
        ..color = _goldDeep.withValues(alpha: alpha),
    );
    c.restore();
  }

  void _icon(
    Canvas c,
    IconData icon,
    Offset at,
    double size,
    Color color, {
    double rotation = 0,
    double alpha = 1,
    bool glow = true,
  }) {
    if (alpha <= 0) return;
    final tp = TextPainter(
      text: TextSpan(
        text: String.fromCharCode(icon.codePoint),
        style: TextStyle(
          fontFamily: icon.fontFamily,
          package: icon.fontPackage,
          fontSize: size,
          color: color.withValues(alpha: alpha),
          shadows: glow
              ? [
                  Shadow(
                    color: color.withValues(alpha: 0.8 * alpha),
                    blurRadius: 16,
                  ),
                ]
              : null,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    c.save();
    c.translate(at.dx, at.dy);
    c.rotate(rotation);
    tp.paint(c, Offset(-tp.width / 2, -tp.height / 2));
    c.restore();
  }

  void _ring(
    Canvas c,
    Offset at,
    double radius,
    Color color,
    double width,
    double alpha,
  ) {
    if (alpha <= 0) return;
    c.drawCircle(
      at,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = width
        ..color = color.withValues(alpha: alpha),
    );
  }

  void _glow(Canvas c, Offset at, double radius, Color color, double alpha) {
    if (alpha <= 0) return;
    c.drawCircle(
      at,
      radius,
      Paint()
        ..shader = RadialGradient(
          colors: [
            color.withValues(alpha: alpha),
            color.withValues(alpha: 0),
          ],
        ).createShader(Rect.fromCircle(center: at, radius: radius)),
    );
  }

  void _vignette(Canvas c, Size s, Color color, double alpha) {
    if (alpha <= 0) return;
    final rect = Offset.zero & s;
    c.drawRect(
      rect,
      Paint()
        ..shader = RadialGradient(
          radius: 0.9,
          colors: [
            Colors.transparent,
            color.withValues(alpha: alpha),
          ],
        ).createShader(rect),
    );
  }

  /// Anel que se abre quando algo chega em [at]; invisível fora de 0 < p < 1.
  void _landing(Canvas c, Offset at, double p, Color color) {
    if (p <= 0 || p >= 1) return;
    _ring(c, at, 16 + 34 * Curves.easeOut.transform(p), color, 3, 1 - p);
  }

  /// Adaga desenhada apontando para [angle] (radianos).
  void _dagger(Canvas c, Offset at, double angle, double len, Color color) {
    c.save();
    c.translate(at.dx, at.dy);
    c.rotate(angle);
    final blade = Path()
      ..moveTo(len * 0.5, 0)
      ..lineTo(-len * 0.05, -len * 0.09)
      ..lineTo(-len * 0.05, len * 0.09)
      ..close();
    c.drawPath(
      blade,
      Paint()
        ..color = color.withValues(alpha: 0.5)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
    );
    c.drawPath(
      blade,
      Paint()
        ..shader =
            const LinearGradient(colors: [Color(0xFF9E9E9E), Color(0xFFF5F5F5)])
                .createShader(
                  Rect.fromLTWH(-len * 0.05, -len * 0.1, len * 0.55, len * 0.2),
                ),
    );
    // Guarda e cabo.
    c.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(-len * 0.07, 0),
          width: len * 0.06,
          height: len * 0.32,
        ),
        const Radius.circular(2),
      ),
      Paint()..color = color,
    );
    c.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(-len * 0.42, -len * 0.05, len * 0.33, len * 0.1),
        const Radius.circular(3),
      ),
      Paint()..color = const Color(0xFF3B2A4F),
    );
    c.drawCircle(Offset(-len * 0.45, 0), len * 0.06, Paint()..color = color);
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

  /// Duque (Taxa): o brasão do Duque brilha no centro e três moedas
  /// jorram dele para o tesouro de quem cobrou.
  void _tax(Canvas c, Size s) {
    final center = Offset(s.width / 2, s.height * 0.42);
    final appear = Curves.easeOutBack.transform(_seg(0, 0.25));
    final crestAlpha = _fadeOut(0.7);
    _glow(c, center, 140 * appear, const Color(0xFF7A1F1F), 0.55 * crestAlpha);
    _glow(c, center, 70 * appear, _gold, 0.35 * crestAlpha);
    // Raios de luz girando atrás do brasão.
    final rays = Paint()..color = _gold.withValues(alpha: 0.18 * crestAlpha);
    for (var i = 0; i < 10; i++) {
      final a = i * math.pi / 5 + t * 1.2;
      final path = Path()
        ..moveTo(center.dx, center.dy)
        ..lineTo(
          center.dx + math.cos(a - 0.08) * 120 * appear,
          center.dy + math.sin(a - 0.08) * 120 * appear,
        )
        ..lineTo(
          center.dx + math.cos(a + 0.08) * 120 * appear,
          center.dy + math.sin(a + 0.08) * 120 * appear,
        )
        ..close();
      c.drawPath(path, rays);
    }
    _icon(
      c,
      Icons.account_balance,
      center,
      58 * appear,
      _gold,
      alpha: crestAlpha,
    );
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

  /// Capitão (Extorsão): a âncora é lançada até o alvo, prende e puxa duas
  /// moedas de volta para o Capitão.
  void _steal(Canvas c) {
    final target = to ?? from - const Offset(0, 160);
    const blue = Color(0xFF8FB8D8);
    final out = Curves.easeOutCubic.transform(_seg(0, 0.35));
    final back = Curves.easeInOutCubic.transform(_seg(0.45, 0.95));
    final anchorPos = back > 0
        ? _arc(target, from, back, lift: -40)
        : _arc(from, target, out, lift: 60);
    // Corrente entre o Capitão e a âncora.
    final chain = Paint()
      ..color = blue.withValues(alpha: 0.6 * _fadeOut(0.85))
      ..strokeWidth = 2;
    const links = 14;
    for (var i = 0; i < links; i++) {
      if (i.isOdd) continue;
      final a = Offset.lerp(from, anchorPos, i / links)!;
      final b = Offset.lerp(from, anchorPos, (i + 1) / links)!;
      c.drawLine(a, b, chain);
    }
    final swing = math.sin(t * 18) * 0.3 * (1 - _seg(0.35, 0.45));
    _icon(
      c,
      Icons.anchor,
      anchorPos,
      34,
      blue,
      rotation: swing,
      alpha: _fadeOut(0.9),
    );
    // Impacto no alvo.
    final hit = _seg(0.33, 0.55);
    _ring(c, target, 14 + 34 * hit, blue, 3, hit > 0 ? 1 - hit : 0);
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

  /// Assassino: a tela escurece, a adaga cruza a mesa até a vítima e deixa
  /// dois cortes em X com um clarão de sangue.
  void _assassinate(Canvas c, Size s) {
    final target = to ?? from - const Offset(0, 160);
    const purple = Color(0xFFB39AD9);
    _vignette(c, s, Colors.black, 0.75 * _pulse);
    final fly = Curves.easeInExpo.transform(_seg(0.08, 0.33));
    final dir = target - from;
    final angle = math.atan2(dir.dy, dir.dx);
    if (fly < 1) {
      // Rastro.
      for (var i = 1; i <= 6; i++) {
        final p = (fly - i * 0.04).clamp(0.0, 1.0);
        _glow(c, Offset.lerp(from, target, p)!, 10, purple, 0.35 * (1 - i / 7));
      }
      _dagger(c, Offset.lerp(from, target, fly)!, angle, 56, purple);
    }
    final hit = _seg(0.33, 1);
    if (hit > 0) {
      _glow(
        c,
        target,
        90 * Curves.easeOut.transform(hit),
        _blood,
        0.6 * (1 - hit),
      );
      final slash = Paint()
        ..color = _blood.withValues(alpha: (1 - _seg(0.6, 1)))
        ..strokeWidth = 5
        ..strokeCap = StrokeCap.round;
      final draw1 = _seg(0.33, 0.45);
      final draw2 = _seg(0.42, 0.54);
      const len = 46.0;
      final a1 = target + const Offset(-len, -len);
      final b1 = target + const Offset(len, len);
      final a2 = target + const Offset(len, -len);
      final b2 = target + const Offset(-len, len);
      if (draw1 > 0) c.drawLine(a1, Offset.lerp(a1, b1, draw1)!, slash);
      if (draw2 > 0) c.drawLine(a2, Offset.lerp(a2, b2, draw2)!, slash);
    }
  }

  /// Embaixador: quatro cartas saem de quem trocou, giram em leque como num
  /// embaralhar e voltam para a mão.
  void _exchange(Canvas c) {
    const gold = Color(0xFFF2D68A);
    final open = Curves.easeOutBack.transform(_seg(0, 0.3));
    final close = Curves.easeInBack.transform(_seg(0.72, 1));
    final radius = 70 * open * (1 - close);
    final center = from - Offset(0, 70 * open * (1 - close));
    _glow(c, center, 110 * open * (1 - close), gold, 0.3);
    for (var i = 0; i < 4; i++) {
      // As cartas trocam de lugar girando em volta do centro.
      final base = -math.pi / 2 + (i - 1.5) * 0.55;
      final orbit = _seg(0.3, 0.72) * math.pi * 2 * (i.isEven ? 1 : -1) * 0.5;
      final a = base + orbit;
      final pos = center + Offset(math.cos(a), math.sin(a)) * radius;
      c.save();
      c.translate(pos.dx, pos.dy);
      c.rotate(a + math.pi / 2);
      final rect = RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset.zero, width: 30, height: 44),
        const Radius.circular(4),
      );
      c.drawRRect(
        rect,
        Paint()
          ..shader = const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF8C6F3D), Color(0xFF4A3A1E)],
          ).createShader(rect.outerRect),
      );
      c.drawRRect(
        rect,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5
          ..color = gold,
      );
      c.restore();
    }
    _icon(c, Icons.swap_horiz, center, 30 * open * (1 - close), gold);
  }

  /// Golpe: uma bola de fogo cai sobre o alvo; ondas de choque e a mesa
  /// treme.
  void _coup(Canvas c, Size s) {
    final target = to ?? from - const Offset(0, 160);
    const fire = Color(0xFFFF7A1A);
    final fly = Curves.easeInQuad.transform(_seg(0, 0.32));
    if (fly < 1) {
      final pos = _arc(from, target, fly, lift: 160);
      for (var i = 1; i <= 8; i++) {
        final p = (fly - i * 0.03).clamp(0.0, 1.0);
        _glow(
          c,
          _arc(from, target, p, lift: 160),
          14 - i.toDouble(),
          fire,
          0.5 * (1 - i / 9),
        );
      }
      _glow(c, pos, 34, fire, 0.9);
      _glow(c, pos, 14, Colors.white, 0.9);
    }
    final hit = _seg(0.32, 1);
    if (hit > 0) {
      // Clarão na mesa toda.
      c.drawRect(
        Offset.zero & s,
        Paint()..color = fire.withValues(alpha: 0.35 * (1 - _seg(0.32, 0.5))),
      );
      _glow(
        c,
        target,
        120 * Curves.easeOut.transform(hit),
        fire,
        0.7 * (1 - hit),
      );
      for (var i = 0; i < 3; i++) {
        final w = _seg(0.32 + i * 0.08, 0.9 + i * 0.03);
        _ring(
          c,
          target,
          20 + 140 * Curves.easeOut.transform(w),
          i == 0 ? Colors.white : fire,
          5 - i.toDouble(),
          w > 0 ? (1 - w) : 0,
        );
      }
      // Faíscas.
      final rnd = math.Random(7);
      final spark = Paint()..strokeCap = StrokeCap.round;
      for (var i = 0; i < 16; i++) {
        final a = rnd.nextDouble() * math.pi * 2;
        final speed = 60 + rnd.nextDouble() * 90;
        final p = Curves.easeOut.transform(_seg(0.32, 0.85));
        final p0 = target + Offset(math.cos(a), math.sin(a)) * speed * p;
        final p1 =
            target +
            Offset(math.cos(a), math.sin(a)) * speed * math.max(0, p - 0.12);
        spark
          ..color = (i.isEven ? fire : _gold).withValues(alpha: 1 - p)
          ..strokeWidth = 3;
        c.drawLine(p1, p0, spark);
      }
    }
  }

  /// Condessa: uma redoma de luz lilás se ergue em volta dela e a adaga
  /// do Assassino se parte ao bater no escudo.
  void _blockContessa(Canvas c) {
    const lilac = Color(0xFFDCD4E6);
    const rose = Color(0xFFE38FB3);
    final rise = Curves.easeOutBack.transform(_seg(0, 0.3));
    final alpha = _fadeOut(0.75);
    final r = 56 * rise;
    _glow(c, from, r * 1.6, rose, 0.35 * alpha);
    final dome = Paint()
      ..shader = RadialGradient(
        colors: [
          lilac.withValues(alpha: 0),
          lilac.withValues(alpha: 0.35 * alpha),
        ],
        stops: const [0.6, 1],
      ).createShader(Rect.fromCircle(center: from, radius: r + 1));
    c.drawCircle(from, r, dome);
    _ring(c, from, r, lilac, 2.5, 0.9 * alpha);
    // Pétalas girando.
    for (var i = 0; i < 8; i++) {
      final a = i * math.pi / 4 + t * 4;
      final pos = from + Offset(math.cos(a), math.sin(a)) * (r + 10);
      c.save();
      c.translate(pos.dx, pos.dy);
      c.rotate(a);
      c.drawOval(
        Rect.fromCenter(center: Offset.zero, width: 12, height: 6),
        Paint()..color = rose.withValues(alpha: 0.8 * alpha),
      );
      c.restore();
    }
    _icon(c, Icons.shield_moon, from, 30 * rise, lilac, alpha: alpha);
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
          _dagger(
            c,
            Offset.lerp(attacker, stop, fly)!,
            angle,
            44,
            const Color(0xFFB39AD9),
          );
        }
        final shatter = _seg(0.42, 0.8);
        if (shatter > 0 && shatter < 1) {
          final p = Paint()
            ..color = const Color(0xFFB39AD9).withValues(alpha: 1 - shatter);
          for (var i = 0; i < 7; i++) {
            final a = angle + math.pi + (i - 3) * 0.35;
            final pos = stop + Offset(math.cos(a), math.sin(a)) * 50 * shatter;
            c.save();
            c.translate(pos.dx, pos.dy);
            c.rotate(a + shatter * 6);
            c.drawPath(
              Path()
                ..moveTo(0, -4)
                ..lineTo(5, 3)
                ..lineTo(-4, 3)
                ..close(),
              p,
            );
            c.restore();
          }
          _ring(c, stop, 6 + 20 * shatter, Colors.white, 2, 1 - shatter);
        }
      }
    }
  }

  /// Duque bloqueando Ajuda Externa: uma barreira dourada com o brasão
  /// repele as moedas.
  void _blockDuke(Canvas c) {
    final rise = Curves.easeOutBack.transform(_seg(0, 0.3));
    final alpha = _fadeOut(0.7);
    _glow(c, from, 100 * rise, const Color(0xFF7A1F1F), 0.5 * alpha);
    // Hexágono.
    final path = Path();
    for (var i = 0; i < 6; i++) {
      final a = i * math.pi / 3 - math.pi / 2;
      final p = from + Offset(math.cos(a), math.sin(a)) * 54 * rise;
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    path.close();
    c.drawPath(path, Paint()..color = _gold.withValues(alpha: 0.12 * alpha));
    c.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = _gold.withValues(alpha: alpha),
    );
    _icon(c, Icons.account_balance, from, 30 * rise, _gold, alpha: alpha);
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

  /// Capitão bloqueando: a âncora crava no chão diante dele e uma onda
  /// azul empurra o ladrão.
  void _blockCaptain(Canvas c) {
    const blue = Color(0xFF8FB8D8);
    final drop = Curves.bounceOut.transform(_seg(0, 0.4));
    final alpha = _fadeOut(0.7);
    final pos = from - Offset(0, 90 * (1 - drop));
    _icon(c, Icons.anchor, pos, 46, blue, alpha: alpha);
    final splash = _seg(0.3, 0.8);
    for (var i = 0; i < 2; i++) {
      final w = (splash - i * 0.15).clamp(0.0, 1.0);
      _ring(c, from, 20 + 60 * w, blue, 3, w > 0 ? (1 - w) * alpha : 0);
    }
  }

  /// Embaixador bloqueando: um selo diplomático desce carimbando o veto.
  void _blockAmbassador(Canvas c) {
    const gold = Color(0xFFF2D68A);
    final stamp = Curves.easeInCubic.transform(_seg(0, 0.3));
    final alpha = _fadeOut(0.7);
    final scale = 2.6 - 1.6 * stamp;
    final r = 30 * scale;
    c.drawCircle(
      from,
      r,
      Paint()..color = const Color(0xFF8C3B3B).withValues(alpha: 0.85 * alpha),
    );
    _ring(c, from, r, gold, 3, alpha);
    _ring(c, from, r * 0.78, gold, 1.5, alpha * 0.8);
    _icon(c, Icons.gavel, from, 26 * scale, gold, alpha: alpha, glow: false);
    final dust = _seg(0.3, 0.7);
    _ring(c, from, r + 30 * dust, gold, 2, dust > 0 ? (1 - dust) * alpha : 0);
  }

  @override
  bool shouldRepaint(EffectPainter old) =>
      old.t != t || old.kind != kind || old.from != from || old.to != to;
}
