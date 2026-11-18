import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_tts/flutter_tts.dart';

/// The game's sounds: quiet background music while solving, a key click
/// when a letter is entered, and a voice saying the compliment ("Amazing!")
/// as its bubble appears. Each can be turned off in Settings.
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
  FlutterTts? _voice;

  /// The key click: the iPhone's own keyboard click.
  void click() {
    if (enabled) SystemSound.play(SystemSoundType.click);
  }

  /// Says a compliment out loud. Until John's own recordings arrive this is
  /// the iPhone's built-in voice (Australian English where the phone has it).
  Future<void> say(String text) async {
    if (!enabled) return;
    try {
      final voice = _voice ??= await _setUpVoice();
      await voice.stop();
      await voice.speak(text);
    } catch (e) {
      debugPrint('Voice could not speak: $e');
    }
  }

  static Future<FlutterTts> _setUpVoice() async {
    final voice = FlutterTts();
    await voice.setSharedInstance(true);
    // Ambient, like the music: follows the silent switch, mixes with other audio.
    await voice.setIosAudioCategory(
      IosTextToSpeechAudioCategory.ambient,
      [IosTextToSpeechAudioCategoryOptions.mixWithOthers],
    );
    try {
      await voice.setLanguage('en-AU');
    } catch (_) {}
    await voice.setSpeechRate(0.5);
    await voice.setVolume(1);
    return voice;
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
