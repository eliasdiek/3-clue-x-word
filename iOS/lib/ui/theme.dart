import 'package:flutter/material.dart';

import '../game/models.dart';

/// Brand colours, matching the admin website's theme tokens.
abstract final class AppColors {
  static const navy = Color(0xFF1D2D59);
  static const brand = Color(0xFF6426CC);
  static const brandSoft = Color(0xFFEFE8FC);
  static const canvas = Color(0xFFF7F8FF);
  static const ink = Color(0xFF17204D);
  static const inkMuted = Color(0xFF545D8A);
  static const line = Color(0xFFE2E4F4);

  /// Square fills, per the specification: Harder yellow/orange, Medium pink,
  /// Easier blue; white for unused squares and Show Me letters.
  static const harder = Color(0xFFFFD95A);
  static const medium = Color(0xFFF9B8DE);
  static const easier = Color(0xFFA9D6FF);
  static const showMe = Color(0xFFD5D8E3); // the grey Show Me tab
  static const square = Colors.white;
  static const block = Color(0xFF151A33);

  /// Letters: red while being tried, black once the word is right.
  static const redLetter = Color(0xFFD7262E);
  static const blackLetter = Color(0xFF111111);
  static const gridLine = Color(0xFF9AA0C8);

  static Color fill(ClueLevel? level) => switch (level) {
        ClueLevel.harder => harder,
        ClueLevel.medium => medium,
        ClueLevel.easier => easier,
        null => square,
      };

  /// The same colours, faint, for the grid squares (the client: "quite
  /// faint is fine", so the letters stand out). The clue tabs stay strong.
  static Color gridFill(ClueLevel? level) => level == null ? square : Color.lerp(square, fill(level), 0.42)!;

  /// The outline round the word being solved, and the current square.
  static const wordOutline = Colors.white;
  static const wordOutlineEdge = navy;

  /// A stronger shade for tab borders and text on a level colour.
  static Color strong(ClueLevel level) => switch (level) {
        ClueLevel.harder => const Color(0xFF8A5A00),
        ClueLevel.medium => const Color(0xFF8A1E63),
        ClueLevel.easier => const Color(0xFF0F4A80),
      };
}

/// Grid letters use Arial Rounded MT Bold (built into iOS), as the client
/// asked: rounded letters with no tails beyond the square. Numbers use Arial.
abstract final class AppFonts {
  static const gridLetters = 'Arial Rounded MT Bold';
  static const gridNumbers = 'Arial';
  static const fallback = ['Helvetica Neue', 'Arial', 'sans-serif'];
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(seedColor: AppColors.brand, primary: AppColors.brand, surface: Colors.white),
    scaffoldBackgroundColor: AppColors.canvas,
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: AppColors.ink, displayColor: AppColors.navy),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 52),
        textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 52),
        foregroundColor: AppColors.navy,
        textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        side: const BorderSide(color: AppColors.line, width: 2),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    ),
  );
}
