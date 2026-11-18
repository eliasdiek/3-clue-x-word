import 'package:flutter/material.dart';

import '../../game/game_state.dart';
import '../../game/models.dart';
import '../theme.dart';

/// The clue area under the grid, as laid out in the specification:
///   - grey arrows with the previous / next unsolved word's number,
///   - the current word's number ("10a"),
///   - the coloured tabs: Harder (yellow), Medium (pink), Easier (blue),
///     with a sun on the clue being viewed, and the grey Show Me tab,
///   - the across/down switch,
///   - the clue itself.
class ClueBar extends StatelessWidget {
  const ClueBar({
    super.key,
    required this.game,
    required this.onViewClue,
    required this.onShowMe,
    required this.onSwitch,
    required this.onPrevious,
    required this.onNext,
  });

  final GameState game;
  final void Function(ClueLevel level) onViewClue;
  final VoidCallback onShowMe;
  final VoidCallback onSwitch;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

  static const clueHeight = 100.0;
  static const tabHeight = 40.0;

  String? _neighbourLabel(int step) {
    final words = game.puzzle.words;
    final n = words.length;
    for (var i = 1; i < n; i++) {
      final w = ((game.currentWord + step * i) % n + n) % n;
      if (!game.solved[w]) return words[w].label;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final canSwitch = game.puzzle.wordAt(game.currentCell, game.direction.other) != null;
    final previous = _neighbourLabel(-1);
    final next = _neighbourLabel(1);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [BoxShadow(color: Color(0x14171F4D), blurRadius: 18, offset: Offset(0, 6))],
      ),
      padding: const EdgeInsets.all(8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              for (final level in ClueLevel.values) ...[
                Expanded(
                  child: _ClueTab(
                    label: level.label,
                    color: AppColors.fill(level),
                    textColor: AppColors.strong(level),
                    selected: game.clueLevel == level,
                    onTap: () => onViewClue(level),
                    semanticsLabel: '${level.label} clue, ${level.points} points per letter',
                  ),
                ),
                const SizedBox(width: 6),
              ],
              Expanded(
                child: _ClueTab(
                  label: 'Show Me',
                  color: AppColors.showMe,
                  textColor: AppColors.navy,
                  selected: false,
                  onTap: game.solved[game.currentWord] ? null : onShowMe,
                  semanticsLabel: 'Show me a letter, no points',
                ),
              ),
              const SizedBox(width: 6),
              _IconBox(
                icon: game.direction == Direction.across ? Icons.swap_vert_rounded : Icons.swap_horiz_rounded,
                tooltip: game.direction == Direction.across ? 'Switch to the down word' : 'Switch to the across word',
                onTap: canSwitch ? onSwitch : null,
              ),
            ],
          ),
          const SizedBox(height: 6),
          // A fixed height (room for about 70 characters), so the grid above
          // never changes size from one clue to the next.
          SizedBox(
            height: ClueBar.clueHeight,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _ArrowArea(
                  icon: Icons.chevron_left_rounded,
                  label: previous,
                  tooltip: previous == null ? 'No other words' : 'Previous word: $previous',
                  onTap: previous == null ? null : onPrevious,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.fill(game.clueLevel).withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.line),
                    ),
                    child: Stack(
                      children: [
                        // The word number, tucked into the top corner so the
                        // clue has the whole width.
                        Positioned(
                          left: 8,
                          top: 4,
                          child: Text(
                            game.word.label,
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.brand, height: 1),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(8, 17, 8, 4),
                          child: Center(
                            child: Semantics(
                              liveRegion: true,
                              label: '${game.word.label}, ${game.clueLevel.label} clue: ${game.clue}',
                              excludeSemantics: true,
                              child: FittingText(
                                game.clue,
                                style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink, height: 1.2),
                                maxFontSize: 18,
                                minFontSize: 12,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                _ArrowArea(
                  icon: Icons.chevron_right_rounded,
                  label: next,
                  tooltip: next == null ? 'No other words' : 'Next word: $next',
                  onTap: next == null ? null : onNext,
                  trailing: true,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ClueTab extends StatelessWidget {
  const _ClueTab({
    required this.label,
    required this.color,
    required this.textColor,
    required this.selected,
    required this.onTap,
    required this.semanticsLabel,
  });

  final String label;
  final Color color;
  final Color textColor;
  final bool selected;
  final VoidCallback? onTap;
  final String semanticsLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: semanticsLabel,
      excludeSemantics: true,
      child: Material(
        color: color,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            height: ClueBar.tabHeight,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: selected ? textColor : Colors.transparent, width: 2.5),
            ),
            alignment: Alignment.center,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // The "sun" marks the clue being viewed.
                if (selected) Icon(Icons.wb_sunny_rounded, size: 12, color: textColor) else const SizedBox(height: 12),
                FittedBox(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: textColor.withValues(alpha: onTap == null ? 0.4 : 1),
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

class _IconBox extends StatelessWidget {
  const _IconBox({required this.icon, required this.tooltip, required this.onTap});

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: AppColors.brandSoft,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: SizedBox(
            width: ClueBar.tabHeight + 4,
            height: ClueBar.tabHeight,
            child: Icon(icon, size: 28, color: onTap == null ? AppColors.inkMuted.withValues(alpha: 0.4) : AppColors.brand),
          ),
        ),
      ),
    );
  }
}

/// The grey arrow areas: tap to go to the previous / next unsolved word.
class _ArrowArea extends StatelessWidget {
  const _ArrowArea({required this.icon, required this.label, required this.tooltip, required this.onTap, this.trailing = false});

  final IconData icon;
  final String? label;
  final String tooltip;
  final VoidCallback? onTap;
  final bool trailing;

  @override
  Widget build(BuildContext context) {
    final children = [
      Icon(icon, size: 26, color: AppColors.navy.withValues(alpha: onTap == null ? 0.3 : 1)),
      if (label != null)
        Text(
          label!,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.inkMuted),
        ),
    ];
    return Tooltip(
      message: tooltip,
      child: Material(
        color: AppColors.showMe.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: SizedBox(
            width: 44,
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: children),
          ),
        ),
      ),
    );
  }
}

/// Text that takes the largest font size (from [maxFontSize] down to
/// [minFontSize]) at which it fits its box without breaking a word.
class FittingText extends StatelessWidget {
  const FittingText(this.text, {super.key, required this.style, required this.maxFontSize, required this.minFontSize});

