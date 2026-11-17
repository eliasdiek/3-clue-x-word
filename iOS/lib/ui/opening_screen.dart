import 'package:flutter/material.dart';

import '../data/api_client.dart';
import '../data/repository.dart';
import 'history_screen.dart';
import 'info_screen.dart';
import 'puzzle_screen.dart';
import 'theme.dart';
import 'widgets/brand.dart';

/// The opening screen, as the specification describes it:
///   - today's date (the quote changes daily),
///   - the quote in bold, the person quoting in regular type, the comment in
///     dark grey,
///   - a loading bar with a marker that follows the loading point,
///   - the Play arrow, visible only once loading has finished,
///   - the 3-Clue X-Word logo.
class OpeningScreen extends StatefulWidget {
  const OpeningScreen({super.key, required this.repository});

  final GameRepository repository;

  @override
  State<OpeningScreen> createState() => _OpeningScreenState();
}

class _OpeningScreenState extends State<OpeningScreen> {
  double _progress = 0;
  OpeningData? _data;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _progress = 0;
      _data = null;
    });
    final data = await widget.repository.load(onProgress: (p) {
      if (mounted) setState(() => _progress = p);
    });
    if (mounted) setState(() => _data = data);
  }

  Future<void> _play() async {
    final game = _data?.game;
    if (game == null) return;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => PuzzleScreen(game: game, repository: widget.repository)),
    );
    // Back from a puzzle: reload (it may be finished, saved or discarded).
    if (mounted) _load();
  }

  static const _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  static const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  String _today() {
    final d = DateTime.now();
    return '${_weekdays[d.weekday - 1]} ${d.day} ${_months[d.month - 1]} ${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final loaded = data != null;
    final quote = data?.quote;

    return Scaffold(
      body: Stack(
        children: [
          const Positioned(left: 0, right: 0, bottom: 0, child: BrandWaves(height: 130)),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(28, 24, 28, 140),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: constraints.maxHeight - 164),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _today(),
                              style: const TextStyle(fontFamily: 'Arial', fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.navy),
                            ),
                          ),
                          IconButton(
                            tooltip: 'How to play',
                            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InfoScreen())),
                            icon: const Icon(Icons.info_rounded, color: Color(0xFF3D9BEA), size: 30),
                          ),
                          IconButton(
                            tooltip: 'My progress',
                            onPressed: () => Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => HistoryScreen(storage: widget.repository.storage)),
                            ),
                            icon: const Icon(Icons.emoji_events_outlined, color: AppColors.brand, size: 28),
                          ),
                        ],
                      ),
                      const SizedBox(height: 28),
                      _QuoteBlock(quote: quote, loaded: loaded),
                      const SizedBox(height: 36),
                      _LoadingBar(progress: _progress),
                      const SizedBox(height: 28),
                      Center(child: _PlayArea(data: data, onPlay: _play, onRetry: _load)),
                      const SizedBox(height: 36),
                      const Center(child: BrandLogo(height: 88)),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuoteBlock extends StatelessWidget {
  const _QuoteBlock({required this.quote, required this.loaded});

  final DailyQuote? quote;
  final bool loaded;

  @override
  Widget build(BuildContext context) {
    final q = quote;
    if (q == null) {
      return Text(
        loaded ? 'Ready for today\'s puzzle?' : '',
        style: const TextStyle(fontFamily: 'Arial', fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink),
      );
    }
    return Semantics(
      container: true,
      label: 'Quote of the day: ${q.text}${q.author != null ? ', ${q.author}' : ''}',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('“${q.text}”', style: const TextStyle(fontFamily: 'Arial', fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink, height: 1.35)),
          if (q.author != null) ...[
            const SizedBox(height: 6),
            Text(q.author!, style: const TextStyle(fontFamily: 'Arial', fontSize: 15, color: AppColors.ink)),
          ],
          if (q.comment != null) ...[
            const SizedBox(height: 10),
            Text(q.comment!, style: const TextStyle(fontFamily: 'Arial', fontSize: 13, color: Color(0xFF555B6E), height: 1.4)),
          ],
        ],
      ),
    );
  }
}

/// The loading bar, with a marker that follows the loading point.
class _LoadingBar extends StatelessWidget {
  const _LoadingBar({required this.progress});

  final double progress;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading',
      value: '${(progress * 100).round()}%',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          return SizedBox(
            height: 28,
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: progress),
              duration: const Duration(milliseconds: 500),
              curve: Curves.easeOut,
              builder: (context, value, _) => Stack(
                clipBehavior: Clip.none,
                alignment: Alignment.centerLeft,
                children: [
                  Container(height: 10, decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(5))),
                  Container(
                    height: 10,
                    width: width * value,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [AppColors.harder, AppColors.medium, AppColors.easier]),
                      borderRadius: BorderRadius.circular(5),
                    ),
                  ),
                  Positioned(
                    left: (width * value - 12).clamp(0, width - 24),
                    child: Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.brand, width: 3),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PlayArea extends StatelessWidget {
  const _PlayArea({required this.data, required this.onPlay, required this.onRetry});

  final OpeningData? data;
  final VoidCallback onPlay;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final d = data;
    if (d == null) return const SizedBox(height: 96);
    if (d.game == null) {
      return Column(
        children: [
          Text(d.message ?? 'No puzzle available.', textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, color: AppColors.ink)),
          const SizedBox(height: 12),
          OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Try again')),
        ],
      );
    }
    final game = d.game!;
    final started = game.letters.any((l) => l != null) || game.solvedWordCount > 0;
    return Column(
      children: [
        Semantics(
          button: true,
          label: started ? 'Continue puzzle ${game.puzzle.puzzleNumber}' : 'Play puzzle ${game.puzzle.puzzleNumber}',
          excludeSemantics: true,
          child: Material(
            color: AppColors.brand,
            shape: const CircleBorder(),
            elevation: 6,
            shadowColor: AppColors.brand.withValues(alpha: 0.5),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onPlay,
              child: const SizedBox(width: 96, height: 96, child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 64)),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          started ? 'Continue puzzle #${game.puzzle.puzzleNumber}' : 'Puzzle #${game.puzzle.puzzleNumber}',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy),
        ),
      ],
    );
  }
}
