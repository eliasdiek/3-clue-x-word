import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_clue_xword/data/api_client.dart';
import 'package:three_clue_xword/data/repository.dart';
import 'package:three_clue_xword/data/storage.dart';

Map<String, dynamic> fixture(String name) =>
    jsonDecode(File('test/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>;

/// A fake website: serves the mini puzzle (#3) and the sample (#7) through
/// the real v1 response shapes. Set [online] to false to simulate no signal.
class FakeServer {
  bool online = true;
  final requests = <Uri>[];
  final puzzles = {3: fixture('mini_puzzle'), 7: fixture('sample_puzzle')};

  MockClient get client => MockClient((request) async {
        requests.add(request.url);
        if (!online) throw http.ClientException('offline');
        final path = request.url.path;
        if (path == '/api/v1/puzzles/next') {
          final after = int.parse(request.url.queryParameters['after']!);
          final next = puzzles.keys.where((n) => n > after).toList()..sort();
          return next.isEmpty
              ? _json(404, {'error': {'code': 'no-more-puzzles', 'message': 'none'}})
              : _json(200, {'puzzle': puzzles[next.first]});
        }
        if (path.startsWith('/api/v1/puzzles/')) {
          final p = puzzles[int.tryParse(path.split('/').last)];
          return p == null ? _json(404, {'error': {'code': 'not-found', 'message': 'no'}}) : _json(200, {'puzzle': p});
        }
        if (path == '/api/v1/quotes/today') {
          return _json(200, {
            'quote': {'date': request.url.queryParameters['date'], 'text': 'Well begun is half done.', 'author': 'Aristotle', 'comment': null},
          });
        }
        return _json(404, {'error': {'code': 'not-found', 'message': 'no'}});
      });

  static http.Response _json(int status, Map<String, dynamic> body) =>
      http.Response(jsonEncode({'apiVersion': 'v1', ...body}), status, headers: {'content-type': 'application/json'});
}

void main() {
  late FakeServer server;
  late GameRepository repo;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    server = FakeServer();
    repo = GameRepository(api: ApiClient(baseUrl: 'https://example.test', client: server.client), storage: await Storage.open());
  });

  test('a new player gets the quote and the first published puzzle', () async {
    final progress = <double>[];
    final data = await repo.load(onProgress: progress.add);
    expect(data.quote!.text, 'Well begun is half done.');
    expect(data.game!.puzzle.puzzleNumber, 3);
    expect(progress.last, 1);
    expect(server.requests.any((u) => u.queryParameters['after'] == '0'), isTrue);
  });

  test('"I\'ll be back later" resumes the same game, even offline', () async {
    final game = (await repo.load()).game!;
    game.type('C');
    await repo.save(game);

    server.online = false;
    final again = await repo.load();
    expect(again.game!.letters[0], 'C');
    expect(again.quote, isNotNull, reason: "today's quote was kept");
  });

  test('finishing records history and moves on to the next puzzle', () async {
    final game = (await repo.load()).game!;
    for (final l in 'CATOW'.split('')) {
      game.type(l);
    }
    final entry = await repo.finish(game);
    expect(entry.percent, 100);
    expect(repo.storage.history.single.puzzleNumber, 3);

    final next = await repo.load();
    expect(next.game!.puzzle.puzzleNumber, 7);
  });

  test('exit without saving starts the same puzzle afresh', () async {
    final game = (await repo.load()).game!;
    game.type('C');
    await repo.save(game);
    await repo.discard(game);
    final again = await repo.load();
    expect(again.game!.puzzle.puzzleNumber, 3);
    expect(again.game!.letters[0], isNull);
  });

  test('explains when there is no new puzzle yet', () async {
    await repo.storage.setLastFinished(7);
    final data = await repo.load();
    expect(data.game, isNull);
    expect(data.message, contains('every puzzle'));
  });

  test('explains when offline with nothing downloaded', () async {
    server.online = false;
    final data = await repo.load();
    expect(data.game, isNull);
    expect(data.message, contains("Can't reach"));
  });
}
