import 'dart:math';

import 'package:flutter/foundation.dart';

import '../data/repository.dart';
import '../game/game_state.dart';
import '../game/models.dart';

/// Connects the game rules to the screen: every move goes through here, the
/// screen rebuilds, and progress is saved as you play.
class GameController extends ChangeNotifier {
  GameController({required this.game, required this.repository});

  final GameState game;
  final GameRepository repository;

  /// A short compliment after a word is solved (the specification's
  /// voice-over lines), shown on screen.
  String? compliment;
  int _complimentId = 0;
  int get complimentId => _complimentId;

  /// Set when the last word is solved: the screen moves to the ad and score.
  bool get finished => game.isComplete;

  static final _random = Random();

  /// Compliments depend on the clue that was used.
  static const compliments = {
    ClueLevel.harder: ['Excellent!', 'Fantastic!', 'Amazing!', 'Aced it!', 'Fabulous!'],
    ClueLevel.medium: ['Great work!', 'Well done!', 'Great!', 'Looking good!'],
    ClueLevel.easier: ['Correct!', 'Good answer!', 'Nice!'],
  };

  void type(String letter) {
    // The clue in use before the move: solving moves on to the next word.
    final level = game.clueLevel;
    _after(game.type(letter), level);
  }
  void delete() => _changed(game.delete);
  void tapCell(int cell) => _changed(() => game.tapCell(cell));
  void doubleTapCell(int cell) => _after(game.revealCell(cell), null);
  void viewClue(ClueLevel level) => _changed(() => game.viewClue(level));
  void showMe() => _after(game.showMe(), null);
  void switchDirection() => _changed(game.switchDirection);
  void nextWord() => _changed(game.nextWord);
  void previousWord() => _changed(game.previousWord);

  void _changed(void Function() action) {
    action();
    notifyListeners();
    _autosave();
  }

  void _after(MoveResult result, ClueLevel? levelUsed) {
    if (result != MoveResult.none) {
      final options = levelUsed == null ? const ['Got it!'] : compliments[levelUsed]!;
      compliment = options[_random.nextInt(options.length)];
      _complimentId++;
    }
    notifyListeners();
    _autosave();
  }

  /// Progress is saved after every move, so closing the app never loses work.
  void _autosave() {
    if (!game.isComplete) repository.save(game);
  }
}
