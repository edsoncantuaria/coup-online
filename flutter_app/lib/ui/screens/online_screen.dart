import 'package:flutter/material.dart';

import '../../engine/models.dart';
import '../../game/online_game_controller.dart';
import '../../settings.dart';
import '../theme.dart';
import '../widgets/tv.dart';
import 'game_screen.dart';

/// Conecta ao servidor e cria ou entra numa sala pelo código.
///
/// A tela é um close com o cartão de título e, embaixo, uma pilha de cenas
/// (entrar, criar, servidor), cada uma aberta por um título em itálico e
/// fechada por um fio. Outras formas de achar mesa entram como novas cenas.
class OnlineScreen extends StatefulWidget {
  const OnlineScreen({
    super.key,
    required this.playerName,
    required this.initialServer,
  });
  final String playerName;
  final String initialServer;

  @override
  State<OnlineScreen> createState() => _OnlineScreenState();
}

class _OnlineScreenState extends State<OnlineScreen> {
  late final _server = TextEditingController(text: widget.initialServer);
  final _roomName = TextEditingController();
  final _code = TextEditingController();
  final _joinPassword = TextEditingController();
  final _createPassword = TextEditingController();
  OnlineGameController? _controller;
  bool _connecting = false;
  bool _pushed = false;

  Future<OnlineGameController?> _ensureConnected() async {
    if (_controller?.connected == true) return _controller;
    setState(() => _connecting = true);
    final url = _server.text.trim();
    final ctrl = OnlineGameController(url);
    final ok = await ctrl.connect();
    if (!mounted) return null;
    setState(() => _connecting = false);
    if (!ok) {
      ctrl.dispose();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Não foi possível conectar a $url')),
      );
      return null;
    }
    Settings.save(server: url);
    _controller = ctrl;
    ctrl.addListener(_onController);
    return ctrl;
  }

  void _onController() {
    final ctrl = _controller;
    if (ctrl == null || !mounted) return;
    if (!_pushed) {
      final notice = ctrl.takeNotice();
      if (notice != null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(notice)));
      }
    }
    if (ctrl.inRoom && !_pushed) {
      _pushed = true;
      ctrl.removeListener(_onController);
      Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => GameScreen(controller: ctrl)))
          .then((_) {
            // GameScreen descarta o controller ao sair.
            _controller = null;
            _pushed = false;
          });
    }
  }

  Future<void> _create() async {
    final ctrl = await _ensureConnected();
    ctrl?.createRoom(
      roomName: _roomName.text.trim().isEmpty
          ? 'Corte de ${widget.playerName}'
          : _roomName.text.trim(),
      playerName: widget.playerName,
      password: _createPassword.text.trim(),
    );
  }

  Future<void> _join() async {
    if (_code.text.trim().isEmpty) return;
    final ctrl = await _ensureConnected();
    ctrl?.joinRoom(
      code: _code.text,
      playerName: widget.playerName,
      password: _joinPassword.text.trim(),
    );
  }

  @override
  void dispose() {
    if (!_pushed) _controller?.dispose();
    _server.dispose();
    _roomName.dispose();
    _code.dispose();
    _joinPassword.dispose();
    _createPassword.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final wide = size.width >= 900;

    final title = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('Online', style: TvType.title(wide ? 72 : 56)),
        const SizedBox(height: 10),
        Text(
          'Jogando como ${widget.playerName}'.toUpperCase(),
          style: TvType.credit(12, color: Tv.credit),
        ),
      ],
    );

    final scenes = <Widget>[
      _Scene(
        title: 'Entrar numa sala',
        note: 'Peça o código a quem criou a sala.',
        children: [
          TextField(
            controller: _code,
            textCapitalization: TextCapitalization.characters,
            maxLength: 5,
            style: TvType.figure(30).copyWith(letterSpacing: 12),
            decoration: const InputDecoration(
              labelText: 'Código da sala',
              counterText: '',
            ),
            onSubmitted: (_) => _join(),
          ),
          const SizedBox(height: 12),
          _passwordField(_joinPassword, 'Senha (se a sala tiver)'),
          const SizedBox(height: 20),
          CueButton(
            label: 'Entrar na sala',
            icon: Icons.login,
            onPressed: _connecting ? null : _join,
          ),
        ],
      ),
      _Scene(
        title: 'Criar uma sala',
        note:
            'Você recebe um código para compartilhar e pode completar a mesa '
            'com bots.',
        children: [
          TextField(
            controller: _roomName,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Nome da sala',
              hintText: 'Corte de ${widget.playerName}',
            ),
          ),
          const SizedBox(height: 12),
          _passwordField(_createPassword, 'Senha (opcional)'),
          const SizedBox(height: 20),
          CueButton(
            label: 'Criar sala',
            icon: Icons.add,
            quiet: true,
            onPressed: _connecting ? null : _create,
          ),
        ],
      ),
      _ServerScene(controller: _server, onChanged: () => setState(() {})),
    ];

    final progress = SizedBox(
      height: 2,
      child: _connecting ? const LinearProgressIndicator(minHeight: 2) : null,
    );

    final Widget body;
    if (wide) {
      body = Row(
        children: [
          Expanded(
            flex: 11,
            child: Stack(
              fit: StackFit.expand,
              children: [
                const CloseUp(role: Role.ambassador),
                const _Scrim(horizontal: true),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: LetterboxBar(cue: _cue, height: 40),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 9,
            child: SafeArea(
              left: false,
              child: Column(
                children: [
                  const SizedBox(height: 56),
                  progress,
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(48, 16, 56, 40),
                      children: [
                        title,
                        const SizedBox(height: 16),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 440),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: scenes,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    } else {
      final band = (size.height * 0.34).clamp(200.0, 340.0);
      body = ListView(
        padding: EdgeInsets.only(
          bottom: 28 + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          SizedBox(
            height: band,
            child: Stack(
              fit: StackFit.expand,
              children: [
                const CloseUp(role: Role.ambassador),
                const _Scrim(horizontal: false),
                Positioned(left: 20, right: 20, bottom: 18, child: title),
              ],
            ),
          ),
          LetterboxBar(cue: _cue),
          progress,
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: scenes,
                ),
              ),
            ),
          ),
        ],
      );
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: WidgetStateColor.resolveWith(
          (s) => s.contains(WidgetState.scrolledUnder)
              ? Tv.ink
              : Colors.transparent,
        ),
        scrolledUnderElevation: 0,
      ),
      body: body,
    );
  }

  String get _cue =>
      _connecting ? 'CONECTANDO AO SERVIDOR' : 'SALAS POR CÓDIGO';

  Widget _passwordField(TextEditingController controller, String label) =>
      TextField(
        controller: controller,
        obscureText: true,
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: const Icon(Icons.lock_outline),
        ),
      );
}

