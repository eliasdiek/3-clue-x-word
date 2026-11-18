import 'package:flutter_test/flutter_test.dart';
import 'package:three_clue_xword/data/stats.dart';
import 'package:three_clue_xword/data/storage.dart';

HistoryEntry game(int percent, {int n = 1}) => HistoryEntry(
      puzzleNumber: n,
      finishedAt: DateTime(2026, 11, n),
      score: percent * 2,
      maxScore: 200,
      percent: percent,
      gaveUp: false,
    );

void main() {
  test('nothing before the first game', () {
    expect(ScoreStats.from(const []), isNull);
  });

  test('averages the last 5 games, newest last in the history', () {
    final history = [for (final p in [10, 20, 60, 60, 60, 60, 60]) game(p)];
    final stats = ScoreStats.from(history)!;
    expect(stats.recentCount, 5);
    expect(stats.recentPercent, 60);
    expect(stats.recentPoints, 120);
    expect(stats.earlierPercents, isEmpty, reason: 'only 2 games before the last 5');
    expect(stats.change, isNull);
  });

  test('earlier blocks of 5 show improvement, most recent first', () {
    final history = [
      for (var i = 0; i < 5; i++) game(40),
      for (var i = 0; i < 5; i++) game(50),
      for (var i = 0; i < 5; i++) game(70),
    ];
    final stats = ScoreStats.from(history)!;
    expect(stats.recentPercent, 70);
    expect(stats.earlierPercents, [50, 40]);
    expect(stats.change, 20);
  });

  test('fewer than 5 games averages what there is', () {
    final stats = ScoreStats.from([game(30), game(50)])!;
    expect(stats.recentCount, 2);
    expect(stats.recentPercent, 40);
  });

  test('the players comparison is generous and stays in range', () {
    expect(ScoreStats.estimateBetterThan(0), 50);
    expect(ScoreStats.estimateBetterThan(50), 78);
    expect(ScoreStats.estimateBetterThan(100), 99);
  });

  test('the players line changes with the day of the week', () {
    expect(ScoreStats.betterThanLine(94, DateTime.sunday), ('Better than ', '94%', ' of players'));
    expect(ScoreStats.betterThanLine(94, DateTime.tuesday), ('You are in the top ', '6%', ' of players'));
    expect(ScoreStats.betterThanLine(94, DateTime.thursday).$1, isEmpty);
    final lines = {for (var d = 1; d <= 7; d++) ScoreStats.betterThanLine(94, d)};
    expect(lines, hasLength(7));
  });
}
