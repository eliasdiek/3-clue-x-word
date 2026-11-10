import 'dart:async';

import 'package:flutter/material.dart';

import '../data/repository.dart';
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
  await navigator.pushReplacement(MaterialPageRoute(builder: (_) => ScoreScreen(game: game, entry: entry)));
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
  const ScoreScreen({super.key, required this.game, required this.entry});

  final GameState game;
  final HistoryEntry entry;

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
