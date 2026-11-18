import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_clue_xword/data/api_client.dart';
import 'package:three_clue_xword/data/repository.dart';
import 'package:three_clue_xword/data/storage.dart';
import 'package:three_clue_xword/game/game_state.dart';
import 'package:three_clue_xword/game/models.dart';
import 'package:three_clue_xword/ui/finish_flow.dart';
import 'package:three_clue_xword/ui/history_screen.dart';
import 'package:three_clue_xword/ui/info_screen.dart';
import 'package:three_clue_xword/ui/puzzle_screen.dart';
import 'package:three_clue_xword/ui/sounds.dart';
import 'package:three_clue_xword/ui/theme.dart';
import 'package:three_clue_xword/ui/widgets/clue_bar.dart';
import 'package:three_clue_xword/ui/widgets/crossword_grid.dart';

/// Draws each screen at iPhone sizes. Any layout error (overflow, unbounded
/// height, ...) fails the test.
Puzzle sample() =>
    Puzzle.fromJson(jsonDecode(File('test/fixtures/sample_puzzle.json').readAsStringSync()) as Map<String, dynamic>);

const phones = {'iPhone SE': Size(375, 667), 'iPhone 15': Size(393, 852), 'iPhone 15 Pro Max': Size(430, 932)};

Future<GameRepository> repository() async {
  SharedPreferences.setMockInitialValues({});
  return GameRepository(api: ApiClient(baseUrl: 'http://test.invalid'), storage: await Storage.open());
}

/// The space the clue text gets inside the clue bar (the text itself is
/// centred in it and can be smaller).
Size clueSpace(WidgetTester tester) =>
    tester.getSize(find.ancestor(of: find.byType(FittingText), matching: find.byType(Center)).first);

Future<void> show(WidgetTester tester, Size size, Widget screen) async {
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: screen));
  await tester.pump();
}

void main() {
  setUpAll(() => Sounds.enabled = false); // no audio device in tests

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
        final history = [for (final p in [40, 45, 50, 55, 60, 62, 64, 66, 68]) HistoryEntry(puzzleNumber: p, finishedAt: DateTime(2026, 11, 9), score: p, maxScore: 100, percent: p, gaveUp: false), entry];
        await show(tester, size, ScoreScreen(game: game, entry: entry, history: history, weekday: DateTime.tuesday));
        expect(find.textContaining('Your Score:', findRichText: true), findsOneWidget);
        expect(find.textContaining('Maximum: ${game.maxScore}', findRichText: true), findsOneWidget);
        expect(find.text('Show Me'), findsOneWidget);
        await tester.scrollUntilVisible(find.text('Next puzzle'), 200, scrollable: find.byType(Scrollable).first);
        expect(find.text('Your last 5 games\naveraged'), findsOneWidget);
        expect(find.textContaining('You are in the top', findRichText: true), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('completed page leads to the score', (tester) async {
        final repo = await repository();
        final game = GameState.start(sample())..revealSolution();
        final entry = await repo.finish(game);
        await show(tester, size, CompletedScreen(game: game, entry: entry, repository: repo));
        expect(find.text('Next puzzle'), findsNothing, reason: 'one way on: See your score');
        await tester.tap(find.text('See your score'));
        await tester.pumpAndSettle();
        expect(find.textContaining('Your Score:', findRichText: true), findsOneWidget);
      });

      testWidgets('a 50-character clue fits without breaking words or moving the grid', (tester) async {
        final repo = await repository();
        final game = GameState.start(sample());
        await show(tester, size, PuzzleScreen(game: game, repository: repo));
        final gridBefore = tester.getRect(find.byType(CrosswordGrid));
        final clueBox = clueSpace(tester);
        // A long clue: the box keeps its size and the text fits inside it.
        const long = 'Geological age of reptiles and early mammal kinds.'; // 50 characters
        expect(long.length, 50);
        await tester.pumpWidget(
          MaterialApp(
            theme: buildTheme(),
            home: Scaffold(
              body: Center(
                child: SizedBox(
                  width: clueBox.width,
                  height: clueBox.height,
                  child: const FittingText(long, style: TextStyle(fontWeight: FontWeight.w600, height: 1.2), maxFontSize: 18, minFontSize: 12),
                ),
              ),
            ),
          ),
        );
        final paragraph = tester.renderObject<RenderParagraph>(find.text(long));
        expect(paragraph.didExceedMaxLines, isFalse);
        expect(paragraph.size.height, lessThanOrEqualTo(clueBox.height));
        expect(tester.takeException(), isNull);
        expect(gridBefore.width, greaterThan(size.width * (size.height < 700 ? 0.68 : 0.85)), reason: 'the grid fills most of the width');
      });

      testWidgets('the whole clue shows even when the theme draws wider text', (tester) async {
        // John, 18 Nov: clues that lost their last word on the iPhone
        // (HEAVE 23a Medium, 30a WHO).
        final repo = await repository();
        await show(tester, size, PuzzleScreen(game: GameState.start(sample()), repository: repo));
        final box = clueSpace(tester);
        expect(box.height, greaterThan(50), reason: 'measures the space, not the text');
        for (final (clue, spacing) in [
          for (final c in ['A Period of time with a unique feature', 'Acronym for World Health Organisation'])
            for (final s in [0.0, 0.5, 1.5]) (c, s),
        ]) {
          await tester.pumpWidget(
            MaterialApp(
              theme: buildTheme(),
              home: Scaffold(
                body: Center(
                  child: DefaultTextStyle.merge(
                    style: TextStyle(letterSpacing: spacing),
                    child: SizedBox(
                      width: box.width,
                      height: box.height,
                      child: FittingText(clue, style: TextStyle(fontWeight: FontWeight.w600, height: 1.2), maxFontSize: 18, minFontSize: 12),
                    ),
                  ),
                ),
              ),
            ),
          );
          final paragraph = tester.renderObject<RenderParagraph>(find.text(clue));
          expect(paragraph.didExceedMaxLines, isFalse, reason: '$clue, letterSpacing $spacing');
          // Lay the drawn text out again, unclipped: it must fit the box.
          final painter = TextPainter(text: paragraph.text, textDirection: TextDirection.ltr, textScaler: paragraph.textScaler, textAlign: TextAlign.center)
            ..layout(maxWidth: box.width);
          expect(painter.height, lessThanOrEqualTo(box.height), reason: '$clue, letterSpacing $spacing');
          painter.dispose();
        }
      });

      testWidgets('info page', (tester) async {
        await show(tester, size, const InfoScreen());
        expect(find.text('BACK'), findsOneWidget);
        expect(find.text('Welcome to 3-Clue X-Word'), findsOneWidget);
      });

      testWidgets('my progress', (tester) async {
        final repo = await repository();
        await show(tester, size, HistoryScreen(storage: repo.storage));
        expect(find.textContaining('Finish a puzzle'), findsOneWidget);
      });
    });
  }
}
