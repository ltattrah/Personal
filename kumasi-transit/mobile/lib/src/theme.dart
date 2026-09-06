import 'package:flutter/material.dart';

const Color kBrandGreen = Color(0xFF0B6E4F);
const Color kFullRed = Color(0xFFB91C1C);

ThemeData buildTheme() => ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: kBrandGreen),
      // Large touch targets: the terminal app is used one-handed, outdoors, in a hurry.
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            textStyle: const TextStyle(fontSize: 18)),
      ),
      inputDecorationTheme:
          const InputDecorationTheme(border: OutlineInputBorder()),
    );
