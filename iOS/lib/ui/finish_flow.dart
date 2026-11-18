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

/// Finishing a puzzle: records it, plays the ad break, then shows the
/// Completed page ("See your score" leads on to the Score Summary page).
///
/// The result is kept until the player taps Next puzzle, so if they leave
/// the app during the ad (or later) the Completed page shows again when
/// they come back (see [showUnclosedResult]).
Future<void> showFinish(BuildContext context, {required GameState game, required GameRepository repository}) async {
  final entry = await repository.finish(game);
  if (!context.mounted) return;
  final navigator = Navigator.of(context);
  await navigator.push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const AdBreakScreen()));
  await navigator.pushReplacement(
    MaterialPageRoute(builder: (_) => CompletedScreen(game: game, entry: entry, repository: repository)),
  );
}

/// On opening the app: the Completed page of a puzzle finished last time,
/// if the player never got as far as Next puzzle.
Future<void> showUnclosedResult(BuildContext context, GameRepository repository) async {
  final result = repository.unclosedResult();
  if (result == null) return;
  await Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => CompletedScreen(game: result.game, entry: result.entry, repository: repository)),
  );
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

/// The Completed page: the finished grid in the colours of the clues used,
/// and one way on, "See your score".
class CompletedScreen extends StatelessWidget {
  const CompletedScreen({super.key, required this.game, required this.entry, required this.repository});

  final GameState game;
  final HistoryEntry entry;
  final GameRepository repository;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false, // the button is the only way on
      child: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            child: Column(
              children: [
                const BrandLogo(height: 44),
                const SizedBox(height: 12),
                Text(
                  game.gaveUp ? 'Puzzle #${game.puzzle.puzzleNumber}' : 'Puzzle #${game.puzzle.puzzleNumber} complete!',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: AppColors.navy),
                ),
                const SizedBox(height: 16),
                Expanded(child: Center(child: CrosswordGrid(game: game, highlightCurrent: false))),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(64, 64),
                      textStyle: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                    ),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ScoreScreen(game: game, entry: entry, history: repository.storage.history, repository: repository),
                      ),
                    ),
                    child: const FittedBox(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [Text('See your score'), SizedBox(width: 10), Icon(Icons.arrow_forward_rounded, size: 26)],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The Score Summary page: the score, how it was made (7 / 5 / 3 / 0 points
/// per square), and the average of the last games.
class ScoreScreen extends StatelessWidget {
  const ScoreScreen({super.key, required this.game, required this.entry, this.history = const [], this.repository, this.weekday});

  final GameState game;
  final HistoryEntry entry;

  /// Every game played on this phone, oldest first (including this one).
  final List<HistoryEntry> history;

  /// Closes the result on Next puzzle (null in tests).
  final GameRepository? repository;

  /// Picks the day's "better than" wording (default: today).
  final int? weekday;

  Future<void> _next(BuildContext context) async {
    await repository?.closeResult();
    if (context.mounted) Navigator.of(context).popUntil((route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final byLevel = game.lettersByLevel;
    final rows = <(String, Color, int, int)>[
      for (final level in ClueLevel.values) (level.label, AppColors.fill(level), level.points, byLevel[level] ?? 0),
      ('Show Me', AppColors.square, 0, byLevel[null] ?? 0),
    ];
    final stats = ScoreStats.from(history);

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          children: [
            const Center(child: BrandLogo(height: 40)),
            const SizedBox(height: 16),
            Text.rich(
              TextSpan(
                text: 'Your Score:  ',
                children: [
                  TextSpan(
                    text: '${entry.score}',
                    style: const TextStyle(fontWeight: FontWeight.w900, decoration: TextDecoration.underline, decorationThickness: 2),
                  ),
                ],
              ),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w600, color: AppColors.navy),
            ),
            const SizedBox(height: 6),
            Text.rich(
              TextSpan(
                text: 'Maximum: ',
                children: [
                  TextSpan(text: '${entry.maxScore}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                  const TextSpan(text: '  (you scored '),
                  TextSpan(text: '${entry.percent}%', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                  const TextSpan(text: ')'),
                ],
              ),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18, color: AppColors.ink),
            ),
            const SizedBox(height: 18),
            _ScoreTable(rows: rows),
            if (stats != null) ...[
              const SizedBox(height: 20),
              _AveragesCard(stats: stats, weekday: weekday ?? DateTime.now().weekday),
            ],
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () => _next(context),
              icon: const Icon(Icons.play_arrow_rounded),
              label: const Text('Next puzzle'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Colour, clue, points per square, squares, total: one level line each.
class _ScoreTable extends StatelessWidget {
  const _ScoreTable({required this.rows});

  /// (name, colour, points per square, squares)
  final List<(String, Color, int, int)> rows;

  @override
  Widget build(BuildContext context) {
    const label = TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.navy);
    const plain = TextStyle(fontSize: 16, color: AppColors.ink);
    const total = TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.navy);
    Widget cell(Widget child, {Alignment align = Alignment.centerLeft}) =>
        Container(height: 40, alignment: align, padding: const EdgeInsets.symmetric(horizontal: 4), child: child);

    return Table(
      columnWidths: const {
        0: FixedColumnWidth(36),
        1: FlexColumnWidth(),
        2: IntrinsicColumnWidth(),
        3: IntrinsicColumnWidth(),
        4: FixedColumnWidth(64),
      },
      defaultVerticalAlignment: TableCellVerticalAlignment.middle,
      children: [
        for (final (name, colour, points, count) in rows)
          TableRow(
            children: [
              cell(
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(color: colour, borderRadius: BorderRadius.circular(6), border: Border.all(color: AppColors.gridLine)),
                ),
              ),
              cell(FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(name, style: label))),
              cell(Text(points == 1 ? '1 point' : '$points points', style: plain)),
              cell(Text('× $count', style: plain)),
              cell(Text('${points * count}', style: total), align: Alignment.centerRight),
            ],
          ),
      ],
    );
  }
}

/// The mauve card: the average of the last (up to) 5 games and how it
/// compares with other players.
class _AveragesCard extends StatelessWidget {
  const _AveragesCard({required this.stats, required this.weekday});

  final ScoreStats stats;
  final int weekday;

  @override
  Widget build(BuildContext context) {
    final title = stats.recentCount == 1 ? 'Your first game\nscored' : 'Your last ${stats.recentCount} games\naveraged';
    final (before, figure, after) = ScoreStats.betterThanLine(stats.betterThan, weekday);
    const words = TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: AppColors.navy, height: 1.25);

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 22),
      decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(18)),
      child: Column(
        children: [
          const Icon(Icons.emoji_events_rounded, color: Color(0xFFE0A100), size: 64),
          const SizedBox(height: 6),
          Text(title, textAlign: TextAlign.center, style: words),
          Text(
            '${stats.recentPercent}%',
            style: const TextStyle(fontSize: 52, fontWeight: FontWeight.w900, color: AppColors.brand, height: 1.15),
          ),
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(
              text: before,
              children: [
                TextSpan(text: figure, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
                TextSpan(text: after),
              ],
            ),
            textAlign: TextAlign.center,
            style: words,
          ),
        ],
      ),
    );
  }
}
