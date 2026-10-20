export interface Speaker {
  /** False where the browser has no speechSynthesis; the player then hides Read to me. */
  readonly supported: boolean;
  speak(text: string): void;
  cancel(): void;
}

const warn = (what: string, e: unknown): void => console.warn(`[chocabloc-lesson] ${what}:`, e);

/**
 * Read to me through the browser's own voice. Speech is an extra, so a voice
 * that throws (or has none for `lang`) is logged and never breaks the player.
 */
export function createSpeaker(lang: string): Speaker {
  let synth: SpeechSynthesis | undefined;
  try {
    const s: SpeechSynthesis | undefined = window.speechSynthesis;
    if (s != null && typeof SpeechSynthesisUtterance === 'function') synth = s;
  } catch (e) {
    warn('speech is unavailable', e);
  }
  return {
    supported: synth != null,
    speak(text) {
      if (!synth) return;
      try {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = 0.9;
        synth.speak(u);
      } catch (e) {
        warn('Read to me failed', e);
      }
    },
    cancel() {
      if (!synth) return;
      try {
        synth.cancel();
      } catch (e) {
        warn('could not stop speech', e);
      }
    },
  };
}
