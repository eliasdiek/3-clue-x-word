import 'storage.dart';

/// The figures on the score screen, worked out from the games played on
/// this phone (oldest first).
class ScoreStats {
  const ScoreStats({
    required this.recentCount,
    required this.recentPercent,
    required this.recentPoints,
    required this.earlierPercents,
    required this.betterThan,
  });

  /// How many games the "last 5" average covers (fewer at the start).
  final int recentCount;

  /// Average percent and points over the last 5 games.
  final int recentPercent;
  final int recentPoints;

  /// Averages of the 5 games before those, then the 5 before that, ...
  /// (most recent first, at most [maxEarlier]). Shows improvement.
  final List<int> earlierPercents;

  /// "Better than N% of players". There is no shared scoreboard yet, so this
  /// is a flattering estimate from the player's own average (the client asked
  /// for it to be generous), not a real comparison.
  final int betterThan;

  /// Change since the previous 5 games, in percentage points.
  int? get change => earlierPercents.isEmpty ? null : recentPercent - earlierPercents.first;

  static const blockSize = 5;
  static const maxEarlier = 3;

  /// Null until a game has been played.
  static ScoreStats? from(List<HistoryEntry> history) {
    if (history.isEmpty) return null;
    final newestFirst = history.reversed.toList();
    final recent = newestFirst.take(blockSize).toList();
    final percent = _average(recent.map((h) => h.percent));
    final earlier = <int>[];
    for (var start = blockSize; earlier.length < maxEarlier && start + blockSize <= newestFirst.length; start += blockSize) {
      earlier.add(_average(newestFirst.skip(start).take(blockSize).map((h) => h.percent)));
    }
    return ScoreStats(
      recentCount: recent.length,
      recentPercent: percent,
      recentPoints: _average(recent.map((h) => h.score)),
      earlierPercents: earlier,
      betterThan: estimateBetterThan(percent),
    );
  }

  /// Generous on purpose: an average of 0% still beats 50% of players,
  /// 50% beats 78%, 80% beats 95%.
  static int estimateBetterThan(int averagePercent) => (50 + averagePercent * 0.56).round().clamp(50, 99);

  static int _average(Iterable<int> values) {
    final list = values.toList();
    return list.isEmpty ? 0 : (list.reduce((a, b) => a + b) / list.length).round();
  }
}
