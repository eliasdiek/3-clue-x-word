import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/repository.dart';
import '../data/storage.dart';
import '../game/game_state.dart';
import 'finish_flow.dart';
import 'game_controller.dart';
import 'sounds.dart';
import 'theme.dart';
import 'widgets/brand.dart';
import 'widgets/clue_bar.dart';
import 'widgets/crossword_grid.dart';
import 'widgets/letter_keyboard.dart';

/// Where questions and feedback go (Settings → Contact us).
const contactEmail = String.fromEnvironment('CONTACT_EMAIL', defaultValue: 'hello@3cluexword.com');

/// The puzzle being solved.
class PuzzleScreen extends StatefulWidget {
  const PuzzleScreen({super.key, required this.game, required this.repository});

  final GameState game;
  final GameRepository repository;

  @override
  State<PuzzleScreen> createState() => _PuzzleScreenState();
}

class _PuzzleScreenState extends State<PuzzleScreen> with WidgetsBindingObserver {
  late final GameController controller = GameController(game: widget.game, repository: widget.repository);
  final focusNode = FocusNode();
  bool _leaving = false;

  @override
  void initState() {
    super.initState();
    controller.addListener(_onChange);
    WidgetsBinding.instance.addObserver(this);
    if (widget.repository.storage.musicOn) Sounds.instance.startMusic();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    Sounds.instance.stopMusic();
    controller.removeListener(_onChange);
    controller.dispose();
    focusNode.dispose();
    super.dispose();
  }

  void _onChange() {
    if (controller.finished && !_leaving) {
      _leaving = true;
      // The specification: on finishing, go straight to an ad, then the score.
      Future.delayed(const Duration(milliseconds: 900), () {
        Sounds.instance.stopMusic();
        if (mounted) showFinish(context, game: widget.game, repository: widget.repository);
      });
    }
  }

