import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_clue_xword/data/api_client.dart';
import 'package:three_clue_xword/data/repository.dart';
import 'package:three_clue_xword/data/storage.dart';
import 'package:three_clue_xword/game/game_state.dart';
import 'package:three_clue_xword/game/models.dart';
import 'package:three_clue_xword/ui/finish_flow.dart';
import 'package:three_clue_xword/ui/history_screen.dart';
import 'package:three_clue_xword/ui/puzzle_screen.dart';
import 'package:three_clue_xword/ui/theme.dart';

/// Draws each screen at iPhone sizes. Any layout error (overflow, unbounded
/// height, ...) fails the test.
Puzzle sample() =>
    Puzzle.fromJson(jsonDecode(File('test/fixtures/sample_puzzle.json').readAsStringSync()) as Map<String, dynamic>);

const phones = {'iPhone SE': Size(375, 667), 'iPhone 15': Size(393, 852), 'iPhone 15 Pro Max': Size(430, 932)};

Future<GameRepository> repository() async {
  SharedPreferences.setMockInitialValues({});
  return GameRepository(api: ApiClient(baseUrl: 'http://test.invalid'), storage: await Storage.open());
}

Future<void> show(WidgetTester tester, Size size, Widget screen) async {
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: screen));
  await tester.pump();
}

void main() {
  for (final MapEntry(key: phone, value: size) in phones.entries) {
    group(phone, () {
      testWidgets('puzzle screen', (tester) async {
        final repo = await repository();
        await show(tester, size, PuzzleScreen(game: GameState.start(sample()), repository: repo));
        expect(find.text('Harder'), findsOneWidget);
        expect(find.text('Harder JEALOUSY'), findsOneWidget);
        expect(find.text('Show Me'), findsOneWidget);

        // Play a little: type, peek at an easier clue, switch direction.
        await tester.tap(find.text('Medium'));
        await tester.pump();
        expect(find.text('Medium JEALOUSY'), findsOneWidget);
        await tester.tap(find.text('J').last);
        await tester.pump();
        await tester.tap(find.text('Show Me'));
        await tester.pump();
        await tester.pump(const Duration(seconds: 3));
      });

      testWidgets('score screen', (tester) async {
        final game = GameState.start(sample());
        for (final c in 'JEALOUSY'.split('')) {
          game.type(c);
        }
        game.revealSolution();
        final entry = HistoryEntry(
          puzzleNumber: 7,
          finishedAt: DateTime(2026, 11, 9),
          score: game.score,
          maxScore: game.maxScore,
          percent: game.percent,
          gaveUp: true,
        );
        await show(tester, size, ScoreScreen(game: game, entry: entry));
        expect(find.text('${game.score}'), findsOneWidget);
      });

      testWidgets('my progress', (tester) async {
        final repo = await repository();
        await show(tester, size, HistoryScreen(storage: repo.storage));
        expect(find.textContaining('Finish a puzzle'), findsOneWidget);
      });
    });
  }
}
