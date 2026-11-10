/// The rules of the game, from the client specification
/// (Crossword 3 Clue #3.docx). Pure Dart: no Flutter, fully unit-tested.
///
/// Squares
///   - Black squares never change. Letter squares start WHITE.
///   - A word selected for the first time shows its HARDER clue and its
///     squares turn YELLOW. Viewing the MEDIUM clue turns them PINK, the
///     EASIER clue BLUE. Colours only ever move to a "lesser" clue
///     (yellow → pink → blue), never back, so a crossing square keeps the
///     easiest colour it has had.
///   - Squares that are part of a solved word, or filled by Show Me, are
///     locked: their colour never changes again. (Viewing an easier clue
///     after solving changes nothing.) Squares holding a typed-but-unsolved
///     (red) letter are not locked, so peeking at an easier clue lowers
///     their points: a guess can't keep Harder points.
///
/// Letters
///   - Typed letters are RED. When every letter of a word is right, the
///     word is solved and its letters turn BLACK. A typed letter can
///     complete a crossing word too; only that shared letter turns black.
///   - Black letters can't be changed or deleted.
///   - Show Me fills the current square's letter (or the next wrong/empty
///     one in the word), BLACK on a WHITE square, worth 0 points.
///
/// Scoring: each letter scores once, when it turns black, by its square's
/// colour: yellow 7, pink 5, blue 3, white (Show Me) 0.
///
/// Moving on: after solving a word, go to the next unsolved word in solving
/// order (across words by number, then down words by number), wrapping
/// round. The arrows move to the previous/next unsolved word the same way.
library;

import 'models.dart';

/// What happened after a move, so the screen can react (voice-over, finish).
enum MoveResult { none, wordSolved, puzzleComplete }

class GameState {
  GameState._(this.puzzle)
      : letters = List.filled(puzzle.cellCount, null),
        colours = List.filled(puzzle.cellCount, null),
        revealed = List.filled(puzzle.cellCount, false),
        visited = List.filled(puzzle.words.length, false),
        lastViewed = List.filled(puzzle.words.length, ClueLevel.harder),
        solved = List.filled(puzzle.words.length, false);

  /// A fresh game: the first across word (1a) is selected with its Harder clue.
  factory GameState.start(Puzzle puzzle) {
    final state = GameState._(puzzle);
    if (puzzle.words.isNotEmpty) state._select(0);
    return state;
  }

  final Puzzle puzzle;

  /// The letter showing in each cell (typed or revealed), or null.
  final List<String?> letters;

  /// The clue colour on each cell; null is white.
  final List<ClueLevel?> colours;

  /// Cells filled by Show Me (black letter, white square, 0 points).
  final List<bool> revealed;

  /// Per word: selected at least once, last clue viewed, solved.
  final List<bool> visited;
  final List<ClueLevel> lastViewed;
  final List<bool> solved;

  int currentWord = 0;
  int currentCell = 0;

  /// True once the solver gave up and asked to see the completed puzzle.
  bool gaveUp = false;

  // --- Reading the state ----------------------------------------------------

  PuzzleWord get word => puzzle.words[currentWord];
  Direction get direction => word.direction;
  ClueLevel get clueLevel => lastViewed[currentWord];
  String get clue => word.clues[clueLevel]!;
  bool get isComplete => solved.every((s) => s);

  /// Black letter: part of a solved word, or revealed by Show Me.
  bool isLocked(int cell) => revealed[cell] || puzzle.wordsAt(cell).any((w) => solved[w]);
  bool isRedLetter(int cell) => letters[cell] != null && !isLocked(cell);
  bool isBlackLetter(int cell) => letters[cell] != null && isLocked(cell);

  int get solvedWordCount => solved.where((s) => s).length;

  /// Points earned so far: every black letter, once, by its square's colour.
  int get score {
    var total = 0;
    for (var cell = 0; cell < puzzle.cellCount; cell++) {
      if (isBlackLetter(cell) && !revealed[cell]) total += colours[cell]?.points ?? 0;
    }
    return total;
  }

  /// Every letter solved with the Harder clue.
  int get maxScore => puzzle.letterCount * ClueLevel.harder.points;

  /// Score as a whole-number percentage of the maximum.
  int get percent => maxScore == 0 ? 0 : (score * 100 / maxScore).round();

  /// Letters solved at each level (null = Show Me / given), for the score screen.
  Map<ClueLevel?, int> get lettersByLevel {
    final counts = <ClueLevel?, int>{};
    for (var cell = 0; cell < puzzle.cellCount; cell++) {
      if (!isBlackLetter(cell)) continue;
      final level = revealed[cell] ? null : colours[cell];
      counts[level] = (counts[level] ?? 0) + 1;
    }
    return counts;
  }

