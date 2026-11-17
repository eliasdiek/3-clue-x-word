import 'package:flutter/material.dart';

import '../../game/game_state.dart';
import '../theme.dart';

/// The 12×12 board. Square fills show the clue colours (faintly); letters
/// are red while being tried and black once their word is right. The word
/// being solved has a thick white outline edged in navy, and the current
/// square a thick purple frame, so it's always clear where you are.
class CrosswordGrid extends StatelessWidget {
  const CrosswordGrid({super.key, required this.game, this.onTap, this.onDoubleTap, this.highlightCurrent = true});

  final GameState game;
  final void Function(int cell)? onTap;
  final void Function(int cell)? onDoubleTap;
  final bool highlightCurrent;

  /// Grid line width between squares.
  static const _gap = 1.0;

  Widget _cells(int size, Widget Function(int cell) builder) => GridView.builder(
        padding: EdgeInsets.zero,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: size,
          mainAxisSpacing: _gap,
          crossAxisSpacing: _gap,
        ),
        itemCount: size * size,
        itemBuilder: (context, cell) => builder(cell),
      );

  @override
  Widget build(BuildContext context) {
    final puzzle = game.puzzle;
    final size = puzzle.gridSize;

    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.gridLine,
          border: Border.all(color: AppColors.navy, width: 2),
          borderRadius: BorderRadius.circular(6),
        ),
        clipBehavior: Clip.antiAlias,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final cellSize = (constraints.maxWidth - _gap * (size - 1)) / size;
            return Semantics(
              label: 'Crossword grid, $size by $size',
              child: Stack(
                children: [
                  // Layer 1: the coloured squares (and the taps).
                  _cells(size, (cell) => _Square(game: game, cell: cell, onTap: onTap, onDoubleTap: onDoubleTap)),
                  // Layer 2: the current word's outline and square's frame.
                  if (highlightCurrent)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: CustomPaint(
                          painter: _CurrentWordPainter(
                            cells: game.word.cells,
                            currentCell: game.currentCell,
                            gridSize: size,
                            cellSize: cellSize,
                            gap: _gap,
                          ),
                        ),
                      ),
                    ),
                  // Layer 3: letters and numbers, on top so nothing hides them.
                  IgnorePointer(child: _cells(size, (cell) => _SquareText(game: game, cell: cell, cellSize: cellSize))),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Draws the current word's outline and the current square's frame on top
/// of the squares.
class _CurrentWordPainter extends CustomPainter {
  _CurrentWordPainter({
    required this.cells,
    required this.currentCell,
    required this.gridSize,
    required this.cellSize,
    required this.gap,
  });

  final List<int> cells;
  final int currentCell;
  final int gridSize;
  final double cellSize;
  final double gap;

  Rect _cellRect(int cell) {
    final pitch = cellSize + gap;
    return Rect.fromLTWH((cell % gridSize) * pitch, (cell ~/ gridSize) * pitch, cellSize, cellSize);
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (cells.isEmpty) return;
    final word = _cellRect(cells.first).expandToInclude(_cellRect(cells.last));

    // A thick white band just inside the word, edged in navy so it shows
    // against white squares too. Letters and numbers are drawn above it.
    final band = (cellSize * 0.13).clamp(3.0, 7.0);
    final outer = word.deflate(band / 2);
    final radius = Radius.circular(band);
    canvas.drawRRect(
      RRect.fromRectAndRadius(word.inflate(1), radius),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = AppColors.wordOutlineEdge,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(outer, radius),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = band
        ..color = AppColors.wordOutline,
    );

    // The current square: a thick purple frame inside it.
    if (cells.contains(currentCell)) {
      final frame = (cellSize * 0.1).clamp(2.5, 5.0);
      canvas.drawRect(
        _cellRect(currentCell).deflate(frame / 2),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = frame
          ..color = AppColors.brand,
      );
    }
  }

  @override
  bool shouldRepaint(_CurrentWordPainter old) =>
      old.currentCell != currentCell || old.cellSize != cellSize || !identical(old.cells, cells);
}

/// A square's colour, and its taps.
class _Square extends StatelessWidget {
  const _Square({required this.game, required this.cell, this.onTap, this.onDoubleTap});

  final GameState game;
  final int cell;
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
      selected: cell == game.currentCell,
      label: 'Row $row, column $column${number != null ? ', number $number' : ''}, '
          '${letter == null ? 'empty' : '$letter${black ? ', solved' : ''}'}',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap == null ? null : () => onTap!(cell),
        onDoubleTap: onDoubleTap == null ? null : () => onDoubleTap!(cell),
        child: ColoredBox(color: AppColors.gridFill(game.revealed[cell] ? null : game.colours[cell])),
      ),
    );
  }
}

/// A square's letter and number.
class _SquareText extends StatelessWidget {
  const _SquareText({required this.game, required this.cell, required this.cellSize});

  final GameState game;
  final int cell;
  final double cellSize;

  @override
  Widget build(BuildContext context) {
    final letter = game.letters[cell];
    final number = game.puzzle.numbers[cell];
    if (letter == null && number == null) return const SizedBox.shrink();
    final black = game.isBlackLetter(cell);

    return ExcludeSemantics(
      child: Stack(
        children: [
          if (letter != null)
            Center(
              child: Padding(
                padding: EdgeInsets.only(top: cellSize * 0.1),
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
          // Small, tucked into the top-left corner.
          if (number != null)
            Positioned(
              left: cellSize * 0.035,
              top: cellSize * 0.02,
              child: Text(
                '$number',
                style: TextStyle(
                  fontFamily: AppFonts.gridNumbers,
                  fontFamilyFallback: AppFonts.fallback,
                  fontSize: cellSize * 0.21,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink,
                  height: 1,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
