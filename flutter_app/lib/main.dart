import 'package:flutter/material.dart';

import 'branding.dart';
import 'ui/screens/home_screen.dart';
import 'ui/theme.dart';

void main() => runApp(const CoupApp());

class CoupApp extends StatelessWidget {
  const CoupApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: appName,
    debugShowCheckedModeBanner: false,
    theme: buildCoupTheme(),
    home: const HomeScreen(),
  );
}