  // --- Selecting ------------------------------------------------------------

  void _select(int w, {int? cell}) {
    currentWord = w;
    if (!visited[w]) {
      visited[w] = true;
      lastViewed[w] = ClueLevel.harder;
      _applyColour(w, ClueLevel.harder);
    }
    currentCell = cell ?? _entryCell(w);
  }

  /// Where typing starts in a word: the first empty, unlocked square; then
  /// the first unlocked one; then the first square.
  int _entryCell(int w) {
    final cells = puzzle.words[w].cells;
    return cells.firstWhere(
      (c) => !isLocked(c) && letters[c] == null,
      orElse: () => cells.firstWhere((c) => !isLocked(c), orElse: () => cells.first),
    );
  }

  void _applyColour(int w, ClueLevel level) {
    if (solved[w]) return;
    for (final cell in puzzle.words[w].cells) {
      if (isLocked(cell)) continue;
      final current = colours[cell];
      if (current == null || level.isEasierThan(current)) colours[cell] = level;
    }
  }

  /// Tapping a square. A black letter does nothing. Otherwise the word in
  /// the current direction is selected if there is one, else the other.
  void tapCell(int cell) {
    if (puzzle.isBlock(cell) || isBlackLetter(cell) || gaveUp) return;
    final w = puzzle.wordAt(cell, direction) ?? puzzle.wordAt(cell, direction.other);
    if (w == null) return;
    _select(w, cell: cell);
  }

  /// The across/down switch: from a crossing square, select the other word,
  /// at its first empty letter (or its first letter if it's all filled).
  void switchDirection() {
    if (gaveUp) return;
    final other = puzzle.wordAt(currentCell, direction.other);
    if (other == null) return;
    final cells = puzzle.words[other].cells;
    _select(other, cell: cells.firstWhere((c) => letters[c] == null, orElse: () => cells.first));
  }

  /// Shows another clue for the current word (the coloured tabs).
  void viewClue(ClueLevel level) {
    if (gaveUp) return;
    lastViewed[currentWord] = level;
    _applyColour(currentWord, level);
  }

  /// The grey arrows: the next / previous unsolved word in solving order.
  void nextWord() => _moveTo(_unsolvedAfter(currentWord, 1));
  void previousWord() => _moveTo(_unsolvedAfter(currentWord, -1));

  void _moveTo(int? w) {
    if (w != null && !gaveUp) _select(w);
  }

  int? _unsolvedAfter(int from, int step) {
    final n = puzzle.words.length;
    for (var i = 1; i <= n; i++) {
      final w = ((from + step * i) % n + n) % n;
      if (!solved[w]) return w;
    }
    return null;
  }

  // --- Typing ---------------------------------------------------------------

  /// Types a letter (A–Z) into the current square, in red.
  MoveResult type(String letter) {
    if (gaveUp || isComplete) return MoveResult.none;
    final upper = letter.toUpperCase();
    if (!RegExp(r'^[A-Z]$').hasMatch(upper)) return MoveResult.none;

    var cell = currentCell;
    if (isLocked(cell)) {
      final next = _nextUnlocked(cell);
      if (next == null) return MoveResult.none;
      cell = next;
    }
    letters[cell] = upper;
    currentCell = cell;
    return _afterFilling(cell);
  }

  /// The keyboard's back arrow: deletes red letters backwards through the
  /// word and stops at its first square. Black letters can't be deleted.
  void delete() {
    if (gaveUp) return;
    final cells = word.cells;
    final i = cells.indexOf(currentCell);
    if (isRedLetter(currentCell)) {
      letters[currentCell] = null;
      if (i > 0) currentCell = cells[i - 1];
      return;
    }
    if (i <= 0) return;
    currentCell = cells[i - 1];
    if (isRedLetter(currentCell)) letters[currentCell] = null;
  }

  /// Show Me: fills the current square, or the next empty or wrong square
  /// of the current word, with its answer (black on white, 0 points).
  MoveResult showMe() {
    if (gaveUp || solved[currentWord]) return MoveResult.none;
    bool needsHelp(int c) => !isLocked(c) && letters[c] != puzzle.solution[c];
    final cell = needsHelp(currentCell) ? currentCell : word.cells.where(needsHelp).firstOrNull;
    if (cell == null) return MoveResult.none;
    return _reveal(cell);
  }

