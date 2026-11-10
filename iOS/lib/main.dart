import 'package:flutter/material.dart';

import 'data/api_client.dart';
import 'data/repository.dart';
import 'data/storage.dart';
import 'ui/opening_screen.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final storage = await Storage.open();
  final repository = GameRepository(api: ApiClient(), storage: storage);
  runApp(ThreeClueApp(repository: repository));
}

class ThreeClueApp extends StatelessWidget {
  const ThreeClueApp({super.key, required this.repository});

  final GameRepository repository;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '3-Clue X-Word',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: OpeningScreen(repository: repository),
    );
  }
}
