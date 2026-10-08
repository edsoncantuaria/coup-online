import 'package:flutter/material.dart';

import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../../game/local_game_controller.dart';
import '../../settings.dart';
import '../theme.dart';
import '../widgets/influence_card.dart';
import 'game_screen.dart';
import 'online_screen.dart';
import 'rules_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _name = TextEditingController();
  String _server = defaultServerUrl;
  int _bots = 3;
  BotPersonality? _personality; // null = sortear

  @override
  void initState() {
    super.initState();
    Settings.load().then((v) {
      if (!mounted) return;
      setState(() {
        _name.text = v.$1;
        _server = v.$2;
      });
    });
  }

  String get _playerName =>
      _name.text.trim().isEmpty ? 'Você' : _name.text.trim();

  void _playOffline() {
    Settings.save(name: _name.text.trim());
    final controller = LocalGameController(
      playerName: _playerName,
      botCount: _bots,
      personalities: _personality == null
          ? null
          : List.filled(_bots, _personality!),
    );
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => GameScreen(controller: controller)),
    );
  }

  void _playOnline() {
    Settings.save(name: _name.text.trim());
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            OnlineScreen(playerName: _playerName, initialServer: _server),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: RadialGradient(
            center: Alignment(0, -0.6),
            radius: 1.2,
            colors: [Color(0xFF2A1D10), CoupColors.background],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 130,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        for (final (i, r) in [
                          Role.assassin,
                          Role.duke,
                          Role.contessa,
                        ].indexed)
                          Transform.translate(
                            offset: Offset((i - 1) * 56.0, i == 1 ? -6 : 6),
                            child: Transform.rotate(
                              angle: (i - 1) * 0.18,
                              child: InfluenceCard(role: r, width: 78),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'COUP',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 52,
                      letterSpacing: 18,
                      fontWeight: FontWeight.w900,
                      color: CoupColors.goldHigh,
                    ),
                  ),
                  const Text(
                    'BLEFE · INTRIGA · PODER',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      letterSpacing: 4,
                      color: CoupColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 32),
                  TextField(
                    controller: _name,
                    textCapitalization: TextCapitalization.words,
                    maxLength: 20,
                    decoration: const InputDecoration(
                      labelText: 'Seu nome',
                      prefixIcon: Icon(Icons.person_outline),
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 20),
                  _Section(
                    title: 'CONTRA BOTS',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            const Text('Oponentes'),
                            Expanded(
                              child: Slider(
                                value: _bots.toDouble(),
                                min: 1,
                                max: 5,
                                divisions: 4,
                                label: '$_bots',
                                onChanged: (v) =>
                                    setState(() => _bots = v.round()),
                              ),
                            ),
                            Text(
                              '$_bots',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: [
                            ChoiceChip(
                              label: const Text('Variados'),
                              selected: _personality == null,
                              onSelected: (_) =>
                                  setState(() => _personality = null),
                            ),
                            for (final p in BotPersonality.values)
                              ChoiceChip(
                                label: Text(personalityLabel(p)),
                                selected: _personality == p,
                                onSelected: (_) =>
                                    setState(() => _personality = p),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          onPressed: _playOffline,
                          icon: const Icon(Icons.smart_toy_outlined),
                          label: const Text('JOGAR OFFLINE'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _playOnline,
                    icon: const Icon(Icons.public),
                    label: const Text('JOGAR ONLINE'),
                  ),
                  const SizedBox(height: 12),
                  TextButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const RulesScreen()),
                    ),
                    icon: const Icon(
                      Icons.menu_book_outlined,
                      color: CoupColors.gold,
                    ),
                    label: const Text(
                      'Regras',
                      style: TextStyle(color: CoupColors.gold),
                    ),
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

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: CoupColors.surface.withValues(alpha: 0.85),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: CoupColors.goldSoft.withValues(alpha: 0.4)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          title,
          style: const TextStyle(
            letterSpacing: 3,
            fontWeight: FontWeight.w800,
            color: CoupColors.gold,
          ),
        ),
        const SizedBox(height: 8),
        child,
      ],
    ),
  );
}
