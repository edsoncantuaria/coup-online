import 'package:flutter/material.dart';

import '../engine/models.dart';

/// Mundo "caixas de fósforo": a gaveta de caixinhas de clube noturno.
/// Fundo de gaveta preto, capas em vinho e verde-garrafa, letreiro em
/// dourado de hot stamping (só no que está escolhido ou é título), a lixa
/// cinza riscando as bordas e a cabeça vermelha do palito para o perigo.
abstract final class Tv {
  /// Fundo: o preto quente do fundo da gaveta.
  static const ink = Color(0xFF120E0C);

  /// Superfícies (folhas, forro da gaveta).
  static const stage = Color(0xFF1C1714);
  static const stageHigh = Color(0xFF26201B);

  /// Fios e divisórias.
  static const rule = Color(0xFF3A322B);

  /// Papel da capa: texto principal, secundário e apagado.
  static const credit = Color(0xFFEFE6D2);
  static const creditDim = Color(0xFFC2B6A0);
  static const creditMuted = Color(0xFF978B78);

  /// Capas de clube: vinho (ação principal) e verde-garrafa.
  static const oxblood = Color(0xFF6B1622);
  static const bottle = Color(0xFF1E3B2D);

  /// Dourado de hot stamping: títulos e o que está escolhido.
  static const foil = Color(0xFFD9B25A);

  /// A lixa: faixa cinza nas bordas das capas.
  static const striker = Color(0xFF5E5852);

  /// Cabeça do palito: desafio e perigo. Preenchimento (texto claro em
  /// cima passa de 4.5:1).
  static const carmine = Color(0xFFB8322A);

  /// Vermelho para texto sobre o fundo escuro.
  static const carmineText = Color(0xFFE8705F);
  static const carmineDeep = Color(0xFF5E1712);

  /// Palito queimado.
  static const char = Color(0xFF2B2420);

  /// Moedas.
  static const coin = Color(0xFFD9B25A);

  /// Estados que precisam de cor própria.
  static const proven = Color(0xFF6FBF8A);
  static const bluff = Color(0xFFB99AE8);
  static const cue = Color(0xFF8DB8E0);
}

/// Nomes antigos, mantidos enquanto as telas migram para [Tv].
abstract final class CoupColors {
  static const background = Tv.ink;
  static const secondary = Tv.stage;
  static const surface = Tv.stage;
  static const surfaceHigh = Tv.stageHigh;
  static const gold = Tv.credit;
  static const goldSoft = Tv.rule;
  static const goldHigh = Tv.credit;
  static const red = Tv.carmine;
  static const redDeep = Tv.carmineDeep;
  static const text = Tv.credit;
  static const textSecondary = Tv.creditDim;
  static const textMuted = Tv.creditMuted;
  static const border = Tv.rule;
  static const success = Tv.proven;
  static const error = Tv.carmine;
  static const bluff = Tv.bluff;
  static const info = Tv.cue;
}

/// Vozes tipográficas: Yellowtail (o letreiro de clube, só em títulos) e
/// Archivo Narrow (nomes, a linha da lixa em caixa alta, números e texto).
abstract final class TvType {
  static const script = 'Yellowtail';
  static const sans = 'ArchivoNarrow';

  /// Letreiro em script dourado ("Intriga", "Capítulo 3").
  static TextStyle title(double size, {Color color = Tv.foil}) =>
      TextStyle(fontFamily: script, fontSize: size, height: 1.05, color: color);

  /// Nome de jogador, ação ou item de menu.
  static TextStyle name(double size, {Color color = Tv.credit}) => TextStyle(
    fontFamily: sans,
    fontWeight: FontWeight.w700,
    fontSize: size,
    height: 1.1,
    color: color,
  );

  /// Linha de crédito em caixa alta ("COMO DUQUE", "CAPÍTULO 3 DE 7").
  static TextStyle credit(
    double size, {
    Color color = Tv.creditDim,
    FontWeight weight = FontWeight.w600,
  }) => TextStyle(
    fontFamily: sans,
    fontWeight: weight,
    fontSize: size,
    letterSpacing: 0.14 * size,
    height: 1.2,
    color: color,
  );

