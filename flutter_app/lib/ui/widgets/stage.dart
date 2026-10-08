import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../engine/coup_engine.dart';
import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../../game/game_controller.dart';
import '../../game/online_game_controller.dart';
import '../theme.dart';
import 'common.dart';
import 'tv.dart';

/// O centro da mesa: o retrato de quem declarou, impresso como capa, o
/// crédito da jogada e o que a mesa espera agora.
class Stage extends StatelessWidget {
  const Stage({
    super.key,
    required this.state,
    required this.myId,
    this.traces,
  });

  final GameState state;
  final String myId;

  /// Rastros das declarações: entre uma jogada e outra, o palco mostra a
  /// última figura que o jogador da vez disse ser.
  final ClaimTraces? traces;

  String _n(String? id) =>
      id == myId ? 'Você' : (state.playerById(id)?.name ?? '?');

  @override
  Widget build(BuildContext context) {
    final scene = _scene();
    final event = latestEvent(state, myId);
    final waiting = describeWaiting(state, myId);
    final wide = MediaQuery.sizeOf(context).width >= 600;

    final credits = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (scene.role != null && scene.dim == 0)
          LowerThird(
            name: scene.name,
            role: scene.line,
            roleColor: scene.color,
            nameSize: wide ? 34 : 26,
          )
        else ...[
          Text(
            scene.name,
            style: TvType.title(wide ? 52 : 38, color: scene.color),
          ),
          const SizedBox(height: 6),
          Text(scene.line.toUpperCase(), style: TvType.credit(12)),
        ],
        if (waiting.isNotEmpty) ...[
          const SizedBox(height: 14),
          Text(
            waiting,
            style: const TextStyle(
              fontFamily: TvType.sans,
              fontSize: 14,
              height: 1.35,
              color: Tv.credit,
            ),
          ),
        ],
        if (event != null) ...[
          const SizedBox(height: 8),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 160),
            child: Text(
              event.text,
              key: ValueKey(event.stamp),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontFamily: TvType.sans,
                fontSize: 13,
                height: 1.3,
                color: event.color,
              ),
            ),
          ),
        ],
      ],
    );

    return Stack(
      fit: StackFit.expand,
      children: [
        // Corte seco entre um close e outro.
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 120),
          child: scene.role == null
              ? const ColoredBox(key: ValueKey('empty'), color: Tv.ink)
              : CloseUp(
                  key: ValueKey('${scene.role}-${scene.dim}'),
                  role: scene.role!,
                  dim: scene.dim,
                  zoom: scene.hot ? 1.12 : 1.0,
                ),
        ),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              stops: [0.0, 0.55, 1.0],
              colors: [Color(0x00120E0C), Color(0x33120E0C), Tv.ink],
            ),
          ),
        ),
        Align(
          alignment: Alignment.bottomLeft,
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(wide ? 32 : 20, 16, 20, 16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: credits,
            ),
          ),
        ),
      ],
    );
  }

  /// Rosto para uma cena sem declaração: a última figura que o jogador
  /// disse ser; na sua vez, uma carta da sua mão (só você vê esta tela).
  Role? _face(String id) =>
      traces?.of(id).firstOrNull ??
      (id == myId ? state.playerById(id)?.aliveRoles.firstOrNull : null);

  _Scene _scene() {
    final s = state;
    final a = s.currentAction;
    final pb = s.pendingBlock;

    if (s.phase == Phase.gameOver) {
      return const _Scene(name: 'Fim.', line: 'A última caixa fechou');
    }

    if (s.phase == Phase.losingInfluence) {
      final reason = switch (s.losingContext?.reason) {
        LossReason.coup => 'sofreu um Golpe de Estado',
        LossReason.assassinate => 'foi assassinado',
        LossReason.challengeLost => 'errou o desafio',
        LossReason.bluffCaught => 'foi pego blefando',
        null => 'perde uma influência',
      };
      return _Scene(
        name: _n(s.losingInfluenceId),
        line: reason,
        color: Tv.carmineText,
      );
    }

    if (pb != null && a != null) {
      return _Scene(
        role: pb.role,
        name: _n(pb.blockerId),
        line: 'bloqueia como ${roleArticle(pb.role)}',
        color: roleStyle(pb.role).accent,
        hot: true,
      );
    }

    if (a != null && (s.phase == Phase.challenge || s.phase == Phase.block)) {
      final claim = CoupEngine.requiredRole(a.type);
      final target = a.target == null ? '' : ' · contra ${_n(a.target)}';
      if (claim == null) {
        return _Scene(
          role: _face(a.source),
          dim: 0.15,
          name: _n(a.source),
          line: '${actionLabel(a.type)}$target',
        );
      }
      return _Scene(
        role: claim,
        name: _n(a.source),
        line:
            'diz ser ${roleArticle(claim)} · ${shortActionLabel(a.type)}'
            '$target',
        color: roleStyle(claim).accent,
      );
    }

    if (s.phase == Phase.exchanging) {
      return _Scene(
        role: Role.ambassador,
        name: _n(s.waitingFor?.id),
        line: 'troca cartas com a Corte',
        color: roleStyle(Role.ambassador).accent,
      );
    }

    final cp = s.currentPlayer;
    if (cp == null) return const _Scene(name: '', line: '');
    final last = traces?.of(cp.id).firstOrNull;
    if (cp.id == myId) {
      // Na sua vez, o close é da sua própria mão (só você vê esta tela).
      final mine = last ?? cp.aliveRoles.firstOrNull;
      return _Scene(
        role: mine,
        dim: 0.15,
        name: 'Sua vez.',
        line: last != null
            ? 'Da última vez, você foi ${roleArticle(last)}'
            : 'Escolha a jogada',
      );
    }
    return _Scene(
      role: last,
      dim: 0.15,
      name: 'Vez de ${cp.name}.',
      line: last != null
          ? 'Da última vez, disse ser ${roleArticle(last)}'
          : 'Escolhendo a jogada',
    );
  }
}

