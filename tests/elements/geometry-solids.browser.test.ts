import { expect } from '@esm-bundle/chai';
import '../../src/elements/ChocaCanvasQuestion';
import { normalizeQuestion } from '../../src/helpers/normalizer';
import { solidGeometry, solidFaceOutline } from '../../src/elements/draw-solids';

afterEach(() => {
  document.body.innerHTML = '';
});

// Canvas output is asserted by spying on the 2D context, not by reading pixels.
// `log` holds the watched calls and sets in order; a set appears as fn
// `set:<prop>` with the value as its only arg.
type CtxCall = { fn: string; args: unknown[] };
type CanvasProto = { getContext: (...a: unknown[]) => unknown };

const WATCHED_CALLS = new Set(['moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'fillText', 'arc', 'ellipse']);
const WATCHED_SETS = new Set(['strokeStyle', 'fillStyle', 'lineWidth']);

function spyCanvas(): { log: CtxCall[]; restore: () => void } {
  const log: CtxCall[] = [];
  const proto = HTMLCanvasElement.prototype as unknown as CanvasProto;
  const orig = proto.getContext;
  proto.getContext = function (this: HTMLCanvasElement, ...args: unknown[]): unknown {
    const ctx = orig.apply(this, args) as CanvasRenderingContext2D | null;
    if (args[0] !== '2d' || !ctx) return ctx;
    return new Proxy(ctx, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target) as unknown;
        if (typeof value !== 'function') return value;
        const fn = value as (...a: unknown[]) => unknown;
        return (...a: unknown[]): unknown => {
          if (WATCHED_CALLS.has(prop as string)) log.push({ fn: prop as string, args: a });
          return fn.apply(target, a);
        };
      },
      set(target, prop, value) {
        if (WATCHED_SETS.has(prop as string)) log.push({ fn: `set:${prop as string}`, args: [value] });
        Reflect.set(target, prop, value, target);
        return true;
      },
    });
  };
  return { log, restore: () => { proto.getContext = orig; } };
}

function render(question: unknown): CtxCall[] {
  const spy = spyCanvas();
  try {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<choca-canvas-question answer-mode="mc" seed="42"></choca-canvas-question>';
    document.body.appendChild(wrapper);
    (wrapper.firstElementChild as HTMLElement & { question: unknown }).question = question;
    return spy.log;
  } finally {
    spy.restore();
  }
}

/* ---------- rows, as the bank sends them (choices-only) ---------- */

const wire = (r: Record<string, unknown>) => normalizeQuestion({
  imageType: 'shape_3d', difficulty: 'medium', answerToken: 'test-token-not-real', questionText: 'q', ...r,
});

const identify = (shape: string) => wire({
  id: `GEOM-3D-NAME-${shape.replace(/ /g, '-')}`, skillIds: ['GEOM-3D-NAME'], format: 'geometry_identify',
  content: { shape, operation: 'geometry_identify' },
  choices: [shape, 'cube', 'cylinder', 'cone'].map((value) => ({ value })),
});

const faceRow = (shape: string, face: string) => wire({
  id: `GEOM-3D-FACES-IDENTIFY-${shape}-${face}`.replace(/ /g, '-'), skillIds: ['GEOM-3D-FACES-IDENTIFY'],
  format: 'geometry_face_identify',
  content: { shape, face_shape: face, operation: 'geometry_face_identify' },
  choices: ['triangle', 'rectangle', 'pentagon', 'hexagon'].map((value) => ({ value })),
});

/* ---------- reading the log ---------- */

type Pt = { x: number; y: number };
const W = 300, H = 200; // the element's canvas
const STROKE_3D = '#7c4dff';
const HIGHLIGHT_STROKE = '#e65100';
const PURPLES = ['#ede7f6', '#d1c4e9', '#b39ddb'];
const CORNERS: Record<string, number> = { triangle: 3, square: 4, rectangle: 4, pentagon: 5, hexagon: 6 };

/** Index in `log` where the face highlight set its stroke colour, or -1. */
function highlightStart(log: CtxCall[]): number {
  return log.map((c) => c.fn === 'set:strokeStyle' && c.args[0] === HIGHLIGHT_STROKE).lastIndexOf(true);
}

/** Each moveTo starts a path; the lineTo calls after it are its corners. */
function paths(log: CtxCall[]): Pt[][] {
  const out: Pt[][] = [];
  for (const c of log) {
    const p = { x: c.args[0] as number, y: c.args[1] as number };
    if (c.fn === 'moveTo') out.push([p]);
    else if (c.fn === 'lineTo' && out.length > 0) out[out.length - 1]!.push(p);
  }
  return out;
}

/** The solid's own faces: every path traced before the highlight. */
function solidPaths(log: CtxCall[]): Pt[][] {
  const at = highlightStart(log);
  return paths(at < 0 ? log : log.slice(0, at));
}

/** The highlight's paths: every path traced after its colour was set. */
function highlightPaths(log: CtxCall[]): Pt[][] {
  const at = highlightStart(log);
  return at < 0 ? [] : paths(log.slice(at));
}

