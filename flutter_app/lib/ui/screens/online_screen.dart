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
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'ONLINE',
            style: TextStyle(letterSpacing: 4, fontWeight: FontWeight.w800),
          ),
          bottom: const TabBar(
            indicatorColor: CoupColors.gold,
            dividerColor: CoupColors.border,
            labelColor: CoupColors.goldHigh,
            unselectedLabelColor: CoupColors.textSecondary,
            tabs: [
              Tab(icon: Icon(Icons.login), text: 'Entrar'),
              Tab(icon: Icon(Icons.add_circle_outline), text: 'Criar sala'),
            ],
          ),
        ),
        body: Column(
          children: [
            if (_connecting) const LinearProgressIndicator(minHeight: 2),
            Expanded(
              child: TabBarView(
                children: [
                  _form([
                    TextField(
                      controller: _code,
                      textCapitalization: TextCapitalization.characters,
                      textAlign: TextAlign.center,
                      maxLength: 5,
                      style: const TextStyle(
                        fontSize: 26,
                        letterSpacing: 10,
                        fontWeight: FontWeight.w900,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Código da sala',
                        counterText: '',
                      ),
                      onSubmitted: (_) => _join(),
                    ),
                    const SizedBox(height: 12),
                    _passwordField('Senha (se a sala tiver)'),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: _connecting ? null : _join,
                      icon: const Icon(Icons.login),
                      label: const Text('Entrar na sala'),
                    ),
                  ]),
                  _form([
                    TextField(
                      controller: _roomName,
                      decoration: InputDecoration(
                        labelText: 'Nome da sala',
                        hintText: 'Corte de ${widget.playerName}',
                        prefixIcon: const Icon(Icons.castle_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _passwordField('Senha (opcional)'),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: _connecting ? null : _create,
                      icon: const Icon(Icons.add),
                      label: const Text('Criar sala'),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Você recebe um código para compartilhar e pode completar a mesa com bots.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: CoupColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ]),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _passwordField(String label) => TextField(
    controller: _password,
    obscureText: true,
    decoration: InputDecoration(
      labelText: label,
      prefixIcon: const Icon(Icons.lock_outline),
    ),
  );

  Widget _form(List<Widget> children) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 440),
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            'Jogando como ${widget.playerName}',
            textAlign: TextAlign.center,
            style: const TextStyle(color: CoupColors.textSecondary),
          ),
          const SizedBox(height: 20),
          ...children,
          const SizedBox(height: 28),
          Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              leading: const Icon(
                Icons.dns_outlined,
                color: CoupColors.textMuted,
              ),
              title: const Text(
                'Servidor',
                style: TextStyle(color: CoupColors.textSecondary),
              ),
              subtitle: Text(
                _server.text,
                style: const TextStyle(
                  color: CoupColors.textMuted,
                  fontSize: 12,
                ),
              ),
              children: [
                TextField(
                  controller: _server,
                  keyboardType: TextInputType.url,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Endereço do servidor',
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