class _Scene {
  const _Scene({
    this.role,
    required this.name,
    required this.line,
    this.color = Tv.credit,
    this.hot = false,
    this.dim = 0.0,
  });
  final Role? role;
  final double dim;
  final String name;
  final String line;
  final Color color;
  final bool hot;
}

/// Deixa do letterbox para a fase atual. Nunca só a cor carrega a fase.
({String cue, bool hot}) phaseCue(GameState s) => switch (s.phase) {
  Phase.action => (cue: 'AÇÃO', hot: false),
  Phase.challenge => (cue: 'DESAFIO?', hot: true),
  Phase.block =>
    s.pendingBlock != null
        ? (cue: 'BLOQUEIO', hot: true)
        : (cue: 'BLOQUEIO?', hot: false),
  Phase.losingInfluence => (cue: 'REVELAÇÃO', hot: true),
  Phase.exchanging => (cue: 'TROCA', hot: false),
  Phase.reveal => (cue: 'REVELAÇÃO', hot: true),
  Phase.gameOver => (cue: 'FIM', hot: false),
};

String shortActionLabel(ActionType t) => switch (t) {
  ActionType.income => 'Renda',
  ActionType.foreignAid => 'Ajuda Externa',
  ActionType.coup => 'Golpe',
  ActionType.tax => 'Taxa',
  ActionType.steal => 'Extorsão',
  ActionType.assassinate => 'Assassinar',
  ActionType.exchange => 'Troca',
};

/// Frase sobre quem a mesa está esperando.
String describeWaiting(GameState s, String myId) {
  String n(String? id) => id == myId ? 'você' : (s.playerById(id)?.name ?? '?');
  final w = s.waitingFor?.id;
  final me = w == myId;
  switch (s.phase) {
    case Phase.action:
      return s.currentPlayer?.id == myId
          ? 'Toque em Agir para escolher sua jogada.'
          : '${n(s.currentPlayer?.id)} está escolhendo uma ação.';
    case Phase.challenge:
      return me
          ? 'Você acredita? Decida se desafia.'
          : 'Aguardando ${n(w)} decidir se desafia.';
    case Phase.block:
      if (s.pendingBlock != null) {
        return me
            ? 'Decida se desafia o bloqueio.'
            : 'Aguardando ${n(w)} decidir se desafia o bloqueio.';
      }
      return me
          ? 'Decida se bloqueia.'
          : 'Aguardando ${n(w)} decidir se bloqueia.';
    case Phase.losingInfluence:
      return s.losingInfluenceId == myId
          ? 'Escolha qual carta revelar.'
          : 'Aguardando ${n(s.losingInfluenceId)} escolher a carta.';
    case Phase.exchanging:
      return me ? 'Escolha quais cartas manter.' : 'A Corte aguarda a troca.';
    case Phase.gameOver:
    case Phase.reveal:
      return '';
  }
}