  /// Music pauses while the app is in the background.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!widget.repository.storage.musicOn) return;
    if (state == AppLifecycleState.resumed) {
      Sounds.instance.resumeMusic();
    } else if (state == AppLifecycleState.paused) {
      Sounds.instance.pauseMusic();
    }
  }

  /// Entering a letter makes a key click (the iPhone's own keyboard click;
  /// it follows the phone's silent switch).
  void _type(String letter) {
    if (widget.repository.storage.clickOn) Sounds.instance.click();
    controller.type(letter);
  }

  /// A hardware keyboard works too (handy on iPad and when testing).
  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.backspace || key == LogicalKeyboardKey.delete) {
      controller.delete();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.tab || key == LogicalKeyboardKey.arrowRight) {
      controller.nextWord();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.arrowLeft) {
      controller.previousWord();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.space) {
      controller.switchDirection();
      return KeyEventResult.handled;
    }
    final ch = event.character?.toUpperCase();
    if (ch != null && RegExp(r'^[A-Z]$').hasMatch(ch)) {
      _type(ch);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  Future<void> _giveUpMenu() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Leave this puzzle?', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.navy)),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () => Navigator.pop(context, 'later'),
                icon: const Icon(Icons.bookmark_added_rounded),
                label: const Text("I'll be back later"),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => Navigator.pop(context, 'reveal'),
                icon: const Icon(Icons.visibility_rounded),
                label: const Text('Show me the completed puzzle'),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => Navigator.pop(context, 'discard'),
                icon: const Icon(Icons.delete_outline_rounded),
                label: const Text('Exit without saving'),
              ),
              const SizedBox(height: 6),
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep playing')),
            ],
          ),
        ),
      ),
    );
    if (!mounted || choice == null) return;
    switch (choice) {
      case 'later':
        await widget.repository.save(widget.game);
        if (mounted) Navigator.of(context).pop();
      case 'discard':
        await widget.repository.discard(widget.game);
        if (mounted) Navigator.of(context).pop();
      case 'reveal':
        widget.game.revealSolution();
        _leaving = true;
        setState(() {});
        if (mounted) await showFinish(context, game: widget.game, repository: widget.repository);
    }
  }

  Future<void> _settings() async {
    final restart = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Settings', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.navy)),
              const SizedBox(height: 4),
              _SoundSwitches(storage: widget.repository.storage),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.mail_outline_rounded, color: AppColors.brand),
                title: const Text('Contact us'),
                subtitle: const SelectableText(contactEmail),
                trailing: IconButton(
                  tooltip: 'Copy email address',
                  icon: const Icon(Icons.copy_rounded),
                  onPressed: () {
                    Clipboard.setData(const ClipboardData(text: contactEmail));
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Email address copied')));
                  },
                ),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => Navigator.pop(context, true),
                icon: const Icon(Icons.restart_alt_rounded),
                label: const Text('Restart this puzzle'),
              ),
            ],
          ),
        ),
      ),
    );
    if (restart != true || !mounted) return;
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Restart this puzzle?'),
        content: const Text('All your letters and clue colours will be cleared.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Restart')),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    await widget.repository.discard(widget.game);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => PuzzleScreen(game: GameState.start(widget.game.puzzle), repository: widget.repository),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _giveUpMenu();
      },
      child: Scaffold(
        // The keyboard sits low, partly in the home-indicator area like the
        // iPhone's own keyboard, leaving more room for the grid.
        body: SafeArea(
          bottom: false,
          child: Focus(
            focusNode: focusNode,
            autofocus: true,
            onKeyEvent: _onKey,
            child: ListenableBuilder(
              listenable: controller,
              builder: (context, _) {
                final game = widget.game;
                final bottom = (MediaQuery.viewPaddingOf(context).bottom - 18).clamp(4.0, 40.0);
                return Padding(
                  padding: EdgeInsets.fromLTRB(8, 0, 8, bottom),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          _RoundIcon(icon: Icons.arrow_back_rounded, tooltip: 'Leave this puzzle', onTap: _giveUpMenu),
                          Expanded(
                            child: Column(
                              children: [
                                const BrandLogo(height: 30),
                                Text(
                                  'Puzzle #${game.puzzle.puzzleNumber} · ${game.solvedWordCount}/${game.puzzle.words.length} words',
                                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.inkMuted),
                                ),
                              ],
                            ),
                          ),
                          _RoundIcon(icon: Icons.settings_rounded, tooltip: 'Settings', onTap: _settings),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Expanded(
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            Center(
                              child: CrosswordGrid(
                                game: game,
                                onTap: controller.tapCell,
                                onDoubleTap: controller.doubleTapCell,
                                highlightCurrent: !game.isComplete,
                              ),
                            ),
                            _Compliment(text: controller.compliment, id: controller.complimentId),
                          ],
                        ),
                      ),
                      const SizedBox(height: 6),
                      if (!game.gaveUp)
                        ClueBar(
                          game: game,
                          onViewClue: controller.viewClue,
                          onShowMe: controller.showMe,
                          onSwitch: controller.switchDirection,
                          onPrevious: controller.previousWord,
                          onNext: controller.nextWord,
                        ),
                      const SizedBox(height: 6),
                      LetterKeyboard(onLetter: _type, onDelete: controller.delete),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _RoundIcon extends StatelessWidget {
  const _RoundIcon({required this.icon, required this.tooltip, required this.onTap});

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton.outlined(
      tooltip: tooltip,
      onPressed: onTap,
      iconSize: 24,
      style: IconButton.styleFrom(
        foregroundColor: AppColors.navy,
        side: const BorderSide(color: AppColors.line, width: 2),
        minimumSize: const Size(44, 44),
      ),
      icon: Icon(icon),
    );
  }
}

/// A compliment that pops up over the grid and fades away.
class _Compliment extends StatelessWidget {
  const _Compliment({required this.text, required this.id});

  final String? text;
  final int id;

  @override
  Widget build(BuildContext context) {
    if (text == null) return const SizedBox.shrink();
    return IgnorePointer(
      child: TweenAnimationBuilder<double>(
        key: ValueKey(id),
        tween: Tween(begin: 0, end: 1),
        duration: const Duration(milliseconds: 1400),
        builder: (context, t, child) {
          final opacity = t < 0.15 ? t / 0.15 : (t > 0.7 ? (1 - t) / 0.3 : 1.0);
          return Opacity(opacity: opacity.clamp(0, 1), child: Transform.scale(scale: 0.9 + 0.1 * (t < 0.15 ? t / 0.15 : 1), child: child));
        },
        child: Semantics(
          liveRegion: true,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.brand,
              borderRadius: BorderRadius.circular(30),
              boxShadow: const [BoxShadow(color: Color(0x40171F4D), blurRadius: 20, offset: Offset(0, 8))],
            ),
            child: Text(text!, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white)),
          ),
        ),
      ),
    );
  }
}

/// Settings: background music and key click on/off (remembered).
class _SoundSwitches extends StatefulWidget {
  const _SoundSwitches({required this.storage});

  final Storage storage;

  @override
  State<_SoundSwitches> createState() => _SoundSwitchesState();
}

class _SoundSwitchesState extends State<_SoundSwitches> {
  @override
  Widget build(BuildContext context) {
    final storage = widget.storage;
    return Column(
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          secondary: const Icon(Icons.music_note_rounded, color: AppColors.brand),
          title: const Text('Background music'),
          value: storage.musicOn,
          onChanged: (on) async {
            await storage.setMusicOn(on);
            on ? Sounds.instance.startMusic() : Sounds.instance.stopMusic();
            setState(() {});
          },
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          secondary: const Icon(Icons.keyboard_rounded, color: AppColors.brand),
          title: const Text('Key click'),
          value: storage.clickOn,
          onChanged: (on) async {
            await storage.setClickOn(on);
            setState(() {});
          },
        ),
      ],
    );
  }
}
