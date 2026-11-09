// What the lesson player and the help panel share of the voice's buttons. Keep this free of the
// player's own modules, or the help bundle would pull them in.
import { svg } from './svg';

export function speakerIcon(): SVGSVGElement {
  const icon = svg('svg', {
    viewBox: '0 0 24 24',
    width: 20,
    height: 20,
    'aria-hidden': 'true',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2.4,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  icon.append(
    svg('path', { d: 'M4 9v6h4l5 4V5L8 9H4z', fill: 'currentColor' }),
    svg('path', { d: 'M16.5 8.5a5 5 0 0 1 0 7' }),
    svg('path', { d: 'M19 6a8.5 8.5 0 0 1 0 12' }),
  );
  return icon;
}

/** Browsers refuse speech until the page has been tapped; until then a young kid gets Tap to hear. */
export function voiceUnlocked(tapped: boolean): boolean {
  return tapped || navigator.userActivation?.hasBeenActive !== false;
}
