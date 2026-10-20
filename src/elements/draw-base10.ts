// — Base-10 blocks —

export type Base10Colors = {
  fillOnes?: string;
  fillTens?: string;
  fillHundreds?: string;
  fillThousands?: string;
  stroke?: string;
};

type B10 = { thousands?: number; hundreds?: number; tens?: number; ones?: number };

const B10C = 14;
const B10G = 3;
const B10RH = B10C * 10 + B10G * 9;
const B10D = 20;

const B10_FILL = {
  ones: '#90caf9', tens: '#a5d6a7', hundreds: '#ffcc80', thousands: '#ef9a9a',
};
function b10W(blocks: B10): number {
  let w = 0;
  if ((blocks.thousands ?? 0) > 0) w += (blocks.thousands!) * (B10RH + B10D + 8);
  if ((blocks.hundreds ?? 0) > 0) w += (blocks.hundreds!) * (B10RH + 6);
  if ((blocks.tens ?? 0) > 0) w += (blocks.tens!) * (B10C + 4);
  if ((blocks.ones ?? 0) > 0) w += Math.min(blocks.ones!, 5) * (B10C + B10G);
  return w + 10;
}

function b10H(blocks: B10): number {
  if ((blocks.thousands ?? 0) > 0) return B10RH + 40;
  if ((blocks.hundreds ?? 0) > 0) return B10RH + 20;
  if ((blocks.tens ?? 0) > 0) return B10RH + 20;
  const oR = Math.ceil((blocks.ones ?? 0) / 5);
  return Math.max(oR * (B10C + B10G) + 20, 60);
}

type B10Fills = { ones: string; tens: string; hundreds: string; thousands: string };

function b10Render(
  ctx: CanvasRenderingContext2D, blocks: B10,
  x0: number, y0: number,
  fills: B10Fills, stroke: string,
): void {
  let x = x0;
  const kCount = blocks.thousands ?? 0;
  const hCount = blocks.hundreds ?? 0;
  const tCount = blocks.tens ?? 0;
  const oCount = blocks.ones ?? 0;
  const flatS = B10RH;
  const lw = 1.5;

  for (let i = 0; i < kCount; i++) {
    ctx.fillStyle = fills.thousands;
    ctx.fillRect(x, y0 + B10D, flatS, flatS);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    ctx.strokeRect(x, y0 + B10D, flatS, flatS);
    ctx.lineWidth = 1;
    for (let r = 1; r < 10; r++) {
      const ly = y0 + B10D + r * (B10C + B10G) - B10G / 2;
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + flatS, ly); ctx.stroke();
    }
    for (let c = 1; c < 10; c++) {
      const lx = x + c * (B10C + B10G) - B10G / 2;
      ctx.beginPath(); ctx.moveTo(lx, y0 + B10D); ctx.lineTo(lx, y0 + B10D + flatS); ctx.stroke();
    }
    ctx.fillStyle = fills.thousands; ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y0 + B10D);
    ctx.lineTo(x + B10D, y0);
    ctx.lineTo(x + flatS + B10D, y0);
    ctx.lineTo(x + flatS, y0 + B10D);
    ctx.closePath();
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
    ctx.fillStyle = fills.thousands; ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + flatS, y0 + B10D);
    ctx.lineTo(x + flatS + B10D, y0);
    ctx.lineTo(x + flatS + B10D, y0 + flatS);
    ctx.lineTo(x + flatS, y0 + B10D + flatS);
    ctx.closePath();
    ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    x += flatS + B10D + 8;
  }

  for (let i = 0; i < hCount; i++) {
    ctx.fillStyle = fills.hundreds;
    ctx.fillRect(x, y0, flatS, flatS);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    ctx.strokeRect(x, y0, flatS, flatS);
    ctx.lineWidth = 1;
    for (let r = 1; r < 10; r++) {
      const ly = y0 + r * (B10C + B10G) - B10G / 2;
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + flatS, ly); ctx.stroke();
    }
    for (let c = 1; c < 10; c++) {
      const lx = x + c * (B10C + B10G) - B10G / 2;
      ctx.beginPath(); ctx.moveTo(lx, y0); ctx.lineTo(lx, y0 + flatS); ctx.stroke();
    }
    x += flatS + 6;
  }

  const rodTop = y0;
  for (let i = 0; i < tCount; i++) {
    ctx.fillStyle = fills.tens;
    ctx.fillRect(x, rodTop, B10C, B10RH);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    ctx.strokeRect(x, rodTop, B10C, B10RH);
    ctx.lineWidth = 1;
    for (let r = 1; r < 10; r++) {
      const ly = rodTop + r * (B10C + B10G) - B10G / 2;
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + B10C, ly); ctx.stroke();
    }
    x += B10C + 4;
  }

  if (oCount > 0) {
    const cols = Math.min(oCount, 5);
    const rows = Math.ceil(oCount / 5);
    const hasVertical = hCount > 0 || tCount > 0 || kCount > 0;
    const cubeTop = hasVertical
      ? y0 + B10RH - rows * (B10C + B10G) + B10G
      : y0;
    let drawn = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols && drawn < oCount; c++) {
        const bx = x + c * (B10C + B10G);
        const by = cubeTop + r * (B10C + B10G);
        ctx.fillStyle = fills.ones;
        ctx.fillRect(bx, by, B10C, B10C);
        ctx.strokeStyle = stroke; ctx.lineWidth = lw;
        ctx.strokeRect(bx, by, B10C, B10C);
        drawn++;
      }
    }
  }
}

