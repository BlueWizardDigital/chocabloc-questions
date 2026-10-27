// How <chocabloc-question> looks inside the lesson panel. Part of the lazy
// practice chunk: only question-view.ts imports it, never Help or styles.ts
// (Help is at its size limit). The tokens and fallbacks are styles.ts's own.
// The rules sit on the element, so they beat a --cq-* a host page sets for its games.
const DISPLAY = 'var(--cl-font-display, var(--cl-font-body, var(--cq-font, system-ui)))';
const BODY = 'var(--cl-font-body, var(--cq-font, system-ui))';
const BG = 'var(--cl-bg, #fff8ec)';
const INK = 'var(--cl-ink, #2b2118)';
const ACCENT = 'var(--cl-accent, #ffcf33)';
const BORDER = 'var(--cl-border, #2b2118)';
const RADIUS = 'var(--cl-radius, 16px)';

export const QUESTION_LOOK_CSS = `
chocabloc-question {
  --cq-font: ${BODY}; --cq-text: ${INK};
  --cq-container-padding: 0; --cq-section-gap: 12px;
  --cq-prompt-size: 32px; --cq-prompt-weight: 700;
  --cq-choices-justify: center; --cq-choice-gap: 10px;
  --cq-choice-bg: ${BG}; --cq-choice-text: ${INK};
  --cq-choice-border: 3px solid ${BORDER}; --cq-choice-radius: ${RADIUS};
  --cq-choice-padding: 8px 20px; --cq-choice-min-height: 48px;
  --cq-choice-selected-bg: ${ACCENT}; --cq-choice-selected-text: ${INK};
  --cq-choice-selected-border: 3px solid ${BORDER};
  --cq-choice-selected-shadow: 0 4px 0 0 ${BORDER};
  --cq-choice-correct-border: #1a7f37; --cq-choice-wrong-border: #c0392b;
  --cq-focus-ring: ${INK};
  min-width: 0; max-width: 100%;
  font-size: 22px; font-weight: 700;
}
chocabloc-question::part(container) { align-items: center; text-align: center; }
chocabloc-question::part(prompt) {
  font-family: ${DISPLAY}; font-weight: 700; font-size: 32px; line-height: 1.2; text-align: center;
}
`;
