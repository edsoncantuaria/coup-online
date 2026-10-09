import 'package:flutter/material.dart';

import 'branding.dart';
import 'ui/screens/home_screen.dart';
import 'ui/sounds.dart';
import 'ui/theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  Sounds.instance.load();
  runApp(const CoupApp());
}

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
