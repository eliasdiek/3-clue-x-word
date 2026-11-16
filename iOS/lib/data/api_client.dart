import 'dart:convert';

import 'package:http/http.dart' as http;

/// The admin website's address. Set it when building:
///   flutter run --dart-define=API_BASE_URL=https://your-site.vercel.app
const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://3clude-x-word-puzzle.vercel.app');

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// The quote for the opening screen.
class DailyQuote {
  const DailyQuote({required this.date, required this.text, this.author, this.comment});

  final String date;
  final String text;
  final String? author;
  final String? comment;

  factory DailyQuote.fromJson(Map<String, dynamic> json) => DailyQuote(
        date: json['date'] as String,
        text: json['text'] as String,
        author: json['author'] as String?,
        comment: json['comment'] as String?,
      );

  Map<String, dynamic> toJson() => {'date': date, 'text': text, 'author': author, 'comment': comment};
}

/// Read-only client for the website's public API (v1). Puzzles come back as
/// raw JSON so they can be stored as-is for offline play.
class ApiClient {
  ApiClient({String baseUrl = apiBaseUrl, http.Client? client})
      : _base = Uri.parse(baseUrl.endsWith('/') ? baseUrl : '$baseUrl/'),
        _http = client ?? http.Client();

  final Uri _base;
  final http.Client _http;
  static const _timeout = Duration(seconds: 20);

  /// The first published puzzle numbered above [after], or null when there
  /// isn't one yet.
  Future<Map<String, dynamic>?> nextPuzzle({int after = 0}) async {
    final body = await _get('api/v1/puzzles/next', {'after': '$after'}, notFoundCode: 'no-more-puzzles');
    return body?['puzzle'] as Map<String, dynamic>?;
  }

  Future<Map<String, dynamic>?> puzzle(int number) async {
    final body = await _get('api/v1/puzzles/$number', const {}, notFoundCode: 'not-found');
    return body?['puzzle'] as Map<String, dynamic>?;
  }

  /// The quote for [date] (the player's own calendar date), or null if none.
  Future<DailyQuote?> quote(String date) async {
    final body = await _get('api/v1/quotes/today', {'date': date}, notFoundCode: 'no-quote');
    final quote = body?['quote'];
    return quote == null ? null : DailyQuote.fromJson(quote as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>?> _get(String path, Map<String, String> query, {required String notFoundCode}) async {
    final uri = _base.resolve(path).replace(queryParameters: query.isEmpty ? null : query);
    final http.Response response;
    try {
      response = await _http.get(uri, headers: {'Accept': 'application/json'}).timeout(_timeout);
    } catch (_) {
      throw ApiException("Can't reach the puzzle server. Check your internet connection.");
    }
    final Map<String, dynamic> body;
    try {
      body = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('The puzzle server sent something unexpected.');
    }
    if (body['apiVersion'] != 'v1') throw ApiException('Please update the app to keep playing.');
    if (response.statusCode == 404 && (body['error'] as Map?)?['code'] == notFoundCode) return null;
    if (response.statusCode != 200) {
      throw ApiException(((body['error'] as Map?)?['message'] as String?) ?? 'The puzzle server is unavailable.');
    }
    return body;
  }
}
