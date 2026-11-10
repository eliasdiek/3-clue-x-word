/// Puzzle data as published by the admin website (API schema "v1").
///
/// See README "Mobile app API (v1)" in the website project. Rows and columns
/// are 0-based; cells are addressed by index `row * gridSize + column`.
library;

/// The three clue levels, from hardest to easiest. The order matters: a
/// square's colour may only move down this list ("lesser" clues).
enum ClueLevel {
  harder(points: 7, label: 'Harder'),
  medium(points: 5, label: 'Medium'),
  easier(points: 3, label: 'Easier');

  const ClueLevel({required this.points, required this.label});

  /// Points per letter solved while this clue's colour is on the square.
  final int points;
  final String label;

  bool isEasierThan(ClueLevel other) => index > other.index;
}

enum Direction {
  across('a'),
  down('d');

  const Direction(this.suffix);
  final String suffix;

  Direction get other => this == across ? down : across;
}

class PuzzleWord {
  const PuzzleWord({
    required this.number,
    required this.direction,
    required this.answer,
    required this.cells,
    required this.clues,
  });

  final int number;
  final Direction direction;
  final String answer;

  /// Cell indexes, in reading order.
  final List<int> cells;
  final Map<ClueLevel, String> clues;

  /// "1a", "3d": the label used in the specification.
  String get label => '$number${direction.suffix}';

  @override
  String toString() => '$label $answer';
}

class Puzzle {
  Puzzle({
    required this.puzzleNumber,
    required this.gridSize,
    required this.solution,
    required this.across,
    required this.down,
    required this.numbers,
  }) : words = [...across, ...down] {
    for (var i = 0; i < words.length; i++) {
      for (final cell in words[i].cells) {
        (_wordsByCell[cell] ??= []).add(i);
      }
    }
  }

  final int puzzleNumber;
  final int gridSize;

  /// The answer letter in each cell, or null for a black square.
  final List<String?> solution;
  final List<PuzzleWord> across;
  final List<PuzzleWord> down;

  /// Across words in number order, then down words: the order the solver
  /// meets them (the specification's IND).
  final List<PuzzleWord> words;

  /// Clue number shown in a cell's top-left corner, by cell index.
  final Map<int, int> numbers;

  final Map<int, List<int>> _wordsByCell = {};

  int get cellCount => gridSize * gridSize;
  bool isBlock(int cell) => solution[cell] == null;
  int get letterCount => solution.where((s) => s != null).length;

  /// Indexes (into [words]) of the words that use a cell: none, one or two.
  List<int> wordsAt(int cell) => _wordsByCell[cell] ?? const [];

  /// The word in [direction] through [cell], if there is one.
  int? wordAt(int cell, Direction direction) {
    for (final w in wordsAt(cell)) {
      if (words[w].direction == direction) return w;
    }
    return null;
  }

  int row(int cell) => cell ~/ gridSize;
  int column(int cell) => cell % gridSize;

  factory Puzzle.fromJson(Map<String, dynamic> json) {
    final size = json['gridSize'] as int;
    final rows = (json['solution'] as List).cast<String>();
    if (rows.length != size || rows.any((r) => r.length != size)) {
      throw const FormatException('The puzzle grid is not the expected size.');
    }
    final solution = <String?>[
      for (final row in rows)
        for (final ch in row.split('')) RegExp(r'^[A-Z]$').hasMatch(ch) ? ch : null,
    ];

    List<PuzzleWord> parseWords(String key, Direction direction) {
      return [
        for (final raw in (json[key] as List).cast<Map<String, dynamic>>())
          PuzzleWord(
            number: raw['number'] as int,
            direction: direction,
            answer: raw['answer'] as String,
            cells: [
              for (final cell in (raw['cells'] as List).cast<List>()) (cell[0] as int) * size + (cell[1] as int),
            ],
            clues: {
              for (final level in ClueLevel.values) level: (raw['clues'] as Map<String, dynamic>)[level.name] as String,
            },
          ),
      ]..sort((a, b) => a.number.compareTo(b.number));
    }

    return Puzzle(
      puzzleNumber: json['puzzleNumber'] as int,
      gridSize: size,
      solution: solution,
      across: parseWords('across', Direction.across),
      down: parseWords('down', Direction.down),
      numbers: {
        for (final n in (json['numberedCells'] as List).cast<Map<String, dynamic>>())
          (n['row'] as int) * size + (n['column'] as int): n['number'] as int,
      },
    );
  }
}
