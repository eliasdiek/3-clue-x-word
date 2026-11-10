import '../game/game_state.dart';
import '../game/models.dart';
import 'api_client.dart';
import 'storage.dart';

/// What the opening screen loads before the Play arrow appears.
class OpeningData {
  const OpeningData({required this.quote, required this.game, this.message});

  final DailyQuote? quote;

  /// The game to play (resumed or new), or null when there's no puzzle yet.
  final GameState? game;

  /// A friendly note when something couldn't load (e.g. offline, no puzzle).
  final String? message;
}

/// Decides what to play and keeps progress. Works offline when the puzzle
/// in progress (or the next one) was downloaded earlier.
class GameRepository {
  GameRepository({required this.api, required this.storage});

  final ApiClient api;
  final Storage storage;

  /// The player's own calendar date, as the API expects.
  static String today([DateTime? now]) {
    final d = now ?? DateTime.now();
    return '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  /// Loads today's quote and the game to play, reporting progress 0..1.
  Future<OpeningData> load({void Function(double progress)? onProgress}) async {
    onProgress?.call(0.1);
    final quote = await _loadQuote();
    onProgress?.call(0.5);
    try {
      final game = await _loadGame();
      onProgress?.call(1);
      return OpeningData(
        quote: quote,
        game: game,
        message: game == null ? "You've played every puzzle so far. A new one is on its way!" : null,
      );
    } on ApiException catch (e) {
      onProgress?.call(1);
      return OpeningData(quote: quote, game: null, message: e.message);
    }
  }

  Future<DailyQuote?> _loadQuote() async {
    final date = today();
    try {
      final quote = await api.quote(date);
      if (quote != null) await storage.saveQuote(date, quote.toJson());
      return quote;
    } on ApiException {
      final cached = storage.quote(date);
      return cached == null ? null : DailyQuote.fromJson(cached);
    }
  }

  /// The puzzle in progress if there is one, otherwise the next one after
  /// the last finished puzzle.
  Future<GameState?> _loadGame() async {
    final current = storage.currentPuzzle;
    if (current != null) {
      final puzzle = await _puzzle(current);
      if (puzzle != null) {
        final saved = storage.game(current);
        return (saved == null ? null : GameState.fromJson(puzzle, saved)) ?? GameState.start(puzzle);
      }
    }
    final json = await api.nextPuzzle(after: storage.lastFinished);
    if (json == null) return null;
    final puzzle = Puzzle.fromJson(json);
    await storage.savePuzzle(puzzle.puzzleNumber, json);
    await storage.setCurrentPuzzle(puzzle.puzzleNumber);
    return GameState.start(puzzle);
  }

  Future<Puzzle?> _puzzle(int number) async {
    final cached = storage.puzzle(number);
    if (cached != null) return Puzzle.fromJson(cached);
    final json = await api.puzzle(number);
    if (json == null) return null;
    await storage.savePuzzle(number, json);
    return Puzzle.fromJson(json);
  }

  /// "I'll be back later": keep the game exactly as it is.
  Future<void> save(GameState game) async {
    await storage.setCurrentPuzzle(game.puzzle.puzzleNumber);
    await storage.saveGame(game.puzzle.puzzleNumber, game.toJson());
  }

  /// "Exit without saving": forget this attempt (the puzzle stays current).
  Future<void> discard(GameState game) => storage.deleteGame(game.puzzle.puzzleNumber);

  /// Records a finished (or given-up) puzzle and moves on to the next one.
  Future<HistoryEntry> finish(GameState game) async {
    final number = game.puzzle.puzzleNumber;
    final entry = HistoryEntry(
      puzzleNumber: number,
      finishedAt: DateTime.now(),
      score: game.score,
      maxScore: game.maxScore,
      percent: game.percent,
      gaveUp: game.gaveUp,
    );
    await storage.addHistory(entry);
    if (number > storage.lastFinished) await storage.setLastFinished(number);
    await storage.deleteGame(number);
    await storage.setCurrentPuzzle(null);
    return entry;
  }
}
