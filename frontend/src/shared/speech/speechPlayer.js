import { PRESET_SPEECH } from "./presetSpeech";

class SpeechPlayer {
  constructor() {
    this.audio = typeof Audio === "undefined" ? null : new Audio();
    this.objectUrl = "";
    this.listeners = new Set();
    this.playbackWaiters = new Set();

    if (this.audio) {
      this.audio.preload = "auto";
      this.audio.addEventListener("ended", () => this.handleEnded());
      this.audio.addEventListener("error", () => this.handleEnded());
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  emit(status) {
    this.listeners.forEach((listener) => listener(status));
  }

  async playPreset(id, options) {
    const source = PRESET_SPEECH[id];

    if (!source) {
      throw new Error("등록되지 않은 고정 음성입니다.");
    }

    await this.play(source, options);
  }

  async playTts(audioBlob, options) {
    this.releaseObjectUrl();
    this.objectUrl = URL.createObjectURL(audioBlob);

    await this.play(this.objectUrl, options);
  }

  preloadPreset(id) {
    const source = PRESET_SPEECH[id];

    if (!source || typeof Audio === "undefined") {
      return;
    }

    const preloadAudio = new Audio();
    preloadAudio.preload = "auto";
    preloadAudio.src = source;
  }

  stop() {
    if (!this.audio) {
      return;
    }

    this.audio.pause();
    this.audio.currentTime = 0;
    this.releaseObjectUrl();
    this.resolvePlaybackWaiters();
    this.emit("idle");
  }

  async play(source, { waitForEnd = false } = {}) {
    if (!this.audio) {
      throw new Error("이 기기에서는 음성 재생을 지원하지 않아요.");
    }

    this.stop();
    this.audio.src = source;

    await this.audio.play();
    this.emit("playing");

    if (waitForEnd) {
      await this.waitForPlaybackEnd();
    }
  }

  handleEnded() {
    this.releaseObjectUrl();
    this.resolvePlaybackWaiters();
    this.emit("idle");
  }

  waitForPlaybackEnd() {
    return new Promise((resolve) => {
      this.playbackWaiters.add(resolve);
    });
  }

  resolvePlaybackWaiters() {
    this.playbackWaiters.forEach((resolve) => resolve());
    this.playbackWaiters.clear();
  }

  releaseObjectUrl() {
    if (!this.objectUrl) {
      return;
    }

    URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = "";
  }
}

export const speechPlayer = new SpeechPlayer();