class GameEvent {
  GameEvent(this.stamp, this.text, this.color, [this.role]);
  final int stamp;
  final String text;
  final Color color;
  final Role? role;
}

GameEvent? latestEvent(GameState s, String myId) {
  String n(String id, String name) => id == myId ? 'Você' : name;
  final r = s.lastReveal;
  final l = s.lastLoss;
  final events = <GameEvent>[
    if (s.lastResolved != null)
      GameEvent(s.lastResolved!.stamp, s.lastResolved!.summary, Tv.creditDim),
    if (r != null)
      GameEvent(
        r.stamp,
        r.proven
            ? '${n(r.playerId, r.playerName)} provou ter ${roleLabel(r.role)}.'
            : '${n(r.playerId, r.playerName)} blefou ${roleLabel(r.role)}.',
        r.proven ? Tv.proven : Tv.bluff,
        r.role,
      ),
    if (l != null)
      GameEvent(
        l.stamp,
        '${n(l.playerId, l.playerName)} perdeu ${roleLabel(l.role)}.',
        Tv.carmine,
        l.role,
      ),
  ];
  if (events.isEmpty) return null;
  events.sort((a, b) => b.stamp.compareTo(a.stamp));
  return events.first;
}

// ------------------------------------------------------------ claim traces

/// Rastros das declarações de cada jogador: os últimos papéis que ele disse
/// ter, do mais novo ao mais velho. Os mais velhos vão apagando no elenco.
class ClaimTraces {
  final Map<String, List<Role>> _byPlayer = {};
  String? _lastKey;

  List<Role> of(String id) => _byPlayer[id] ?? const [];

  void observe(GameState s) {
    final a = s.currentAction;
    final pb = s.pendingBlock;
    String? who;
    Role? role;
    if (pb != null) {
      who = pb.blockerId;
      role = pb.role;
    } else if (a != null) {
      who = a.source;
      role = CoupEngine.requiredRole(a.type);
    }
    if (who == null || role == null) return;
    final key = '${s.turnIndex}-${s.matchStats?.round}-$who-${role.name}';
    if (key == _lastKey) return;
    _lastKey = key;
    final list = _byPlayer.putIfAbsent(who, () => []);
    list
      ..remove(role)
      ..insert(0, role);
    if (list.length > 3) list.removeLast();
  }

  void clear() {
    _byPlayer.clear();
    _lastKey = null;
  }
}

// ------------------------------------------------------------ freeze frame

/// O momento da novela: quando um desafio se resolve ou alguém perde uma
/// influência, a imagem congela em preto e branco e o veredito entra como
/// cartão de título.
class FreezeFrame extends StatefulWidget {
  const FreezeFrame({super.key, required this.state, required this.myId});
  final GameState state;
  final String myId;

  @override
  State<FreezeFrame> createState() => _FreezeFrameState();
}

