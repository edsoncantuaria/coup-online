import 'package:flutter/material.dart';

import '../engine/models.dart';

/// Paleta "corte imperial" herdada do app original.
abstract final class CoupColors {
  static const background = Color(0xFF0B0F14);
  static const secondary = Color(0xFF121821);
  static const surface = Color(0xFF161D27);
  static const surfaceHigh = Color(0xFF1B2330);
  static const gold = Color(0xFFC6A15B);
  static const goldSoft = Color(0xFF8C6F3D);
  static const goldHigh = Color(0xFFE5C478);
  static const red = Color(0xFFA83A3A);
  static const redDeep = Color(0xFF6E1F1F);
  static const text = Color(0xFFEADDCA);
  static const textSecondary = Color(0xFFA1ADC1);
  static const textMuted = Color(0xFF6B7380);
  static const border = Color(0xFF2D333B);
  static const success = Color(0xFF4FA76A);
  static const error = Color(0xFFE5564E);
  static const bluff = Color(0xFF9B7BD4);
  static const info = Color(0xFF6EA3D8);
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
    Color(0xFF7A1F1F),
    Color(0xFF3F0A0A),
    Color(0xFFE7B197),
    Icons.account_balance,
  ),
  Role.assassin => const RoleStyle(
    Color(0xFF1F1730),
    Color(0xFF0D0618),
    Color(0xFFB39AD9),
    Icons.colorize,
  ),
  Role.captain => const RoleStyle(
    Color(0xFF1E3A52),
    Color(0xFF0A1624),
    Color(0xFF8FB8D8),
    Icons.anchor,
  ),
  Role.ambassador => const RoleStyle(
    Color(0xFF8C6F3D),
    Color(0xFF4A3A1E),
    Color(0xFFF2D68A),
    Icons.swap_horiz,
  ),
  Role.contessa => const RoleStyle(
    Color(0xFF3A3448),
    Color(0xFF1B1724),
    Color(0xFFDCD4E6),
    Icons.shield_moon,
  ),
};

String roleArt(Role r) => 'assets/cards/${r.name}.png';

ThemeData buildCoupTheme() {
  final base = ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    colorScheme: const ColorScheme.dark(
      primary: CoupColors.gold,
      onPrimary: Color(0xFF1A1206),
      secondary: CoupColors.red,
      surface: CoupColors.surface,
      onSurface: CoupColors.text,
      error: CoupColors.error,
    ),
    scaffoldBackgroundColor: CoupColors.background,
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(
      bodyColor: CoupColors.text,
      displayColor: CoupColors.text,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: CoupColors.background,
      foregroundColor: CoupColors.text,
      elevation: 0,
      centerTitle: true,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: CoupColors.surfaceHigh,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: CoupColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: CoupColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: CoupColors.gold),
      ),
      labelStyle: const TextStyle(color: CoupColors.textSecondary),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: CoupColors.gold,
        foregroundColor: const Color(0xFF1A1206),
        minimumSize: const Size(48, 48),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w800,
          letterSpacing: 1.2,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: CoupColors.text,
        minimumSize: const Size(48, 48),
        side: const BorderSide(color: CoupColors.goldSoft),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: CoupColors.surfaceHigh,
      selectedColor: CoupColors.gold.withValues(alpha: 0.25),
      checkmarkColor: CoupColors.goldHigh,
      side: const BorderSide(color: CoupColors.border),
      labelStyle: const TextStyle(color: CoupColors.text),
    ),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: CoupColors.surfaceHigh,
      contentTextStyle: TextStyle(color: CoupColors.text),
    ),
  );
}
