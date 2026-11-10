import 'package:flutter/material.dart';

import '../../game/game_state.dart';
import '../theme.dart';

/// The 12×12 board. Square fills show the clue colours; letters are red
/// while being tried and black once their word is right. The current word
/// is outlined and the current square has a thick purple frame.
class CrosswordGrid extends StatelessWidget {
  const CrosswordGrid({super.key, required this.game, this.onTap, this.onDoubleTap, this.highlightCurrent = true});

  final GameState game;
  final void Function(int cell)? onTap;
  final void Function(int cell)? onDoubleTap;
  final bool highlightCurrent;

  @override
  Widget build(BuildContext context) {
    final puzzle = game.puzzle;
    final size = puzzle.gridSize;
    final currentWordCells = highlightCurrent ? game.word.cells.toSet() : const <int>{};

    return AspectRatio(
      aspectRatio: 1,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final cellSize = constraints.maxWidth / size;
          return Container(
            decoration: BoxDecoration(
              color: AppColors.gridLine,
              border: Border.all(color: AppColors.navy, width: 2),
              borderRadius: BorderRadius.circular(6),
            ),
            clipBehavior: Clip.antiAlias,
            child: Semantics(
              label: 'Crossword grid, $size by $size',
              child: GridView.builder(
                padding: EdgeInsets.zero,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: size,
                  mainAxisSpacing: 1,
                  crossAxisSpacing: 1,
                ),
                itemCount: puzzle.cellCount,
                itemBuilder: (context, cell) => _Square(
                  game: game,
                  cell: cell,
                  cellSize: cellSize,
                  inCurrentWord: currentWordCells.contains(cell),
                  isCurrent: highlightCurrent && cell == game.currentCell,
                  onTap: onTap,
                  onDoubleTap: onDoubleTap,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _Square extends StatelessWidget {
  const _Square({
    required this.game,
    required this.cell,
    required this.cellSize,
    required this.inCurrentWord,
    required this.isCurrent,
    this.onTap,
    this.onDoubleTap,
  });

  final GameState game;
  final int cell;
  final double cellSize;
  final bool inCurrentWord;
  final bool isCurrent;
  final void Function(int)? onTap;
  final void Function(int)? onDoubleTap;

  @override
  Widget build(BuildContext context) {
    final puzzle = game.puzzle;
    if (puzzle.isBlock(cell)) return const ColoredBox(color: AppColors.block);

    final letter = game.letters[cell];
    final number = puzzle.numbers[cell];
    final black = game.isBlackLetter(cell);
    final row = puzzle.row(cell) + 1;
    final column = puzzle.column(cell) + 1;

    return Semantics(
      button: true,
      selected: isCurrent,
      label: 'Row $row, column $column${number != null ? ', number $number' : ''}, '
          '${letter == null ? 'empty' : '$letter${black ? ', solved' : ''}'}',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap == null ? null : () => onTap!(cell),
        onDoubleTap: onDoubleTap == null ? null : () => onDoubleTap!(cell),
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.fill(game.revealed[cell] ? null : game.colours[cell]),
            border: isCurrent
                ? Border.all(color: AppColors.brand, width: cellSize * 0.09)
                : inCurrentWord
                    ? Border.all(color: AppColors.brand.withValues(alpha: 0.45), width: cellSize * 0.04)
                    : null,
          ),
          child: Stack(
            children: [
              if (number != null)
                Positioned(
                  left: cellSize * 0.06,
                  top: cellSize * 0.02,
                  child: Text(
                    '$number',
                    style: TextStyle(
                      fontFamily: AppFonts.gridNumbers,
                      fontFamilyFallback: AppFonts.fallback,
                      fontSize: cellSize * 0.26,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                      height: 1,
                    ),
                  ),
                ),
              if (letter != null)
                Center(
                  child: Padding(
                    padding: EdgeInsets.only(top: cellSize * 0.08),
                    child: Text(
                      letter,
                      style: TextStyle(
                        fontFamily: AppFonts.gridLetters,
                        fontFamilyFallback: AppFonts.fallback,
                        fontSize: cellSize * 0.56,
                        fontWeight: FontWeight.w700,
                        color: black ? AppColors.blackLetter : AppColors.redLetter,
                        height: 1,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