/** Signed area on the canvas (y down): its sign says which way the corners wind. */
function signedArea(pts: Pt[]): number {
  return pts.reduce((sum, p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return sum + (p.x * q.y - q.x * p.y);
  }, 0) / 2;
}

const tall = (pts: Pt[]) => Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
const wide = (pts: Pt[]) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));

/* ---------- the solids ---------- */

// The five built by draw-solids, with each kind of face they have. A
// pyramid's base is named by its shape, and its sides are triangles; a
// prism's ends are named by their shape, and its sides are rectangles.
const SOLIDS: { shape: string; faces: Record<string, number> }[] = [
  { shape: 'triangular pyramid', faces: { triangle: 4 } },
  { shape: 'pentagonal pyramid', faces: { pentagon: 1, triangle: 5 } },
  { shape: 'hexagonal pyramid', faces: { hexagon: 1, triangle: 6 } },
  { shape: 'pentagonal prism', faces: { pentagon: 2, rectangle: 5 } },
  { shape: 'hexagonal prism', faces: { hexagon: 2, rectangle: 6 } },
];

// Every new name in the contract: the five above, and the square pyramid.
const ALL_NEW = ['triangular pyramid', 'square pyramid', ...SOLIDS.slice(1).map((s) => s.shape)];

const isPyramidBase = (shape: string, face: string) => shape.endsWith('pyramid') && face !== 'triangle';

describe('the new solids are drawn in the 3D style', () => {
  for (const shape of ALL_NEW) {
    describe(shape, () => {
      it('draws the solid, not the "?" placeholder, and writes nothing', () => {
        const log = render(identify(shape));

        expect(log.filter((c) => c.fn === 'fillText'), 'no text on the canvas').to.deep.equal([]);
        expect(solidPaths(log).length, 'faces traced').to.be.at.least(4);
      });

      it('uses the 3D stroke and only the three purple fills', () => {
        const log = render(identify(shape));
        const sets = (prop: string) => log.filter((c) => c.fn === `set:${prop}`).map((c) => c.args[0]);

        expect(sets('strokeStyle')).to.deep.equal([STROKE_3D]);
        expect(sets('lineWidth')).to.deep.equal([2]);
        const fills = sets('fillStyle');
        expect(fills.length).to.be.greaterThan(0);
        for (const f of fills) expect(PURPLES, `fill ${String(f)}`).to.include(f);
      });

      it('fits the canvas with an 18px margin, and fills at least two thirds of its height', () => {
        const pts = solidPaths(render(identify(shape))).flat();

        for (const p of pts) {
          expect(p.x, 'x').to.be.within(18 - 1e-6, W - 18 + 1e-6);
          expect(p.y, 'y').to.be.within(18 - 1e-6, H - 18 + 1e-6);
        }
        expect(tall(pts)).to.be.at.least(H * 2 / 3);
      });
    });
  }

  it('an unknown solid still draws the "?" placeholder', () => {
    const log = render(identify('octagonal prism'));

    expect(log.filter((c) => c.fn === 'fillText').map((c) => c.args[0])).to.deep.equal(['?']);
  });

  it('a capitalised name draws the same solid', () => {
    expect(render(identify('Hexagonal Prism'))).to.deep.equal(render(identify('hexagonal prism')));
  });
});

describe('the square pyramid is today\'s pyramid', () => {
  it('draws exactly what "pyramid" draws', () => {
    expect(render(identify('square pyramid'))).to.deep.equal(render(identify('pyramid')));
  });

  for (const face of ['square', 'triangle']) {
    it(`highlights its ${face} face exactly as "pyramid" does`, () => {
      const log = render(faceRow('square pyramid', face));

      expect(highlightStart(log), 'a highlight is drawn').to.be.greaterThan(-1);
      expect(log).to.deep.equal(render(faceRow('pyramid', face)));
    });
  }

  it('its triangle highlight is one of the drawn faces', () => {
    const log = render(faceRow('square pyramid', 'triangle'));

    expect(solidPaths(log)).to.deep.include(highlightPaths(log)[0]);
  });

  // Today's pyramid never traces its base (it is hidden from above), so the
  // square highlight is checked corner by corner instead.
  it('its square highlight runs through four corners of the drawn pyramid', () => {
    const log = render(faceRow('square pyramid', 'square'));
    const drawn = solidPaths(log).flat();
    const [base] = highlightPaths(log);

    expect(base).to.have.lengthOf(4);
    for (const c of base!) expect(drawn).to.deep.include(c);
  });
});

