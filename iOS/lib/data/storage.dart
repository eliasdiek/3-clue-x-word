import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// One finished puzzle (the specification's HISTORY database:
/// date, score, percent of the maximum score).
class HistoryEntry {
  const HistoryEntry({
    required this.puzzleNumber,
    required this.finishedAt,
    required this.score,
    required this.maxScore,
    required this.percent,
    required this.gaveUp,
  });

  final int puzzleNumber;
  final DateTime finishedAt;
  final int score;
  final int maxScore;
  final int percent;
  final bool gaveUp;

  factory HistoryEntry.fromJson(Map<String, dynamic> json) => HistoryEntry(
        puzzleNumber: json['puzzleNumber'] as int,
        finishedAt: DateTime.parse(json['finishedAt'] as String),
        score: json['score'] as int,
        maxScore: json['maxScore'] as int,
        percent: json['percent'] as int,
        gaveUp: json['gaveUp'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        'puzzleNumber': puzzleNumber,
        'finishedAt': finishedAt.toIso8601String(),
        'score': score,
        'maxScore': maxScore,
        'percent': percent,
        'gaveUp': gaveUp,
      };
}

/// Everything the app keeps on the phone. Players are anonymous: progress,
/// scores and downloaded puzzles live only on this device.
class Storage {
  Storage(this._prefs);

  static Future<Storage> open() async => Storage(await SharedPreferences.getInstance());

  final SharedPreferences _prefs;

  static const _current = 'currentPuzzle';
  static const _lastFinished = 'lastFinishedPuzzle';
  static const _history = 'history';
  static String _puzzleKey(int n) => 'puzzle:$n';
  static String _gameKey(int n) => 'game:$n';
  static String _quoteKey(String date) => 'quote:$date';

  // Downloaded puzzles (kept for offline play).
  Map<String, dynamic>? puzzle(int number) => _readJson(_puzzleKey(number));
  Future<void> savePuzzle(int number, Map<String, dynamic> json) => _prefs.setString(_puzzleKey(number), jsonEncode(json));

  // The puzzle being played and its saved state.
  int? get currentPuzzle => _prefs.getInt(_current);
  Future<void> setCurrentPuzzle(int? number) =>
      number == null ? _prefs.remove(_current) : _prefs.setInt(_current, number);
  Map<String, dynamic>? game(int number) => _readJson(_gameKey(number));
  Future<void> saveGame(int number, Map<String, dynamic> json) => _prefs.setString(_gameKey(number), jsonEncode(json));
  Future<void> deleteGame(int number) => _prefs.remove(_gameKey(number));

  // The highest puzzle number finished: the next puzzle comes after it.
  int get lastFinished => _prefs.getInt(_lastFinished) ?? 0;
  Future<void> setLastFinished(int number) => _prefs.setInt(_lastFinished, number);

  List<HistoryEntry> get history {
    final raw = _prefs.getString(_history);
    if (raw == null) return const [];
    try {
      return [for (final e in jsonDecode(raw) as List) HistoryEntry.fromJson(e as Map<String, dynamic>)];
    } catch (_) {
      return const [];
    }
  }

  Future<void> addHistory(HistoryEntry entry) =>
      _prefs.setString(_history, jsonEncode([...history, entry].map((e) => e.toJson()).toList()));

  // Sound settings (Settings → Background music / Key click). On by default.
  static const _musicOn = 'musicOn';
  static const _clickOn = 'clickOn';
  bool get musicOn => _prefs.getBool(_musicOn) ?? true;
  Future<void> setMusicOn(bool on) => _prefs.setBool(_musicOn, on);
  bool get clickOn => _prefs.getBool(_clickOn) ?? true;
  Future<void> setClickOn(bool on) => _prefs.setBool(_clickOn, on);

  // Quotes seen, so the opening screen works offline for today.
  Map<String, dynamic>? quote(String date) => _readJson(_quoteKey(date));
  Future<void> saveQuote(String date, Map<String, dynamic> json) => _prefs.setString(_quoteKey(date), jsonEncode(json));

  Map<String, dynamic>? _readJson(String key) {
    final raw = _prefs.getString(key);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
