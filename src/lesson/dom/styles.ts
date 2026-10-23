// The game look from the Compare prototype: cream, ink, yellow buttons, chunky borders.
// Chrome 103: nothing newer (tests/lesson/chrome103.test.ts lists what is refused).
const DISPLAY = 'var(--cl-font-display, var(--cl-font-body, var(--cq-font, system-ui)))';
const BODY = 'var(--cl-font-body, var(--cq-font, system-ui))';
const BG = 'var(--cl-bg, #fff8ec)';
const INK = 'var(--cl-ink, #2b2118)';
const ACCENT = 'var(--cl-accent, #ffcf33)';
const BORDER = 'var(--cl-border, #2b2118)';
const RADIUS = 'var(--cl-radius, 16px)';
const PAPER = 'rgba(255, 255, 255, 0.6)';

export const LESSON_CSS = `
:host { display: block; font-family: ${BODY}; color: ${INK}; }
:host([hidden]) { display: none; }
[hidden] { display: none !important; }
[part~="panel"] {
  box-sizing: border-box; height: 100%; overflow: auto;
  display: flex; flex-direction: column; gap: 14px; padding: 16px;
  background: ${BG}; color: ${INK};
  border: 3px solid ${BORDER}; border-radius: ${RADIUS};
  overflow-wrap: anywhere; line-height: 1.4;
}
.top { display: flex; align-items: flex-start; gap: 8px; }
[part~="chips"] { display: flex; flex-wrap: wrap; gap: 6px; flex: 1 1 auto; min-width: 0; }
[part~="chip"] {
  font-family: ${DISPLAY}; font-weight: 700; font-size: 13px; padding: 3px 10px;
  border-radius: 999px; border: 2px solid ${BORDER}; opacity: 0.55;
}
[part~="chip"].on { background: ${ACCENT}; opacity: 1; }
[part~="chip"].done { opacity: 1; }
.step {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  text-align: center; min-width: 0;
}
.step.enter { opacity: 0; transform: translateY(8px); }
@media (prefers-reduced-motion: no-preference) {
  .step { transition: opacity 0.2s ease-out, transform 0.2s ease-out; }
}
[part~="heading"] {
  font-family: ${DISPLAY}; font-weight: 700; font-size: 26px; line-height: 1.15;
  margin: 0; text-wrap: balance;
}
[part~="heading"]:focus { outline: none; }
[part~="text"] { font-weight: 700; font-size: 17px; margin: 0; max-width: 46ch; }
[part~="tip"] { font-weight: 700; font-size: 15px; margin: 0; max-width: 46ch; opacity: 0.85; }
[part~="result"] { font-family: ${DISPLAY}; font-weight: 700; font-size: 44px; line-height: 1.1; margin: 0; }
.cards {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 10px; width: 100%; max-width: 620px;
}
[part~="card"], [part~="why"] {
  box-sizing: border-box; min-width: 0; background: ${PAPER};
  border: 3px solid ${BORDER}; border-radius: ${RADIUS};
  display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px;
}
[part~="why"] { gap: 10px; padding: 16px; width: 100%; max-width: 560px; }
.big { font-family: ${DISPLAY}; font-weight: 700; font-size: 48px; line-height: 1; }
.words { font-weight: 800; font-size: 15px; }
.eg { font-family: ${DISPLAY}; font-weight: 600; font-size: 18px; }
[part~="picture"] {
  box-sizing: border-box; width: 100%; max-width: 560px;
  display: flex; justify-content: center; overflow-x: auto;
}
[part~="picture"] > canvas { max-width: 360px; }
.b10 { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; width: 100%; max-width: 280px; }
.b10.two { grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 560px; }
.fig {
  min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px;
  background: ${PAPER}; border: 3px solid ${BORDER}; border-radius: ${RADIUS};
}
.num { font-family: ${DISPLAY}; font-weight: 700; font-size: 30px; line-height: 1; }
[part~="caption"] { font-weight: 800; font-size: 14px; }
.nl { display: block; width: 100%; height: auto; color: ${INK}; overflow: visible; }
.nl line { stroke: currentColor; stroke-width: 3; stroke-linecap: round; }
.nl text { fill: currentColor; font: 700 14px ${DISPLAY}; text-anchor: middle; }
.nl .jump { fill: none; stroke: currentColor; stroke-width: 2.5; }
.nl .head { fill: currentColor; }
.nl circle { fill: ${ACCENT}; stroke: currentColor; stroke-width: 2.5; }
.cols {
  display: inline-grid; font-family: ${DISPLAY}; font-weight: 700; line-height: 1.25;
  font-variant-numeric: tabular-nums;
}
.cols span { text-align: center; }
.cols .carry { font-size: 0.55em; align-self: end; }
.cols .result { border-top: 3px solid ${BORDER}; }
.cols .on { background: ${ACCENT}; border-radius: 6px; }
[part~="feedback"] { font-family: ${DISPLAY}; font-weight: 700; font-size: 20px; text-align: center; }
[part~="actions"] {
  display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: center;
  margin-top: auto;
}
[part~="button"] {
  box-sizing: border-box; min-height: 44px; padding: 8px 22px; cursor: pointer;
  font-family: ${DISPLAY}; font-weight: 700; font-size: 20px; line-height: 1.1;
  color: ${INK}; background: ${ACCENT};
  border: 3px solid ${BORDER}; border-radius: ${RADIUS}; box-shadow: 0 4px 0 0 ${BORDER};
}
[part~="button"]:active { transform: translateY(2px); box-shadow: 0 2px 0 0 ${BORDER}; }
[part~="button"]:focus-visible { outline: 3px solid ${INK}; outline-offset: 3px; }
[part~="button"]:disabled { opacity: 0.45; cursor: default; }
[part~="tap-to-hear"] { width: 100%; font-size: 22px; padding: 16px; }
[part~="button"].secondary, [part~="close"], [part~="read-to-me"] { background: ${PAPER}; }
[part~="close"], [part~="read-to-me"] {
  font-family: ${BODY}; font-weight: 800; font-size: 15px; padding: 6px 14px;
  border-width: 2px; box-shadow: none;
}
[part~="close"] { flex: none; }
[part~="read-to-me"] { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; }
[part~="read-to-me"] svg { width: 20px; height: 20px; flex: none; }
`;
