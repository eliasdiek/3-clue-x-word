import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:three_clue_xword/game/game_state.dart';
import 'package:three_clue_xword/game/models.dart';

/// Fixtures are produced by the admin website's own publishing code, so these
/// tests also prove the app reads the real API format.
Puzzle load(String name) =>
    Puzzle.fromJson(jsonDecode(File('test/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>);

void main() {
  // Mini puzzle: CAT across (1a: cells 0,1,2) and COW down (1d: cells 0,12,24).
  late Puzzle mini;
  late Puzzle sample;
  setUpAll(() {
    mini = load('mini_puzzle');
    sample = load('sample_puzzle');
  });

  int wordIndex(Puzzle p, String label) => p.words.indexWhere((w) => w.label == label);

  group('reading the published puzzle', () {
    test('parses the specification sample', () {
      expect(sample.puzzleNumber, 7);
      expect(sample.words, hasLength(32));
      final sash = sample.words[wordIndex(sample, '4d')];
      expect(sash.answer, 'SASH');
      expect(sash.cells, [6, 18, 30, 42]);
      expect(sash.clues[ClueLevel.medium], 'Medium SASH');
      expect(sample.numbers[0], 1);
      expect(sample.isBlock(8), isTrue);
      expect(sample.words.take(2).map((w) => w.label), ['1a', '5a']);
    });
  });

  group('starting', () {
    test('selects 1a with its Harder clue, its squares yellow, the rest white', () {
      final g = GameState.start(mini);
      expect(g.word.label, '1a');
      expect(g.clueLevel, ClueLevel.harder);
      expect(g.clue, 'Harder CAT');
      expect([0, 1, 2].map((c) => g.colours[c]), everyElement(ClueLevel.harder));
      expect(g.colours[12], isNull);
      expect(g.currentCell, 0);
    });
  });

  group('typing', () {
    test('typed letters are red until the word is right, then black', () {
      final g = GameState.start(mini);
      expect(g.type('c'), MoveResult.none);
      expect(g.isRedLetter(0), isTrue);
      expect(g.currentCell, 1);
      g.type('A');
      expect(g.type('X'), MoveResult.none);
      expect(g.isRedLetter(2), isTrue, reason: 'a wrong word stays red');

      g.delete(); // removes X, back to A
      expect(g.letters[2], isNull);
      g.tapCell(2);
      expect(g.type('T'), MoveResult.wordSolved);
      expect([0, 1, 2].every(g.isBlackLetter), isTrue);
    });

    test('after solving, moves to the next unsolved word, which turns yellow', () {
      final g = GameState.start(mini);
      for (final l in 'CAT'.split('')) {
        g.type(l);
      }
      expect(g.word.label, '1d');
      expect(g.currentCell, 12, reason: 'C is already solved, so typing starts at O');
      expect(g.colours[12], ClueLevel.harder);
      expect(g.colours[24], ClueLevel.harder);
    });

    test('solving every word completes the puzzle with the maximum score', () {
      final g = GameState.start(mini);
      for (final l in 'CATOW'.split('')) {
        g.type(l);
      }
      expect(g.isComplete, isTrue);
      expect(g.score, 5 * 7);
      expect(g.score, g.maxScore);
      expect(g.percent, 100);
    });

    test('a letter can complete the crossing word; only that word turns black', () {
      final g = GameState.start(mini);
      g.tapCell(12); // the down word (only word through this square)
      expect(g.word.label, '1d');
      g.type('O');
      g.type('W');
      expect(g.isComplete, isFalse);

      g.tapCell(0); // the C square: across is preferred? we're working down, so 1d stays
      expect(g.word.label, '1d');
      expect(g.type('C'), MoveResult.wordSolved);
      expect(g.solved[wordIndex(mini, '1d')], isTrue);
      expect(g.solved[wordIndex(mini, '1a')], isFalse);
      expect(g.word.label, '1a', reason: 'moves on to the next unsolved word');
      expect(g.currentCell, 1);
    });

    test('black letters cannot be typed over or deleted', () {
      final g = GameState.start(mini);
      for (final l in 'CAT'.split('')) {
        g.type(l);
      }
      g.tapCell(0); // black letter: nothing happens
      expect(g.word.label, '1d');
      g.delete(); // at O (empty): steps back to C, which is black and stays
      expect(g.letters[0], 'C');
    });

    test('delete stops at the first square of the word', () {
      final g = GameState.start(mini);
      g.type('X');
      g.delete(); // removes X? No: cursor moved to cell 1 (empty) → back to 0 and delete X
      expect(g.letters[0], isNull);
      expect(g.currentCell, 0);
      g.delete();
      expect(g.currentCell, 0);
    });
  });

  group('clue colours', () {
    test('lesser clues lower the colour; a harder clue never raises it back', () {
      final g = GameState.start(mini);
      g.viewClue(ClueLevel.medium);
      expect(g.colours[1], ClueLevel.medium);
      g.viewClue(ClueLevel.harder);
      expect(g.clue, 'Harder CAT', reason: 'the clue shown changes');
      expect(g.colours[1], ClueLevel.medium, reason: 'but the colour does not go back');
      g.viewClue(ClueLevel.easier);
      expect(g.colours[1], ClueLevel.easier);
    });

    test('a crossing square keeps the easiest colour it has had', () {
      final g = GameState.start(mini);
      g.switchDirection(); // to 1d
      g.viewClue(ClueLevel.easier); // C, O, W blue
      g.switchDirection(); // back to 1a: already visited, no change
      expect(g.colours[0], ClueLevel.easier);
      expect(g.colours[1], ClueLevel.harder);
      for (final l in 'CAT'.split('')) {
        g.type(l);
      }
      expect(g.score, 3 + 7 + 7);
    });

    test('peeking at an easier clue lowers the points of red (unsolved) letters', () {
      final g = GameState.start(mini);
      g.type('C');
      g.type('A');
      g.viewClue(ClueLevel.easier);
      expect(g.colours[0], ClueLevel.easier);
      g.type('T');
      expect(g.score, 3 * 3);
    });

    test('viewing an easier clue after solving changes nothing', () {
      final g = GameState.start(mini);
      g.tapCell(12);
      g.type('O');
      g.type('W');
      g.tapCell(1);
      g.viewClue(ClueLevel.medium); // CAT pink
      for (final l in 'AT'.split('')) {
        g.type(l);
      }
      // Not solved yet: C is missing.
      g.tapCell(0);
      g.type('C'); // solves both
      expect(g.isComplete, isTrue);
      final before = List.of(g.colours);
      g.viewClue(ClueLevel.easier);
      expect(g.colours, before);
    });

    test('the last clue viewed is shown when a word is selected again', () {
      final g = GameState.start(mini);
      g.viewClue(ClueLevel.medium);
      g.switchDirection();
      expect(g.clueLevel, ClueLevel.harder);
      g.switchDirection();
      expect(g.clueLevel, ClueLevel.medium);
    });
  });

  group('Show Me', () {
    test('fills the current letter, black on white, worth 0 points', () {
      final g = GameState.start(mini);
      expect(g.showMe(), MoveResult.none);
      expect(g.letters[0], 'C');
      expect(g.isBlackLetter(0), isTrue);
      expect(g.colours[0], isNull);
      expect(g.currentCell, 1);
      g.type('A');
      g.type('T');
      expect(g.score, 7 + 7);
    });

    test('fixes the first wrong letter when the current square is right', () {
      final g = GameState.start(mini);
      g.type('C');
      g.type('O');
      g.type('T');
      g.tapCell(0);
      g.showMe();
      expect(g.letters[1], 'A');
      expect(g.solved[0], isTrue);
    });

    test('double-tapping an empty square reveals it', () {
      final g = GameState.start(mini);
      g.revealCell(24);
      expect(g.letters[24], 'W');
      expect(g.word.label, '1d');
      expect(g.revealed[24], isTrue);
    });
  });

  group('moving between words (sample crossword)', () {
    test('after the last across word, goes to the first unsolved down word', () {
      final g = GameState.start(sample);
      final lastAcross = sample.across.length - 1;
      g.tapCell(sample.words[lastAcross].cells.first);
      expect(g.word.label, '27a');
      for (final c in g.word.answer.split('')) {
        g.type(c);
      }
      expect(g.word.label, '1d');
    });

    test('solving 1a moves on to 5a, the next across word', () {
      final g = GameState.start(sample);
      for (final c in 'JEALOUSY'.split('')) {
        g.type(c);
      }
      expect(g.word.label, '5a');
    });

    test('the arrows skip solved words and wrap round', () {
      final g = GameState.start(sample);
      for (final c in 'JEALOUSY'.split('')) {
        g.type(c);
      }
      g.previousWord();
      expect(g.word.label, '25d', reason: 'wraps back past the solved 1a');
      g.nextWord();
      expect(g.word.label, '5a');
    });

    test('tapping prefers the current direction; the switch crosses over', () {
      final g = GameState.start(sample);
      g.tapCell(30); // row 2, column 6: S of SILVER (8a) and SASH (4d)
      expect(g.word.label, '8a');
      g.switchDirection();
      expect(g.word.label, '4d');
      g.tapCell(26); // row 2, column 2: across VALUE; down ALLEY — stays down
      expect(g.word.label, '2d');
    });
  });

  group('giving up', () {
    test('shows the completed puzzle and keeps only the points earned', () {
      final g = GameState.start(mini);
      for (final l in 'CAT'.split('')) {
        g.type(l);
      }
      g.revealSolution();
      expect(g.gaveUp, isTrue);
      expect(g.letters[12], 'O');
      expect(g.score, 3 * 7);
      expect(g.type('X'), MoveResult.none);
    });
  });

  group('saving and resuming', () {
    test('a saved game comes back exactly', () {
      final g = GameState.start(sample);
      g.type('J');
      g.viewClue(ClueLevel.medium);
      g.showMe();
      g.tapCell(30);
      final restored = GameState.fromJson(sample, jsonDecode(jsonEncode(g.toJson())) as Map<String, dynamic>)!;
      expect(restored.letters, g.letters);
      expect(restored.colours, g.colours);
      expect(restored.revealed, g.revealed);
      expect(restored.lastViewed, g.lastViewed);
      expect(restored.currentWord, g.currentWord);
      expect(restored.currentCell, g.currentCell);
      expect(restored.score, g.score);
    });

    test('a save from another puzzle is ignored', () {
      final g = GameState.start(mini);
      expect(GameState.fromJson(sample, g.toJson()), isNull);
      expect(GameState.fromJson(mini, {'v': 99}), isNull);
    });
  });
}