  /// Números (moedas, relógio): algarismos tabulares.
  static TextStyle figure(double size, {Color color = Tv.credit}) => TextStyle(
    fontFamily: sans,
    fontWeight: FontWeight.w700,
    fontSize: size,
    height: 1.0,
    color: color,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
}

class RoleStyle {
  const RoleStyle(this.top, this.bottom, this.accent, this.icon);
  final Color top;
  final Color bottom;
  final Color accent;
  final IconData icon;
}

RoleStyle roleStyle(Role r) => switch (r) {
  Role.duke => const RoleStyle(
    Color(0xFF5C1622),
    Color(0xFF22080D),
    Color(0xFFF0A08A),
    Icons.account_balance,
  ),
  Role.assassin => const RoleStyle(
    Color(0xFF2A1838),
    Color(0xFF0F0716),
    Color(0xFFC3A2EE),
    Icons.colorize,
  ),
  Role.captain => const RoleStyle(
    Color(0xFF173247),
    Color(0xFF08131D),
    Color(0xFF8EC2EA),
    Icons.anchor,
  ),
  Role.ambassador => const RoleStyle(
    Color(0xFF4B3A17),
    Color(0xFF1C1508),
    Color(0xFFEDC97A),
    Icons.swap_horiz,
  ),
  Role.contessa => const RoleStyle(
    Color(0xFF3A2234),
    Color(0xFF170C14),
    Color(0xFFF0B9D9),
    Icons.shield_moon,
  ),
};

String roleArt(Role r) => 'assets/cards/${r.name}.png';

ThemeData buildCoupTheme() {
  final base = ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    fontFamily: TvType.sans,
    colorScheme: const ColorScheme.dark(
      primary: Tv.foil,
      onPrimary: Tv.ink,
      secondary: Tv.credit,
      onSecondary: Tv.ink,
      surface: Tv.stage,
      onSurface: Tv.credit,
      onSurfaceVariant: Tv.creditDim,
      surfaceContainerHighest: Tv.stageHigh,
      outline: Tv.rule,
      outlineVariant: Tv.rule,
      error: Tv.carmine,
    ),
    scaffoldBackgroundColor: Tv.ink,
    splashFactory: InkSparkle.splashFactory,
  );
  final square = RoundedRectangleBorder(borderRadius: BorderRadius.circular(4));
  return base.copyWith(
    textTheme: base.textTheme.apply(
      bodyColor: Tv.credit,
      displayColor: Tv.credit,
      fontFamily: TvType.sans,
    ),
    textSelectionTheme: const TextSelectionThemeData(
      cursorColor: Tv.foil,
      selectionColor: Color(0x66D9B25A),
      selectionHandleColor: Tv.foil,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: Tv.ink,
      foregroundColor: Tv.credit,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TvType.title(28),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: Tv.stageHigh,
      border: UnderlineInputBorder(borderSide: BorderSide(color: Tv.rule)),
      enabledBorder: UnderlineInputBorder(
        borderSide: BorderSide(color: Tv.rule),
      ),
      focusedBorder: UnderlineInputBorder(
        borderSide: BorderSide(color: Tv.foil, width: 2),
      ),
      labelStyle: TextStyle(color: Tv.creditDim),
      hintStyle: TextStyle(color: Tv.creditMuted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Tv.oxblood,
        foregroundColor: Tv.foil,
        disabledBackgroundColor: Tv.stageHigh,
        disabledForegroundColor: Tv.creditMuted,
        minimumSize: const Size(48, 52),
        textStyle: TvType.credit(15, color: Tv.foil, weight: FontWeight.w700),
        shape: square,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Tv.credit,
        minimumSize: const Size(48, 52),
        side: const BorderSide(color: Tv.striker, width: 1.5),
        textStyle: TvType.credit(15, color: Tv.credit, weight: FontWeight.w700),
        shape: square,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: Tv.credit,
        minimumSize: const Size(48, 48),
        textStyle: TvType.credit(14, color: Tv.credit, weight: FontWeight.w700),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        shape: WidgetStatePropertyAll(square),
        side: const WidgetStatePropertyAll(BorderSide(color: Tv.rule)),
        backgroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Tv.foil : Tv.stage,
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Tv.ink : Tv.creditDim,
        ),
        textStyle: WidgetStatePropertyAll(
          TvType.credit(13, weight: FontWeight.w700),
        ),
        minimumSize: const WidgetStatePropertyAll(Size(48, 48)),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Tv.stage,
      selectedColor: Tv.foil,
      checkmarkColor: Tv.ink,
      side: const BorderSide(color: Tv.rule),
      shape: square,
      labelStyle: WidgetStateTextStyle.resolveWith(
        (s) => TextStyle(
          fontFamily: TvType.sans,
          fontWeight: FontWeight.w600,
          color: s.contains(WidgetState.selected) ? Tv.ink : Tv.credit,
        ),
      ),
    ),
    sliderTheme: const SliderThemeData(
      activeTrackColor: Tv.foil,
      inactiveTrackColor: Tv.rule,
      thumbColor: Tv.credit,
      overlayColor: Color(0x33D9B25A),
      activeTickMarkColor: Tv.credit,
      inactiveTickMarkColor: Tv.creditMuted,
      valueIndicatorColor: Tv.oxblood,
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Tv.stage,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Tv.stage,
      surfaceTintColor: Colors.transparent,
      shape: square,
      titleTextStyle: TvType.title(30),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: Tv.credit,
      contentTextStyle: const TextStyle(
        fontFamily: TvType.sans,
        fontWeight: FontWeight.w600,
        color: Tv.ink,
      ),
      shape: square,
    ),
    tabBarTheme: TabBarThemeData(
      indicatorColor: Tv.foil,
      labelColor: Tv.credit,
      unselectedLabelColor: Tv.creditMuted,
      dividerColor: Tv.rule,
      labelStyle: TvType.credit(13, color: Tv.credit, weight: FontWeight.w700),
    ),
    dividerTheme: const DividerThemeData(color: Tv.rule, thickness: 1),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Tv.foil),
  );
}
