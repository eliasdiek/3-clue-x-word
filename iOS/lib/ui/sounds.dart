import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// The game's sounds: quiet background music while solving, and a key click
/// when a letter is entered. Both can be turned off in Settings.
///
/// Sounds follow the iPhone's silent switch and mix with the player's own
/// music or podcasts instead of stopping them ("ambient" audio).
class Sounds {
  Sounds._();

  static final instance = Sounds._();

  /// Turned off in widget tests, where there's no audio device.
  @visibleForTesting
  static bool enabled = true;

  static const _musicAsset = 'audio/music.mp3';
  static const _musicVolume = 0.25;

  AudioPlayer? _music;

  /// The key click: the iPhone's own keyboard click.
  void click() {
    if (enabled) SystemSound.play(SystemSoundType.click);
  }

  /// Starts the background music, looping, from the beginning.
  Future<void> startMusic() async {
    if (!enabled) return;
    try {
      final player = _music ??= AudioPlayer();
      await player.setAudioContext(
        AudioContext(iOS: AudioContextIOS(category: AVAudioSessionCategory.ambient)),
      );
      await player.setReleaseMode(ReleaseMode.loop);
      await player.setVolume(_musicVolume);
      await player.play(AssetSource(_musicAsset));
    } catch (e) {
      debugPrint('Background music could not start: $e');
    }
  }

  Future<void> pauseMusic() async {
    try {
      await _music?.pause();
    } catch (_) {}
  }

  Future<void> resumeMusic() async {
    try {
      await _music?.resume();
    } catch (_) {}
  }

  Future<void> stopMusic() async {
    try {
      await _music?.stop();
    } catch (_) {}
  }
}