function b10ScaledSet(
  ctx: CanvasRenderingContext2D, blocks: B10,
  ox: number, oy: number, availW: number, availH: number,
  fills: B10Fills, stroke: string,
): void {
  const natW = b10W(blocks);
  const natH = b10H(blocks);
  if (natW <= 0 || natH <= 0) return;
  const pad = 4;
  const scale = Math.min((availW - 2 * pad) / natW, (availH - 2 * pad) / natH, 1);
  const offX = ox + (availW - natW * scale) / 2;
  const offY = oy + (availH - natH * scale) / 2;
  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);
  b10Render(ctx, blocks, 0, 0, fills, stroke);
  ctx.restore();
}

export function drawBase10Blocks(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  content: {
    operation?: string; blocks?: B10;
    tens_shown?: number; ones_shown?: number;
    set_a?: { number: number; blocks: B10 };
    set_b?: { number: number; blocks: B10 };
  },
  colors?: Base10Colors,
): void {
  ctx.clearRect(0, 0, w, h);
  const fills: B10Fills = {
    ones: colors?.fillOnes ?? B10_FILL.ones,
    tens: colors?.fillTens ?? B10_FILL.tens,
    hundreds: colors?.fillHundreds ?? B10_FILL.hundreds,
    thousands: colors?.fillThousands ?? B10_FILL.thousands,
  };
  const stroke = colors?.stroke ?? '#000';
  const op = content.operation ?? '';

  if (op === 'base10_compare') {
    const blocksA = content.set_a?.blocks ?? {};
    const blocksB = content.set_b?.blocks ?? {};
    const mid = w / 2;
    ctx.fillStyle = '#666'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Set A', mid / 2, 12);
    ctx.fillText('Set B', mid + mid / 2, 12);
    b10ScaledSet(ctx, blocksA, 0, 18, mid, h - 18, fills, stroke);
    b10ScaledSet(ctx, blocksB, mid, 18, mid, h - 18, fills, stroke);
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(mid, 5); ctx.lineTo(mid, h - 5); ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  // base10_block_count never gets here: it has no picture (ChocaCanvasQuestion).
  const blocks: B10 = op === 'base10_regroup'
    ? { tens: content.tens_shown ?? 0, ones: content.ones_shown ?? 0 }
    : content.blocks ?? {};
  b10ScaledSet(ctx, blocks, 0, 0, w, h, fills, stroke);
}
