import 'package:flutter/material.dart';

import '../data/storage.dart';
import 'theme.dart';

/// "My progress": every finished puzzle with its date, score and percent
/// (the specification's HISTORY database). Kept on this phone only.
class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key, required this.storage});

  final Storage storage;

  @override
  Widget build(BuildContext context) {
    final history = storage.history.reversed.toList();
    final finished = history.where((h) => !h.gaveUp).toList();
    final average = finished.isEmpty ? null : (finished.map((h) => h.percent).reduce((a, b) => a + b) / finished.length).round();

    return Scaffold(
      appBar: AppBar(title: const Text('My progress'), backgroundColor: AppColors.canvas),
      body: history.isEmpty
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text('Finish a puzzle and your scores will appear here.', textAlign: TextAlign.center, style: TextStyle(fontSize: 18)),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  children: [
                    _Stat(label: 'Puzzles finished', value: '${finished.length}'),
                    const SizedBox(width: 12),
                    _Stat(label: 'Average score', value: average == null ? '—' : '$average%'),
                  ],
                ),
                const SizedBox(height: 16),
                for (final h in history)
                  Card(
                    elevation: 0,
                    color: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: AppColors.line)),
                    child: ListTile(
                      title: Text('Puzzle #${h.puzzleNumber}', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy)),
                      subtitle: Text('${h.finishedAt.day}/${h.finishedAt.month}/${h.finishedAt.year}${h.gaveUp ? ' · gave up' : ''}'),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('${h.score} pts', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                          Text('${h.percent}%', style: const TextStyle(color: AppColors.inkMuted)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.brandSoft, borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: AppColors.navy)),
            Text(label, style: const TextStyle(color: AppColors.inkMuted)),
          ],
        ),
      ),
    );
  }
}
