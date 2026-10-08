import 'package:flutter/material.dart';

import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../theme.dart';
import '../widgets/influence_card.dart';

class RulesScreen extends StatelessWidget {
  const RulesScreen({super.key});

  static const _cards = {
    Role.duke: ('TAXAR: recebe 3 moedas.', 'Bloqueia Ajuda Externa.'),
    Role.assassin: (
      'ASSASSINAR: paga 3 moedas e elimina 1 carta do alvo.',
      null,
    ),
    Role.captain: (
      'EXTORQUIR: rouba até 2 moedas de outro jogador.',
      'Bloqueia Extorsão.',
    ),
    Role.ambassador: (
      'TROCAR: compra 2 cartas da Corte e devolve 2.',
      'Bloqueia Extorsão.',
    ),
    Role.contessa: ('Sem ação própria.', 'Bloqueia Assassinato.'),
  };

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'REGRAS',
            style: TextStyle(letterSpacing: 4, fontWeight: FontWeight.w800),
          ),
          bottom: const TabBar(
            indicatorColor: CoupColors.gold,
            labelColor: CoupColors.goldHigh,
            tabs: [
              Tab(text: 'Cartas'),
              Tab(text: 'Ações'),
              Tab(text: 'Como jogar'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            ListView(
              padding: const EdgeInsets.all(16),
              children: [
                for (final e in _cards.entries)
                  Card(
                    color: CoupColors.surface,
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          InfluenceCard(role: e.key, width: 70),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  roleLabel(e.key),
                                  style: TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                    color: roleStyle(e.key).accent,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(e.value.$1),
                                if (e.value.$2 != null)
                                  Text(
                                    e.value.$2!,
                                    style: const TextStyle(
                                      color: CoupColors.info,
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
            ),
            ListView(
              padding: const EdgeInsets.all(16),
              children: const [
                _Rule(
                  'Renda',
                  '+1 moeda. Não pode ser bloqueada nem desafiada.',
                ),
                _Rule(
                  'Ajuda Externa',
                  '+2 moedas. Qualquer um pode bloquear dizendo ser Duque.',
                ),
                _Rule(
                  'Golpe de Estado',
                  'Paga 7 moedas e o alvo perde uma influência. Não pode ser bloqueado. Com 10+ moedas é obrigatório.',
                ),
                _Rule('Taxa (Duque)', '+3 moedas. Pode ser desafiada.'),
                _Rule(
                  'Extorsão (Capitão)',
                  'Rouba até 2 moedas. O alvo pode bloquear com Capitão ou Embaixador.',
                ),
                _Rule(
                  'Assassinato (Assassino)',
                  'Paga 3 moedas e o alvo perde uma influência. O alvo pode bloquear com Condessa.',
                ),
                _Rule(
                  'Troca (Embaixador)',
                  'Compra 2 cartas da Corte, escolhe quais manter e devolve o resto.',
                ),
              ],
            ),
            ListView(
              padding: const EdgeInsets.all(16),
              children: const [
                _Rule(
                  'Objetivo',
                  'Seja o último nobre com influência (cartas viradas para baixo).',
                ),
                _Rule(
                  'Início',
                  'Cada jogador recebe 2 cartas e 2 moedas. O baralho tem 3 cópias de cada personagem.',
                ),
                _Rule(
                  'Blefe',
                  'Você pode declarar qualquer personagem, mesmo sem tê-lo.',
                ),
                _Rule(
                  'Desafio',
                  'Qualquer um pode desafiar uma declaração. Se o desafiado tiver a carta, mostra, troca por outra da Corte e o desafiante perde uma influência. Se estava blefando, quem perde é ele e a ação é cancelada.',
                ),
                _Rule(
                  'Bloqueio',
                  'Bloqueios também são declarações de personagem e também podem ser desafiados.',
                ),
                _Rule(
                  'Perder influência',
                  'Quem perde influência escolhe qual carta revelar. Sem cartas, está fora.',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Rule extends StatelessWidget {
  const _Rule(this.title, this.body);
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            color: CoupColors.goldHigh,
            fontSize: 15,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          body,
          style: const TextStyle(color: CoupColors.textSecondary, height: 1.4),
        ),
      ],
    ),
  );
}