describe('each face kind is highlighted on a drawn face', () => {
  for (const s of SOLIDS) {
    for (const face of Object.keys(s.faces)) {
      describe(`${s.shape}, ${face}`, () => {
        it(`fills one ${CORNERS[face]}-corner path whose corners are a drawn face's corners`, () => {
          const log = render(faceRow(s.shape, face));
          const h = highlightPaths(log);

          expect(h, 'one highlight path').to.have.lengthOf(1);
          expect(h[0]).to.have.lengthOf(CORNERS[face]!);
          expect(solidPaths(log)).to.deep.include(h[0]);
          expect(log.slice(highlightStart(log)).map((c) => c.fn), 'the highlight is filled').to.include('fill');
          expect(log.filter((c) => c.fn === 'fillText'), 'the face is never named').to.deep.equal([]);
        });

        it('picks the frontmost face of that kind', () => {
          const log = render(faceRow(s.shape, face));
          const drawn = solidPaths(log);
          const [h] = highlightPaths(log);
          const sameKind = drawn.filter((p) => p.length === CORNERS[face]);

          expect(h, 'a highlight is drawn').to.not.equal(undefined);
          expect(h, 'the last face of that kind to be drawn').to.deep.equal(sameKind[sameKind.length - 1]);
          if (isPyramidBase(s.shape, face)) return; // a pyramid's only base, hidden from above (like today's pyramid)
          const front = Math.sign(signedArea(drawn[drawn.length - 1]!));
          expect(Math.sign(signedArea(h!)), 'it faces the viewer').to.equal(front);
        });

        it('is big enough to read', () => {
          const [h] = highlightPaths(render(faceRow(s.shape, face)));

          expect(tall(h!), 'at least 25px tall').to.be.at.least(25);
          expect(wide(h!), 'at least 40px wide').to.be.at.least(40);
        });
      });
    }
  }
});

describe('the solids are drawn back to front', () => {
  for (const s of SOLIDS) {
    it(`${s.shape}: every face turned away is drawn before every face turned toward the viewer`, () => {
      const drawn = solidPaths(render(identify(s.shape)));
      const signs = drawn.map((p) => Math.sign(signedArea(p)));
      const front = signs[signs.length - 1]!;
      const firstFront = signs.indexOf(front);

      expect(drawn, 'every face is traced').to.have.lengthOf(Object.values(s.faces).reduce((a, b) => a + b, 0));
      for (const p of drawn) expect(Math.abs(signedArea(p)), 'no face is edge-on').to.be.greaterThan(50);
      expect(signs.slice(0, firstFront).every((g) => g === -front), 'turned away first').to.equal(true);
      expect(signs.slice(firstFront).every((g) => g === front), 'then turned toward').to.equal(true);
      expect(firstFront, 'at least one face is hidden').to.be.greaterThan(0);
      expect(drawn.length - firstFront, 'at least two faces show').to.be.at.least(2);
    });
  }
});

// With the base hidden from above, the faces you can see are what tells a
// pentagonal pyramid from a hexagonal one.
describe('each solid shows its own number of faces', () => {
  const SHOWN: Record<string, number> = {
    'triangular pyramid': 2, 'pentagonal pyramid': 3, 'hexagonal pyramid': 4,
    'pentagonal prism': 4, 'hexagonal prism': 4, // the top and three sides
  };
  for (const [shape, shown] of Object.entries(SHOWN)) {
    it(`${shape}: ${shown}`, () => {
      const drawn = solidPaths(render(identify(shape)));
      const front = Math.sign(signedArea(drawn[drawn.length - 1]!));

      expect(drawn.filter((p) => Math.sign(signedArea(p)) === front)).to.have.lengthOf(shown);
    });
  }
});

describe('a face the solid does not have', () => {
  for (const [shape, face] of [['hexagonal prism', 'circle'], ['pentagonal pyramid', 'rectangle'], ['hexagonal prism', 'pentagon']] as const) {
    it(`${shape}, ${face}: the solid alone, no highlight, no text`, () => {
      const log = render(faceRow(shape, face));

      expect(highlightStart(log)).to.equal(-1);
      expect(log.filter((c) => c.fn === 'fillText')).to.deep.equal([]);
      expect(solidPaths(log)).to.deep.equal(solidPaths(render(identify(shape))));
    });
  }
});

describe('solidGeometry and solidFaceOutline', () => {
  it('builds only the five new solids', () => {
    for (const name of ['cube', 'pyramid', 'square pyramid', 'triangular prism', 'octagonal prism', '', 'constructor', '__proto__']) {
      expect(solidGeometry(name, W, H), name).to.equal(null);
    }
  });

  for (const s of SOLIDS) {
    it(`${s.shape}: its faces, by kind`, () => {
      const faces = solidGeometry(s.shape, W, H)!;
      const counts: Record<string, number> = {};
      for (const f of faces) {
        counts[f.kind] = (counts[f.kind] ?? 0) + 1;
        expect(f.corners, f.kind).to.have.lengthOf(CORNERS[f.kind]!);
        expect(PURPLES).to.include(f.shade);
      }
      expect(counts).to.deep.equal(s.faces);
    });
  }

  it('solidFaceOutline: the last face of that kind, or null', () => {
    const faces = solidGeometry('hexagonal prism', W, H)!;
    const rectangles = faces.filter((f) => f.kind === 'rectangle');

    expect(solidFaceOutline(faces, 'rectangle')).to.equal(rectangles[rectangles.length - 1]!.corners);
    expect(solidFaceOutline(faces, 'Rectangle')).to.equal(rectangles[rectangles.length - 1]!.corners);
    expect(solidFaceOutline(faces, 'circle')).to.equal(null);
    expect(solidFaceOutline(faces, 'triangle')).to.equal(null);
  });
});
