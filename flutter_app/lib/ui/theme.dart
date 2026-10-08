import 'package:flutter/material.dart';

import '../engine/models.dart';

/// Mundo "novela das nove": preto de transmissão tingido de ameixa, closes
/// dos personagens, créditos em branco quente e um carmim reservado para o
/// gancho (desafio, perigo, ação principal).
abstract final class Tv {
  /// Fundo: preto de transmissão, puxado para o ameixa.
  static const ink = Color(0xFF0E0A0D);

  /// Superfícies (folhas, faixas de crédito).
  static const stage = Color(0xFF181116);
  static const stageHigh = Color(0xFF231920);

  /// Fio dos créditos e divisórias.
  static const rule = Color(0xFF3B2C35);

  /// Texto de crédito: principal, secundário e apagado.
  static const credit = Color(0xFFF3E9DF);
  static const creditDim = Color(0xFFBCA9B1);
  static const creditMuted = Color(0xFF94808A);

  /// O carmim do gancho: desafio, perigo e a ação principal da tela.
  static const carmine = Color(0xFFE3263F);
  static const carmineDeep = Color(0xFF6E0E1C);

  /// Moedas: o único dourado do mundo, só em números de moeda.
  static const coin = Color(0xFFE9B44C);

  /// Estados que precisam de cor própria.
  static const proven = Color(0xFF5FBF85);
  static const bluff = Color(0xFFB58CF0);
  static const cue = Color(0xFF7FB3E6);
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

/// Vozes tipográficas: Bodoni Moda (títulos e nomes, em itálico) e Archivo
/// Narrow (créditos, rótulos, números e texto corrido).
abstract final class TvType {
  static const serif = 'BodoniModa';
  static const sans = 'ArchivoNarrow';

  /// Cartão de título ("Intriga", "Capítulo 3").
  static TextStyle title(double size, {Color color = Tv.credit}) => TextStyle(
    fontFamily: serif,
    fontStyle: FontStyle.italic,
    fontWeight: FontWeight.w700,
    fontSize: size,
    height: 1.0,
    letterSpacing: -0.02 * size,
    color: color,
  );

  /// Nome de personagem ou jogador em crédito.
  static TextStyle name(double size, {Color color = Tv.credit}) => TextStyle(
    fontFamily: serif,
    fontStyle: FontStyle.italic,
    fontWeight: FontWeight.w500,
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
      primary: Tv.carmine,
      onPrimary: Tv.credit,
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
      cursorColor: Tv.carmine,
      selectionColor: Color(0x66E3263F),
      selectionHandleColor: Tv.carmine,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: Tv.ink,
      foregroundColor: Tv.credit,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TvType.title(22),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: Tv.stageHigh,
      border: UnderlineInputBorder(borderSide: BorderSide(color: Tv.rule)),
      enabledBorder: UnderlineInputBorder(
        borderSide: BorderSide(color: Tv.rule),
      ),
      focusedBorder: UnderlineInputBorder(
        borderSide: BorderSide(color: Tv.carmine, width: 2),
      ),
      labelStyle: TextStyle(color: Tv.creditDim),
      hintStyle: TextStyle(color: Tv.creditMuted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Tv.carmine,
        foregroundColor: Tv.credit,
        disabledBackgroundColor: Tv.stageHigh,
        disabledForegroundColor: Tv.creditMuted,
        minimumSize: const Size(48, 52),
        textStyle: TvType.credit(15, color: Tv.credit, weight: FontWeight.w700),
        shape: square,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Tv.credit,
        minimumSize: const Size(48, 52),
        side: const BorderSide(color: Tv.creditMuted),
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
          (s) => s.contains(WidgetState.selected) ? Tv.credit : Tv.stage,
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
      selectedColor: Tv.credit,
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
      activeTrackColor: Tv.carmine,
      inactiveTrackColor: Tv.rule,
      thumbColor: Tv.credit,
      overlayColor: Color(0x33E3263F),
      activeTickMarkColor: Tv.credit,
      inactiveTickMarkColor: Tv.creditMuted,
      valueIndicatorColor: Tv.carmine,
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
      titleTextStyle: TvType.title(24),
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
      indicatorColor: Tv.carmine,
      labelColor: Tv.credit,
      unselectedLabelColor: Tv.creditMuted,
      dividerColor: Tv.rule,
      labelStyle: TvType.credit(13, color: Tv.credit, weight: FontWeight.w700),
    ),
    dividerTheme: const DividerThemeData(color: Tv.rule, thickness: 1),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Tv.carmine),
  );
}
