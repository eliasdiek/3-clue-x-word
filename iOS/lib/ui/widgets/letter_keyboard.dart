import 'package:flutter/material.dart';

import '../theme.dart';

/// The app's own A–Z keyboard with a back arrow, so typing never brings up
/// autocorrect or covers the clue. (A hardware keyboard works too.)
class LetterKeyboard extends StatelessWidget {
  const LetterKeyboard({super.key, required this.onLetter, required this.onDelete});

  final void Function(String letter) onLetter;
  final VoidCallback onDelete;

  static const _rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var r = 0; r < _rows.length; r++)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              children: [
                if (r == 1) const Spacer(flex: 1),
                for (final letter in _rows[r].split(''))
                  Expanded(flex: 2, child: _Key(label: letter, onTap: () => onLetter(letter))),
                if (r == 1) const Spacer(flex: 1),
                if (r == 2)
                  Expanded(
                    flex: 4,
                    child: _Key(
                      icon: Icons.backspace_outlined,
                      semanticsLabel: 'Delete',
                      onTap: onDelete,
                      color: AppColors.showMe,
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Key extends StatelessWidget {
  const _Key({this.label, this.icon, this.semanticsLabel, required this.onTap, this.color = Colors.white});

  final String? label;
  final IconData? icon;
  final String? semanticsLabel;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2.5),
      child: Semantics(
        button: true,
        label: semanticsLabel ?? label,
        excludeSemantics: true,
        child: Material(
          color: color,
          elevation: 1,
          shadowColor: const Color(0x33171F4D),
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: onTap,
            child: SizedBox(
              height: 46,
              child: Center(
                child: icon != null
                    ? Icon(icon, color: AppColors.navy, size: 22)
                    : Text(label!, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppColors.navy)),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