  /// Double-tapping an empty square reveals it, like Show Me (0 points).
  MoveResult revealCell(int cell) {
    if (gaveUp || puzzle.isBlock(cell) || isLocked(cell)) return MoveResult.none;
    tapCell(cell);
    return _reveal(cell);
  }

  MoveResult _reveal(int cell) {
    letters[cell] = puzzle.solution[cell];
    revealed[cell] = true;
    colours[cell] = null; // white
    currentCell = cell;
    return _afterFilling(cell);
  }

  MoveResult _afterFilling(int cell) {
    final wasCurrent = currentWord;
    var solvedAny = false;
    for (final w in puzzle.wordsAt(cell)) {
      if (!solved[w] && _isCorrect(w)) {
        solved[w] = true;
        solvedAny = true;
      }
    }
    if (isComplete) return MoveResult.puzzleComplete;
    if (solved[wasCurrent]) {
      _moveTo(_unsolvedAfter(wasCurrent, 1));
      return MoveResult.wordSolved;
    }
    final next = _nextUnlocked(cell);
    if (next != null) currentCell = next;
    return solvedAny ? MoveResult.wordSolved : MoveResult.none;
  }

  bool _isCorrect(int w) => puzzle.words[w].cells.every((c) => letters[c] == puzzle.solution[c]);

  /// The next unlocked square after [cell] in the current word, if any.
  int? _nextUnlocked(int cell) {
    final cells = word.cells;
    for (var i = cells.indexOf(cell) + 1; i < cells.length; i++) {
      if (!isLocked(cells[i])) return cells[i];
    }
    return null;
  }

  // --- Giving up and restarting ---------------------------------------------

  /// "See the completed puzzle": every unsolved letter is filled in as
  /// given (0 points). The score keeps what was solved before giving up.
  void revealSolution() {
    for (var cell = 0; cell < puzzle.cellCount; cell++) {
      if (puzzle.isBlock(cell) || isLocked(cell)) continue;
      letters[cell] = puzzle.solution[cell];
      revealed[cell] = true;
    }
    for (var w = 0; w < solved.length; w++) {
      solved[w] = true;
    }
    gaveUp = true;
  }

  // --- Saving ("I'll be back later") ----------------------------------------

  static const _version = 1;

  Map<String, dynamic> toJson() => {
        'v': _version,
        'puzzleNumber': puzzle.puzzleNumber,
        'letters': letters.map((l) => l ?? '.').join(),
        'colours': colours.map((c) => c == null ? '-' : c.name[0]).join(),
        'revealed': revealed.map((r) => r ? '1' : '0').join(),
        'visited': visited.map((v) => v ? '1' : '0').join(),
        'lastViewed': lastViewed.map((l) => l.name[0]).join(),
        'solved': solved.map((s) => s ? '1' : '0').join(),
        'currentWord': currentWord,
        'currentCell': currentCell,
        'gaveUp': gaveUp,
      };

  /// Restores a saved game. Returns null if it doesn't match the puzzle.
  static GameState? fromJson(Puzzle puzzle, Map<String, dynamic> json) {
    try {
      if (json['v'] != _version || json['puzzleNumber'] != puzzle.puzzleNumber) return null;
      final state = GameState._(puzzle);
      final letters = json['letters'] as String;
      final colours = json['colours'] as String;
      final revealed = json['revealed'] as String;
      final visited = json['visited'] as String;
      final lastViewed = json['lastViewed'] as String;
      final solved = json['solved'] as String;
      if (letters.length != puzzle.cellCount || solved.length != puzzle.words.length) return null;

      ClueLevel? level(String c) => switch (c) { 'h' => ClueLevel.harder, 'm' => ClueLevel.medium, 'e' => ClueLevel.easier, _ => null };
      for (var i = 0; i < puzzle.cellCount; i++) {
        state.letters[i] = letters[i] == '.' ? null : letters[i];
        state.colours[i] = level(colours[i]);
        state.revealed[i] = revealed[i] == '1';
      }
      for (var w = 0; w < puzzle.words.length; w++) {
        state.visited[w] = visited[w] == '1';
        state.lastViewed[w] = level(lastViewed[w]) ?? ClueLevel.harder;
        state.solved[w] = solved[w] == '1';
      }
      state.currentWord = (json['currentWord'] as int).clamp(0, puzzle.words.length - 1);
      state.currentCell = json['currentCell'] as int;
      if (!state.word.cells.contains(state.currentCell)) state.currentCell = state.word.cells.first;
      state.gaveUp = json['gaveUp'] as bool? ?? false;
      return state;
    } catch (_) {
      return null;
    }
  }
}
