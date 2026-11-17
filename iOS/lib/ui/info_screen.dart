import 'package:flutter/material.dart';

import '../game/models.dart';
import 'theme.dart';
import 'widgets/brand.dart';

/// The explanation page, opened from the info button on the opening screen.
/// Wording from John (client email, 17 Nov 2026).
const infoTitle = 'Welcome to 3-Clue X-Word';

const infoEntering = <String>[
  'Entered letters are RED until the correct solution is entered. Then they turn BLACK. '
      'You can leave RED letters in place if you wish.',
  'When you first look at a clue the word spaces turn ORANGE. You are shown the Harder Clue first.',
  'If you view the Medium clue, the spaces turn PINK. And they turn BLUE when you view the Easier clue.',
  'You can reveal a letter using the Show Me button. The revealed letter will have a white background.',
  'Background colours will NOT change once a clue is solved. So you can view unused clues, if you want to.',
];

const infoScoring =
    'Your scores will be stored in your app and you will be able to see your progress as you do more puzzles.';

const _body = TextStyle(fontSize: 16, color: AppColors.ink, height: 1.45);

class InfoScreen extends StatelessWidget {
  const InfoScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          children: [
            Align(alignment: Alignment.centerLeft, child: BackPill(onTap: () => Navigator.of(context).pop())),
            const SizedBox(height: 20),
            const Center(child: BrandLogo(height: 64)),
            const SizedBox(height: 20),
            const Text(infoTitle, textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: AppColors.navy)),
            const SizedBox(height: 24),
            const _Heading('Entering Words'),
            for (final paragraph in infoEntering) ...[
              Text(paragraph, style: _body),
              const SizedBox(height: 12),
            ],
            const SizedBox(height: 12),
            const _Heading('Scoring'),
            const Text(infoScoring, style: _body),
            const SizedBox(height: 14),
            const _ScoreTable(),
          ],
        ),
      ),
    );
  }
}

/// The purple "Back" button, as in the client's example.
class BackPill extends StatelessWidget {
  const BackPill({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Back',
      excludeSemantics: true,
      child: Material(
        color: AppColors.brand,
        shape: const StadiumBorder(),
        elevation: 3,
        shadowColor: AppColors.brand.withValues(alpha: 0.5),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(6, 6, 22, 6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                  child: const Icon(Icons.arrow_back_rounded, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 10),
                const Text('BACK', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 1)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.navy)),
      );
}

/// Harder (orange) 7, Medium (pink) 5, Easier (blue) 3, Show Me (white) 0.
class _ScoreTable extends StatelessWidget {
  const _ScoreTable();

  @override
  Widget build(BuildContext context) {
    final rows = <(String, Color, int)>[
      for (final level in ClueLevel.values) ('${level.label} Clue', AppColors.fill(level), level.points),
      ('Show Me', AppColors.square, 0),
    ];
    return Column(
      children: [
        for (final (label, colour, points) in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(color: colour, borderRadius: BorderRadius.circular(6), border: Border.all(color: AppColors.gridLine)),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.navy))),
                Text('$points points each square', style: const TextStyle(fontSize: 15, color: AppColors.ink)),
              ],
            ),
          ),
      ],
    );
  }
}
