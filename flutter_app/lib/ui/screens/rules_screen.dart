import 'package:flutter/material.dart';

import '../../engine/labels.dart';
import '../../engine/models.dart';
import '../theme.dart';
import '../widgets/tv.dart';

/// Regras em três abas. O elenco aparece em closes com o crédito de cada
/// personagem; ações e fundamentos são linhas de crédito.
class RulesScreen extends StatelessWidget {
  const RulesScreen({super.key});

  /// Ação do personagem (nome, efeito) e o que ele bloqueia.
  static const _cast = <Role, (String, String?, String?)>{
    Role.duke: ('Taxar', 'Recebe 3 moedas.', 'Ajuda Externa.'),
    Role.assassin: (
      'Assassinar',
      'Paga 3 moedas e elimina 1 carta do alvo.',
      null,
    ),
    Role.captain: (
      'Extorquir',
      'Rouba até 2 moedas de outro jogador.',
      'Extorsão.',
    ),
    Role.ambassador: (
      'Trocar',
      'Compra 2 cartas da Corte e devolve 2.',
      'Extorsão.',
    ),
    Role.contessa: ('Sem ação própria', null, 'Assassinato.'),
  };

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Regras'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'CARTAS'),
              Tab(text: 'AÇÕES'),
              Tab(text: 'COMO JOGAR'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _Page(
              children: [
                for (final e in _cast.entries)
                  _CastEntry(
                    role: e.key,
                    action: e.value.$1,
                    effect: e.value.$2,
                    blocks: e.value.$3,
                  ),
              ],
            ),
            const _Page(
              children: [
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
                  'Paga 7 moedas e o alvo perde uma influência. Não pode ser '
                      'bloqueado. Com 10+ moedas é obrigatório.',
                ),
                _Rule('Taxa', '+3 moedas. Pode ser desafiada.', by: 'Duque'),
                _Rule(
                  'Extorsão',
                  'Rouba até 2 moedas. O alvo pode bloquear com Capitão ou '
                      'Embaixador.',
                  by: 'Capitão',
                ),
                _Rule(
                  'Assassinato',
                  'Paga 3 moedas e o alvo perde uma influência. O alvo pode '
                      'bloquear com Condessa.',
                  by: 'Assassino',
                ),
                _Rule(
                  'Troca',
                  'Compra 2 cartas da Corte, escolhe quais manter e devolve '
                      'o resto.',
                  by: 'Embaixador',
                ),
              ],
            ),
            const _Page(
              children: [
                _Rule(
                  'Objetivo',
                  'Seja o último nobre com influência (cartas viradas para '
                      'baixo).',
                ),
                _Rule(
                  'Início',
                  'Cada jogador recebe 2 cartas e 2 moedas. O baralho tem 3 '
                      'cópias de cada personagem.',
                ),
                _Rule(
                  'Blefe',
                  'Você pode declarar qualquer personagem, mesmo sem tê-lo.',
                ),
                _Rule(
                  'Desafio',
                  'Qualquer um pode desafiar uma declaração. Se o desafiado '
                      'tiver a carta, mostra, troca por outra da Corte e o '
                      'desafiante perde uma influência. Se estava blefando, '
                      'quem perde é ele e a ação é cancelada.',
                ),
                _Rule(
                  'Bloqueio',
                  'Bloqueios também são declarações de personagem e também '
                      'podem ser desafiados.',
                ),
                _Rule(
                  'Perder influência',
                  'Quem perde influência escolhe qual carta revelar. Sem '
                      'cartas, está fora.',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Coluna de leitura, centrada e com largura de texto.
class _Page extends StatelessWidget {
  const _Page({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => ListView(
    padding: EdgeInsets.fromLTRB(
      0,
      8,
      0,
      32 + MediaQuery.paddingOf(context).bottom,
    ),
    children: [
      Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
        ),
      ),
    ],
  );
}

/// Um personagem do elenco: close no rosto com o crédito em "lower third" e,
/// embaixo, o que ele faz e o que bloqueia.
class _CastEntry extends StatelessWidget {
  const _CastEntry({
    required this.role,
    required this.action,
    required this.effect,
    required this.blocks,
  });
  final Role role;
  final String action;
  final String? effect;
  final String? blocks;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 16, bottom: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 188,
          child: Stack(
            fit: StackFit.expand,
            children: [
              CloseUp(role: role),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Tv.ink.withValues(alpha: 0.0), Tv.ink],
                    stops: const [0.35, 1],
                  ),
                ),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 12,
                child: LowerThird(
                  name: roleLabel(role),
                  role: action,
                  roleColor: roleStyle(role).accent,
                  nameSize: 28,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (effect != null) _Row('AÇÃO', effect!),
        if (blocks != null) _Row('BLOQUEIA', blocks!),
      ],
    ),
  );
}

/// Linha de ficha técnica: rótulo em caixa alta à esquerda, texto à direita.
class _Row extends StatelessWidget {
  const _Row(this.label, this.text);
  final String label;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        SizedBox(
          width: 96,
          child: Text(label, style: TvType.credit(11, color: Tv.creditMuted)),
        ),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 16, height: 1.4, color: Tv.credit),
          ),
        ),
      ],
    ),
  );
}

/// Regra como linha de crédito: título em itálico, texto e o fio embaixo.
class _Rule extends StatelessWidget {
  const _Rule(this.title, this.body, {this.by});
  final String title;
  final String body;

  /// Personagem que declara a ação, quando há.
  final String? by;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 16),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Tv.rule)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 10,
          crossAxisAlignment: WrapCrossAlignment.end,
          children: [
            Text(title, style: TvType.name(23)),
            if (by != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(
                  'COMO ${by!.toUpperCase()}',
                  style: TvType.credit(11),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          body,
          style: const TextStyle(
            fontSize: 15,
            height: 1.45,
            color: Tv.creditDim,
          ),
        ),
      ],
    ),
  );
}
