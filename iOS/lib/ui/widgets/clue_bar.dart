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
      padding: const EdgeInsets.all(10),
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
          const SizedBox(height: 10),
          // IntrinsicHeight: the grey arrow areas stretch to the clue's height.
          IntrinsicHeight(
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
                    constraints: const BoxConstraints(minHeight: 72),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.fill(game.solved[game.currentWord] ? null : game.clueLevel).withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.line),
                    ),
                    child: Row(
                      children: [
                        Text(
                          game.word.label,
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.brand),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Semantics(
                            liveRegion: true,
                            label: '${game.word.label}, ${game.clueLevel.label} clue: ${game.clue}',
                            excludeSemantics: true,
                            child: Text(
                              game.clue,
                              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600, color: AppColors.ink, height: 1.25),
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
            height: 52,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: selected ? textColor : Colors.transparent, width: 2.5),
            ),
            alignment: Alignment.center,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // The "sun" marks the clue being viewed.
                if (selected) Icon(Icons.wb_sunny_rounded, size: 16, color: textColor) else const SizedBox(height: 16),
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
            width: 48,
            height: 52,
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
            width: 52,
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: children),
          ),
        ),
      ),
    );
  }
}
