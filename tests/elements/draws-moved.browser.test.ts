import { expect } from '@esm-bundle/chai';
import * as cd from '../../src/elements/canvas-draws';
import * as da from '../../src/elements/draw-array';
import * as db from '../../src/elements/draw-base10';

function paintedPixels(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const data = ctx.getImageData(0, 0, w, h).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
  return n;
}

describe('moved drawings', () => {
  it('canvas-draws re-exports the same functions', () => {
    expect(cd.drawArray).to.equal(da.drawArray);
    expect(cd.drawBase10Blocks).to.equal(db.drawBase10Blocks);
  });

  it('drawBase10Blocks paints pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 120;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    db.drawBase10Blocks(ctx, 200, 120, { blocks: { tens: 3, ones: 4 } });
    expect(paintedPixels(ctx, 200, 120)).to.be.greaterThan(0);
  });

  it('drawArray paints pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 120;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    da.drawArray(ctx, 200, 120, [3, 4]);
    expect(paintedPixels(ctx, 200, 120)).to.be.greaterThan(0);
  });
});
