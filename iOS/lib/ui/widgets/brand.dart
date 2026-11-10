import 'package:flutter/material.dart';

import '../theme.dart';

/// The 3-Clue X-Word logo (the same artwork as the admin website).
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.height = 64});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '3-Clue X-Word',
      image: true,
      child: Image.asset('assets/brand/logo.png', height: height, fit: BoxFit.contain),
    );
  }
}

/// The yellow, pink and blue waves along the bottom of the brand screens.
class BrandWaves extends StatelessWidget {
  const BrandWaves({super.key, this.height = 120});

  final double height;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(child: CustomPaint(size: Size.fromHeight(height), painter: _WavesPainter()));
  }
}

class _WavesPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    void wave(Color color, double top) {
      final path = Path()
        ..moveTo(0, size.height * top)
        ..cubicTo(size.width * 0.3, size.height * (top + 0.25), size.width * 0.65, size.height * (top - 0.25), size.width, size.height * top)
        ..lineTo(size.width, size.height)
        ..lineTo(0, size.height)
        ..close();
      canvas.drawPath(path, Paint()..color = color);
    }

    wave(AppColors.harder.withValues(alpha: 0.75), 0.25);
    wave(AppColors.medium.withValues(alpha: 0.8), 0.45);
    wave(AppColors.easier, 0.65);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