/// Uma cena da tela: título em itálico, os campos, uma nota e o fio.
class _Scene extends StatelessWidget {
  const _Scene({required this.title, required this.children, this.note});
  final String title;
  final String? note;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.only(top: 24, bottom: 28),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Tv.rule)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: TvType.name(28)),
        if (note != null) ...[
          const SizedBox(height: 6),
          Text(
            note!,
            style: const TextStyle(
              fontSize: 15,
              height: 1.4,
              color: Tv.creditDim,
            ),
          ),
        ],
        const SizedBox(height: 16),
        ...children,
      ],
    ),
  );
}

/// Endereço do servidor, recolhido numa linha de crédito.
class _ServerScene extends StatelessWidget {
  const _ServerScene({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) => Theme(
    data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
    child: ExpansionTile(
      tilePadding: EdgeInsets.zero,
      childrenPadding: const EdgeInsets.only(bottom: 16),
      minTileHeight: 56,
      iconColor: Tv.credit,
      collapsedIconColor: Tv.creditMuted,
      title: Text('Servidor', style: TvType.name(20)),
      subtitle: Text(
        controller.text,
        style: TvType.credit(11),
        overflow: TextOverflow.ellipsis,
      ),
      children: [
        TextField(
          controller: controller,
          keyboardType: TextInputType.url,
          onChanged: (_) => onChanged(),
          decoration: const InputDecoration(labelText: 'Endereço do servidor'),
        ),
      ],
    ),
  );
}

/// Película sobre o close para o texto ler por cima.
class _Scrim extends StatelessWidget {
  const _Scrim({required this.horizontal});
  final bool horizontal;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: horizontal ? Alignment.centerLeft : Alignment.topCenter,
        end: horizontal ? Alignment.centerRight : Alignment.bottomCenter,
        colors: horizontal
            ? [
                Tv.ink.withValues(alpha: 0.0),
                Tv.ink.withValues(alpha: 0.15),
                Tv.ink,
              ]
            : [
                Tv.ink.withValues(alpha: 0.6),
                Tv.ink.withValues(alpha: 0.0),
                Tv.ink.withValues(alpha: 0.45),
                Tv.ink,
              ],
        stops: horizontal ? const [0, 0.75, 1] : const [0, 0.3, 0.62, 1],
      ),
    ),
  );
}
