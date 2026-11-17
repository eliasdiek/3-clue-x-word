import 'dart:async';

import 'package:flutter/material.dart';

import '../data/repository.dart';
import '../data/stats.dart';
import '../data/storage.dart';
import '../game/game_state.dart';
import '../game/models.dart';
import 'theme.dart';
import 'widgets/brand.dart';
import 'widgets/crossword_grid.dart';

/// Finishing a puzzle: records it, plays the ad break, then shows the score
/// screen. (The specification: "the App goes immediately to an
/// advertisement. When the ad is completed, the App returns to the progress
/// summary screen.")
Future<void> showFinish(BuildContext context, {required GameState game, required GameRepository repository}) async {
  final entry = await repository.finish(game);
  if (!context.mounted) return;
  final navigator = Navigator.of(context);
  await navigator.push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const AdBreakScreen()));
  await navigator.pushReplacement(MaterialPageRoute(builder: (_) => ScoreScreen(game: game, entry: entry, history: repository.storage.history)));
}

/// Placeholder for the ad break. Real ads (e.g. Google AdMob) need John's
/// ad account; until then this shows for a few seconds.
class AdBreakScreen extends StatefulWidget {
  const AdBreakScreen({super.key, this.seconds = 5});

  final int seconds;

  @override
  State<AdBreakScreen> createState() => _AdBreakScreenState();
}

class _AdBreakScreenState extends State<AdBreakScreen> {
  late int _left = widget.seconds;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_left <= 1) {
        t.cancel();
        if (mounted) Navigator.of(context).pop();
      } else {
        setState(() => _left--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: AppColors.navy,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.campaign_rounded, color: Colors.white54, size: 64),
              const SizedBox(height: 16),
              const Text('Advertisement', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text('Your score is ready in $_left…', style: const TextStyle(color: Colors.white70, fontSize: 17)),
            ],
          ),
        ),
      ),
    );
  }
}

/// The scoring screen: the finished grid in the colours of the clues used,
/// and the score (7 / 5 / 3 / 0 points per letter).
class ScoreScreen extends StatelessWidget {
  const ScoreScreen({super.key, required this.game, required this.entry, this.history = const []});

  final GameState game;
  final HistoryEntry entry;

  /// Every game played on this phone, oldest first (including this one).
  final List<HistoryEntry> history;

  @override
  Widget build(BuildContext context) {
    final byLevel = game.lettersByLevel;
    final rows = <(String, Color, int, int)>[
      for (final level in ClueLevel.values) (level.label, AppColors.fill(level), byLevel[level] ?? 0, level.points),
      ('Shown / given', AppColors.square, byLevel[null] ?? 0, 0),
    ];

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          children: [
            const Center(child: BrandLogo(height: 44)),
            const SizedBox(height: 12),
            Text(
              game.gaveUp ? 'Puzzle #${game.puzzle.puzzleNumber}' : 'Puzzle #${game.puzzle.puzzleNumber} complete!',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: AppColors.navy),
            ),
            const SizedBox(height: 16),
            CrosswordGrid(game: game, highlightCurrent: false),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.line)),
              child: Column(
                children: [
                  Text('${entry.score}', style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w900, color: AppColors.navy)),
                  Text(
                    'points out of ${entry.maxScore} (${entry.percent}%)',
                    style: const TextStyle(fontSize: 17, color: AppColors.inkMuted),
                  ),
                  const SizedBox(height: 14),
                  for (final (label, color, count, points) in rows)
                    if (count > 0)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            Container(
                              width: 22,
                              height: 22,
                              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(5), border: Border.all(color: AppColors.gridLine)),
                            ),
                            const SizedBox(width: 10),
                            Expanded(child: Text('$label: $count letter${count == 1 ? '' : 's'}', style: const TextStyle(fontSize: 16))),
                            Text('${count * points} pts', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                ],
              ),
            ),
            if (ScoreStats.from(history) case final stats?) ...[
              const SizedBox(height: 16),
              _AveragesCard(stats: stats),
            ],
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.play_arrow_rounded),
              label: const Text('Next puzzle'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Average of the last 5 games, how it compares with other players, and the
/// averages of the 5 games before (to show improvement).
class _AveragesCard extends StatelessWidget {
  const _AveragesCard({required this.stats});

  final ScoreStats stats;

  @override
  Widget build(BuildContext context) {
    final change = stats.change;
    final title = stats.recentCount == 1
        ? 'Your first game'
        : stats.recentCount < ScoreStats.blockSize
            ? 'Your last ${stats.recentCount} games'
            : 'Your last 5 games';

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(18)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy)),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${stats.recentPercent}%', style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w900, color: AppColors.brand, height: 1)),
              const SizedBox(width: 10),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    stats.recentCount == 1 ? '${stats.recentPoints} points' : 'average · ${stats.recentPoints} points a game',
                    style: const TextStyle(fontSize: 15, color: AppColors.inkMuted),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(Icons.emoji_events_rounded, color: Color(0xFFE0A100), size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Better than ${stats.betterThan}% of players',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.navy),
                ),
              ),
            ],
          ),
          if (change != null) ...[
            const SizedBox(height: 14),
            Text(
              change > 0
                  ? 'Up $change% on your 5 games before. Great progress!'
                  : change == 0
                      ? 'The same as your 5 games before.'
                      : 'Down ${-change}% on your 5 games before.',
              style: const TextStyle(fontSize: 15, color: AppColors.ink),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                // Oldest on the left, so the row reads like a progress line.
                for (final (i, percent) in stats.earlierPercents.reversed.indexed)
                  _AverageChip(label: _blockLabel(stats.earlierPercents.length - i), percent: percent),
                _AverageChip(label: 'Last 5', percent: stats.recentPercent, current: true),
              ],
            ),
          ],
        ],
      ),
    );
  }

  static String _blockLabel(int blocksBack) => const ['Previous 5', '5 before that', 'Earlier 5'][blocksBack - 1];
}

class _AverageChip extends StatelessWidget {
  const _AverageChip({required this.label, required this.percent, this.current = false});

  final String label;
  final int percent;
  final bool current;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: current ? AppColors.brand : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: current ? AppColors.brand : AppColors.line),
      ),
      child: Column(
        children: [
          Text('$percent%', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: current ? Colors.white : AppColors.navy)),
          Text(label, style: TextStyle(fontSize: 12, color: current ? Colors.white70 : AppColors.inkMuted)),
        ],
      ),
    );
  }
}
