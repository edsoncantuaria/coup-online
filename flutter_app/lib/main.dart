import 'package:flutter/material.dart';

import 'ui/screens/home_screen.dart';
import 'ui/theme.dart';

void main() => runApp(const CoupApp());

class CoupApp extends StatelessWidget {
  const CoupApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Coup',
    debugShowCheckedModeBanner: false,
    theme: buildCoupTheme(),
    home: const HomeScreen(),
  );
}