  final String text;
  final TextStyle style;
  final double maxFontSize;
  final double minFontSize;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final scaler = MediaQuery.textScalerOf(context);
        // Measure with exactly what will be drawn: the theme's font and
        // letter spacing as well as [style]. (Measuring [style] alone was
        // narrower than the real text on iPhone, so a last word got cut off.)
        final base = DefaultTextStyle.of(context).style.merge(style);
        final words = text.split(RegExp(r'\s+'));
        var size = maxFontSize;
        for (; size > minFontSize; size -= 0.5) {
          if (_fits(words, base.copyWith(fontSize: size), scaler, constraints)) break;
        }
        return Text(
          text,
          textAlign: TextAlign.center,
          overflow: TextOverflow.ellipsis,
          maxLines: maxLines,
          style: base.copyWith(fontSize: size),
        );
      },
    );
  }

  static const maxLines = 4;

  /// Room kept spare so small differences in how the phone draws text
  /// can't push the last word out.
  static const _slack = 4.0;

  bool _fits(List<String> words, TextStyle style, TextScaler scaler, BoxConstraints box) {
    final width = box.maxWidth - _slack;
    TextPainter painter(String s, {int? lines}) => TextPainter(
          text: TextSpan(text: s, style: style),
          textDirection: TextDirection.ltr,
          textScaler: scaler,
          textAlign: TextAlign.center,
          maxLines: lines,
        );
    // No single word may be wider than the box (that would split it).
    for (final word in words) {
      final p = painter(word)..layout();
      final tooWide = p.width > width;
      p.dispose();
      if (tooWide) return false;
    }
    final all = painter(text, lines: maxLines)..layout(maxWidth: width);
    final fits = !all.didExceedMaxLines && all.height <= box.maxHeight - _slack;
    all.dispose();
    return fits;
  }
}
