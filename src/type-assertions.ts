// Compile-time checks on public types: `npm run typecheck` fails if one
// regresses. Nothing imports this file, so it is never bundled.
import type { GeometryPerimeterContent } from './types';

// Real perimeter questions have 3–6 sides (Trello 360).
const perimeterPentagon: GeometryPerimeterContent = { shape: 'pentagon', operands: [1, 2, 3, 4, 5] };
void perimeterPentagon;
