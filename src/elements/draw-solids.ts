import { frame3D, isoProjection, fillFaces, type Pt } from './canvas-primitives';

export type SolidFace = {
  kind: 'triangle' | 'square' | 'pentagon' | 'hexagon' | 'rectangle';
  corners: Pt[];
  shade: string;
};

type Vec = [number, number, number];
type Solid = { sides: number; base: SolidFace['kind']; pyramid: boolean; cornerFront: boolean };

// The solids built here, from a regular base. The square pyramid is today's
// pyramid drawing, and the cube, rectangular prism and triangular prism keep
// their own drawings too (canvas-draws.ts).
//
// `cornerFront`: a corner of the base faces the viewer, not a side. A prism
// always shows a side, which draws as a true rectangle. A pyramid's base is
// hidden from above, so it is turned to show as many sides as it can: side-on,
// a triangular pyramid shows one face and looks flat, and a hexagonal pyramid
// shows three, like a pentagonal one; corner-on they show two and four.
const SOLIDS = new Map<string, Solid>([
  ['triangular pyramid', { sides: 3, base: 'triangle', pyramid: true, cornerFront: true }],
  ['pentagonal pyramid', { sides: 5, base: 'pentagon', pyramid: true, cornerFront: false }],
  ['hexagonal pyramid', { sides: 6, base: 'hexagon', pyramid: true, cornerFront: true }],
  ['pentagonal prism', { sides: 5, base: 'pentagon', pyramid: false, cornerFront: false }],
  ['hexagonal prism', { sides: 6, base: 'hexagon', pyramid: false, cornerFront: false }],
]);

// The base has radius 1; the apex, or the top, is HEIGHT above it. At 2, a
// prism's side is clearly taller than it is wide, so it never reads as a square.
const HEIGHT = 2;
// Space kept clear around the solid, the same as boxFor keeps around a box.
const MARGIN = 18;

const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: Vec): Vec => {
  const n = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / n, v[1] / n, v[2] / n];
};

// isoProjection looks down this direction, so a face whose normal points along
// it faces the viewer, and one whose normal points away is hidden.
const VIEW = unit([1, 1, 1]);
// Lit from the upper left, like the cube: its top is light, its front-left face
// mid and its right face dark. The thresholds sit at least 0.05 from every face
// the five solids show, so no face is a rounding error away from another shade.
const LIGHT = unit([-0.3, 0.8, 0.5]);

function shade(normal: Vec): string {
  const lit = dot(normal, LIGHT);
  return lit > 0.64 ? '#ede7f6' : lit > 0 ? '#d1c4e9' : '#b39ddb';
}

/** Each face's corners, in 3D: the base on y = 0, then the sides (and a prism's top). */
function solidFaces({ sides, base, pyramid, cornerFront }: Solid): { kind: SolidFace['kind']; corners: Vec[] }[] {
  // The viewer looks from 45° round the y axis (VIEW), so a corner there faces
  // them; half a side further round, a side does.
  const start = Math.PI / 4 - (cornerFront ? 0 : Math.PI / sides);
  const ring = (y: number): Vec[] => Array.from({ length: sides }, (_, k): Vec => {
    const a = start + (2 * Math.PI * k) / sides;
    return [Math.cos(a), y, Math.sin(a)];
  });
  const bottom = ring(0);
  const next = (k: number) => (k + 1) % sides;
  if (pyramid) {
    const apex: Vec = [0, HEIGHT, 0];
    return [
      { kind: base, corners: bottom },
      ...bottom.map((p, k) => ({ kind: 'triangle' as const, corners: [p, bottom[next(k)]!, apex] })),
    ];
  }
  const top = ring(HEIGHT);
  return [
    { kind: base, corners: bottom },
    { kind: base, corners: top },
    ...bottom.map((p, k) => ({ kind: 'rectangle' as const, corners: [p, bottom[next(k)]!, top[next(k)]!, top[k]!] })),
  ];
}

/**
 * The projection that fits these corners on a w × h canvas, centred, with
 * MARGIN to spare, and never larger than frame3D's scale (as boxFor does).
 */
function fitProjection(corners: Vec[], w: number, h: number): (p: Vec) => Pt {
  const flat = isoProjection(0, 0, 1);
  const pts = corners.map(([x, y, z]) => flat(x, y, z));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const { s } = frame3D(w, h);
  const k = Math.min(s, (w - 2 * MARGIN) / (maxX - minX), (h - 2 * MARGIN) / (maxY - minY));
  const iso = isoProjection(w / 2 - ((minX + maxX) / 2) * k, h / 2 - ((minY + maxY) / 2) * k, k);
  return ([x, y, z]) => iso(x, y, z);
}

/**
 * A prism or pyramid on a regular base, in the same isometric view as the
 * cube, fitted to the canvas. Each face's corners wind the same way seen from
 * outside, and the faces run back to front: every hidden face comes before
 * every face the viewer sees, so drawing them in order covers the hidden ones.
 * Null for a name it does not build.
 */
export function solidGeometry(name: string, w: number, h: number): SolidFace[] | null {
  const solid = SOLIDS.get(name.toLowerCase());
  if (!solid) return null;
  const inside: Vec = [0, HEIGHT / 4, 0];
  const faces = solidFaces(solid).map(({ kind, corners }) => {
    const normal = unit(cross(sub(corners[1]!, corners[0]!), sub(corners[2]!, corners[0]!)));
    // Every face is convex and the solid is too, so the normal points out when
    // it points away from a point inside. If not, turn the corners round.
    return dot(normal, sub(corners[0]!, inside)) > 0
      ? { kind, corners, normal }
      : { kind, corners: [...corners].reverse(), normal: [-normal[0], -normal[1], -normal[2]] as Vec };
  });
  // Stable: faces turned equally far toward the viewer keep the order above.
  faces.sort((a, b) => dot(a.normal, VIEW) - dot(b.normal, VIEW));
  const project = fitProjection(faces.flatMap((f) => f.corners), w, h);
  return faces.map((f) => ({ kind: f.kind, corners: f.corners.map(project), shade: shade(f.normal) }));
}

/** The faces in order, filled and outlined in the stroke drawShape3D sets. */
export function drawSolid(ctx: CanvasRenderingContext2D, faces: SolidFace[]): void {
  fillFaces(ctx, faces.map((f): [Pt[], string] => [f.corners, f.shade]));
}

/**
 * The corners of the frontmost face of that kind (the last one drawn), or null
 * when the solid has none. A pyramid's base is its only face of that kind;
 * hidden from above, its outline shows through the sides, as today's pyramid
 * base does.
 */
export function solidFaceOutline(faces: SolidFace[], faceShape: string): Pt[] | null {
  const kind = faceShape.toLowerCase();
  for (let i = faces.length - 1; i >= 0; i--) {
    if (faces[i]!.kind === kind) return faces[i]!.corners;
  }
  return null;
}