class _FreezeFrameState extends State<FreezeFrame>
    with SingleTickerProviderStateMixin {
  int? _seenReveal;
  int? _seenLoss;
  _Freeze? _current;
  Timer? _timer;
  late final _push = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  );

  @override
  void initState() {
    super.initState();
    // Não reapresenta eventos antigos ao abrir a tela.
    _seenReveal = widget.state.lastReveal?.stamp;
    _seenLoss = widget.state.lastLoss?.stamp;
  }

  @override
  void didUpdateWidget(covariant FreezeFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    final s = widget.state;
    String n(String id, String name) => id == widget.myId ? 'Você' : name;
    _Freeze? next;
    final r = s.lastReveal;
    final l = s.lastLoss;
    if (r != null && r.stamp != _seenReveal) {
      _seenReveal = r.stamp;
      _seenLoss = l?.stamp; // o palco mostra a perda em seguida
      next = _Freeze(
        role: r.role,
        cue: 'DESAFIO',
        title: r.proven ? 'Provado.' : 'Blefe.',
        credit: r.proven
            ? '${n(r.playerId, r.playerName)} tinha ${roleArticle(r.role)}'
            : '${n(r.playerId, r.playerName)} não tinha ${roleArticle(r.role)}',
        color: r.proven ? Tv.proven : Tv.carmineText,
      );
    } else if (l != null && l.stamp != _seenLoss) {
      _seenLoss = l.stamp;
      next = _Freeze(
        role: l.role,
        cue: 'REVELAÇÃO',
        title: 'Um palito a menos.',
        credit: '${n(l.playerId, l.playerName)} perdeu ${roleArticle(l.role)}',
        color: Tv.carmineText,
      );
    }
    if (next != null) {
      if (r?.playerId == widget.myId || l?.playerId == widget.myId) {
        HapticFeedback.heavyImpact();
      } else {
        HapticFeedback.lightImpact();
      }
      _timer?.cancel();
      _current = next;
      if (!MediaQuery.of(context).disableAnimations) _push.forward(from: 0);
      _timer = Timer(const Duration(milliseconds: 1700), () {
        if (mounted) setState(() => _current = null);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _push.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final f = _current;
    final wide = MediaQuery.sizeOf(context).width >= 600;
    return IgnorePointer(
      child: AnimatedSwitcher(
        // Entra seco, sai com um respiro.
        duration: Duration.zero,
        reverseDuration: const Duration(milliseconds: 220),
        child: f == null
            ? const SizedBox.shrink(key: ValueKey('empty'))
            : Stack(
                key: ValueKey(f),
                fit: StackFit.expand,
                children: [
                  AnimatedBuilder(
                    animation: _push,
                    builder: (_, _) => CloseUp(
                      role: f.role,
                      grayscale: true,
                      dim: 0.2,
                      zoom: 1.08 + 0.08 * Curves.easeOut.transform(_push.value),
                    ),
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        stops: [0.3, 1.0],
                        colors: [Color(0x00120E0C), Tv.ink],
                      ),
                    ),
                  ),
                  // O risco do palito: um clarão seco nos primeiros quadros.
                  AnimatedBuilder(
                    animation: _push,
                    builder: (_, _) {
                      final t = _push.value;
                      if (!_push.isAnimating || t > 0.08) {
                        return const SizedBox.shrink();
                      }
                      return ColoredBox(
                        color: const Color(0xFFFFE9B8)
                            .withValues(alpha: 0.8 * (1 - t / 0.08)),
                      );
                    },
                  ),
                  Column(
                    children: [
                      LetterboxBar(cue: f.cue, height: 48, hot: true),
                      const Spacer(),
                      Padding(
                        padding: EdgeInsets.fromLTRB(
                          wide ? 40 : 20,
                          0,
                          20,
                          wide ? 72 : 48,
                        ),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  f.title,
                                  maxLines: 1,
                                  style: TvType.title(
                                    wide ? 96 : 64,
                                    color: f.color,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                f.credit.toUpperCase(),
                                style: TvType.credit(
                                  14,
                                  color: Tv.credit,
                                  weight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const LetterboxBar(height: 24),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}

class _Freeze {
  _Freeze({
    required this.role,
    required this.cue,
    required this.title,
    required this.credit,
    required this.color,
  });
  final Role role;
  final String cue;
  final String title;
  final String credit;
  final Color color;
}

// ------------------------------------------------------------ final credits

/// Fim de partida como créditos finais: o veredito em título e o elenco
/// em ordem de queda.
class FinalCredits extends StatelessWidget {
  const FinalCredits({
    super.key,
    required this.state,
    required this.controller,
    this.onContinue,
    this.continueLabel = 'Continuar',
    this.onPlayer,
  });
  final GameState state;
  final GameController controller;

  /// Online: tocar num jogador dos créditos (adicionar amigo, denunciar).
  final void Function(Player)? onPlayer;

  /// Substitui "Menu" e "Jogar de novo" por um único botão (campanha).
  final VoidCallback? onContinue;
  final String continueLabel;

  @override
  Widget build(BuildContext context) {
    final winner = state.playerById(state.winner);
    final iWon = winner?.id == controller.myId;
    final stats = state.matchStats?.perPlayer ?? const {};
    final online = controller is OnlineGameController;
    final canRestart = !online || (controller as OnlineGameController).amHost;
    final rounds = state.matchStats?.round;
    final ranking = [...state.players]
      ..sort((a, b) {
        if (a.id == state.winner) return -1;
        if (b.id == state.winner) return 1;
        final ra = stats[a.id]?.eliminatedAtRound ?? 999;
        final rb = stats[b.id]?.eliminatedAtRound ?? 999;
        return rb.compareTo(ra);
      });
    final wide = MediaQuery.sizeOf(context).width >= 600;

    return ColoredBox(
      color: Tv.ink.withValues(alpha: 0.94),
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    iWon ? 'Vitória.' : 'Derrota.',
                    style: TvType.title(
                      wide ? 88 : 64,
                      color: iWon ? Tv.credit : Tv.carmineText,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    winner == null
                        ? 'Ninguém dominou a corte.'
                        : iWon
                        ? 'O reino agora é seu.'
                        : 'O reino agora pertence a ${winner.name}.',
                    style: TvType.name(20, color: Tv.creditDim),
                  ),
                  if (rounds != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      '$rounds rodada${rounds > 1 ? 's' : ''}'.toUpperCase(),
                      style: TvType.credit(11),
                    ),
                  ],
                  const SizedBox(height: 24),
                  for (final (i, p) in ranking.indexed)
                    if (stats[p.id] != null)
                      _CreditRow(
                        position: i + 1,
                        player: p,
                        stats: stats[p.id]!,
                        winner: p.id == state.winner,
                        me: p.id == controller.myId,
                        onTap:
                            onPlayer == null ||
                                p.isBot ||
                                p.id == controller.myId
                            ? null
                            : () => onPlayer!(p),
                      ),
                  const SizedBox(height: 28),
                  if (onContinue != null)
                    CueButton(label: continueLabel, onPressed: onContinue)
                  else
                    Row(
                      children: [
                        Expanded(
                          child: CueButton(
                            label: 'Menu',
                            quiet: true,
                            onPressed: () => Navigator.of(context).pop(),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: CueButton(
                            label: canRestart
                                ? 'Jogar de novo'
                                : 'Aguarde o anfitrião',
                            onPressed: canRestart ? controller.playAgain : null,
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CreditRow extends StatelessWidget {
  const _CreditRow({
    required this.position,
    required this.player,
    required this.stats,
    required this.winner,
    required this.me,
    this.onTap,
  });
  final VoidCallback? onTap;
  final int position;
  final Player player;
  final PlayerStats stats;
  final bool winner;
  final bool me;

  @override
  Widget build(BuildContext context) => InkWell(onTap: onTap, child: _row());

  Widget _row() => Container(
    padding: const EdgeInsets.symmetric(vertical: 10),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Tv.rule)),
    ),
    child: Row(
      children: [
        SizedBox(
          width: 28,
          child: Text(
            '$position',
            style: TvType.figure(
              18,
              color: winner ? Tv.credit : Tv.creditMuted,
            ),
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                me ? '${player.name} (você)' : player.name,
                overflow: TextOverflow.ellipsis,
                style: TvType.name(
                  20,
                  color: winner ? Tv.credit : Tv.creditDim,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'Desafios ${stats.challengesWon}/${stats.challengesMade} · '
                        'Blefes ${stats.bluffsSurvived} · '
                        'Moedas +${stats.coinsGained}'
                    .toUpperCase(),
                style: TvType.credit(10),
              ),
            ],
          ),
        ),
        InfluencePips(player: player, revealAll: true, height: 20),
        if (onTap != null) ...[
          const SizedBox(width: 8),
          const Icon(Icons.more_horiz, color: Tv.creditMuted, size: 20),
        ],
      ],
    ),
  );
}

// -------------------------------------------------------------- scene log

/// O registro da partida, como uma pauta de cenas: a mais recente em cima.
class SceneLog extends StatelessWidget {
  const SceneLog({super.key, required this.logs});
  final List<String> logs;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 10),
        child: Text('Registro', style: TvType.title(28)),
      ),
      Expanded(
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          itemCount: logs.length,
          itemBuilder: (_, i) => Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Tv.rule)),
            ),
            child: Text(
              logs[logs.length - 1 - i],
              style: TextStyle(
                fontFamily: TvType.sans,
                fontSize: 13.5,
                height: 1.35,
                color: i == 0 ? Tv.credit : Tv.creditDim,
              ),
            ),
          ),
        ),
      ),
    ],
  );
}
