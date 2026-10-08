import 'package:flutter/material.dart';

import '../../game/online_game_controller.dart';
import '../../settings.dart';
import '../theme.dart';
import 'game_screen.dart';

/// Conecta ao servidor e cria ou entra numa sala.
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
  final _password = TextEditingController();
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
      password: _password.text.trim(),
    );
  }

  Future<void> _join() async {
    if (_code.text.trim().isEmpty) return;
    final ctrl = await _ensureConnected();
    ctrl?.joinRoom(
      code: _code.text,
      playerName: widget.playerName,
      password: _password.text.trim(),
    );
  }

  @override
  void dispose() {
    if (!_pushed) _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'ONLINE',
          style: TextStyle(letterSpacing: 4, fontWeight: FontWeight.w800),
        ),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              TextField(
                controller: _server,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'Servidor',
                  prefixIcon: Icon(Icons.dns_outlined),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _password,
                decoration: const InputDecoration(
                  labelText: 'Senha da sala (opcional)',
                  prefixIcon: Icon(Icons.lock_outline),
                ),
              ),
              const SizedBox(height: 28),
              const Text(
                'CRIAR SALA',
                style: TextStyle(
                  letterSpacing: 3,
                  fontWeight: FontWeight.w800,
                  color: CoupColors.gold,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _roomName,
                decoration: const InputDecoration(labelText: 'Nome da sala'),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _connecting ? null : _create,
                child: const Text('CRIAR'),
              ),
              const SizedBox(height: 28),
              const Text(
                'ENTRAR EM SALA',
                style: TextStyle(
                  letterSpacing: 3,
                  fontWeight: FontWeight.w800,
                  color: CoupColors.gold,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'Código da sala'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _connecting ? null : _join,
                child: const Text('ENTRAR'),
              ),
              if (_connecting) ...[
                const SizedBox(height: 24),
                const Center(child: CircularProgressIndicator()),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
