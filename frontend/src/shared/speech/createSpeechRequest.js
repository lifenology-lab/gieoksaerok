import { PRESET_SPEECH } from "./presetSpeech";

export const SPEECH_MODE = {
  NONE: "none",
  PRESET: "preset",
  TTS: "tts",
};

export function createNoSpeechRequest() {
  return { mode: SPEECH_MODE.NONE };
}

export function createPresetSpeechRequest(id) {
  if (!PRESET_SPEECH[id]) {
    return createNoSpeechRequest();
  }

  return { mode: SPEECH_MODE.PRESET, id };
}

export function createTtsSpeechRequest(text) {
  const normalizedText = typeof text === "string" ? text.trim() : "";

  if (!normalizedText) {
    return createNoSpeechRequest();
  }

  return { mode: SPEECH_MODE.TTS, text: normalizedText };
}
