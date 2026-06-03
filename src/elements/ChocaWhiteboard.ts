import { parseMathExpression, type MathLayout, type StackedMathLayout } from '../helpers/stacked-math';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number; tool: 'pen' | 'eraser' };

const COLORS: readonly { hex: string; name: string }[] = [
  { hex: '#222', name: 'Black' }, { hex: '#e74c3c', name: 'Red' },
  { hex: '#2980b9', name: 'Blue' }, { hex: '#27ae60', name: 'Green' },
  { hex: '#f39c12', name: 'Orange' },
];
const WIDTHS = [2, 4, 8];

export class ChocaWhiteboard extends HTMLElement {
  static observedAttributes = ['math-expression'];

  private _shadow: ShadowRoot;
  private _canvas!: HTMLCanvasElement;
  private _strokes: Stroke[] = [];
  private _current: Stroke | null = null;
  private _tool: 'pen' | 'eraser' = 'pen';
  private _ctx: CanvasRenderingContext2D | null = null;
  private _color = COLORS[0]!.hex;
  private _width = WIDTHS[1]!;
  private _toolRow!: HTMLElement;
  private _clearPending = false;
  private _mathLayout: MathLayout | null = null;
  private _mathVisible = false;
  private _mathBtn!: HTMLButtonElement;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this._build();
  }

  get activeTool(): string { return this._tool; }
  get strokeCount(): number { return this._strokes.length; }
  get hasMathTemplate(): boolean { return this._mathLayout !== null; }
  clear(): void { this._strokes = []; this._current = null; this._redraw(); }

  setMathExpression(expr: string): void {
    try {
      if (!expr) {
        this._dispatchMathError(expr, 'empty-expression');
        return;
      }
      const layout = parseMathExpression(expr);
      if (!layout) {
        this._dispatchMathError(expr, 'parse-failed');
        return;
      }
      if (layout.kind !== 'stacked' || (layout.operator !== '+' && layout.operator !== '-')) {
        this._dispatchMathError(expr, 'unsupported-layout');
        return;
      }
      this._mathLayout = layout;
      this._mathVisible = true;
      this._mathBtn.style.display = '';
      this._mathBtn.setAttribute('aria-pressed', 'true');
      this._redraw();
      this.dispatchEvent(new CustomEvent('choca-whiteboard-math-set', {
        detail: { expression: expr, layout },
        bubbles: true,
        composed: true,
      }));
    } catch {
      this._dispatchMathError(expr, 'unexpected-error');
    }
  }

  clearMathTemplate(): void {
    this._mathLayout = null;
    this._mathVisible = false;
    this._mathBtn.style.display = 'none';
    this._mathBtn.setAttribute('aria-pressed', 'false');
    this._redraw();
  }

  attributeChangedCallback(name: string, _old: string | null, val: string | null): void {
    if (name === 'math-expression') {
      if (val === null || val === '') this.clearMathTemplate();
      else this.setMathExpression(val);
    }
  }

  private _build(): void {
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      [part="wb-panel"] {
        background: var(--cq-tool-bg, #fff); border: var(--cq-tool-border, 1px solid #ccc);
        border-radius: var(--cq-tool-radius, 8px); padding: 8px;
        display: flex; flex-direction: column; gap: 8px;
      }
      .row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
      [part~="wb-tool-btn"], [part~="wb-color-btn"], [part~="wb-width-btn"] {
        background: var(--cq-tool-btn-bg, #f0f0f0); color: var(--cq-tool-btn-color, #222);
        border: 1px solid #ccc; border-radius: var(--cq-tool-btn-radius, 4px);
        font-family: var(--cq-tool-btn-font, inherit); font-size: var(--cq-tool-btn-size, 0.85rem);
        padding: 4px 8px; cursor: pointer;
      }
      [aria-pressed="true"] { outline: 2px solid var(--cq-tool-icon-active, #4a90d9); outline-offset: 1px; }
      [part="wb-canvas"] { border: 1px solid #ddd; border-radius: 4px; cursor: crosshair; touch-action: none; }
    `;

    const panel = document.createElement('div');
    panel.setAttribute('part', 'wb-panel');

    this._toolRow = document.createElement('div');
    this._toolRow.className = 'row';
    const toolRow = this._toolRow;
    for (const t of ['pen', 'eraser', 'undo', 'clear'] as const) {
      const btn = document.createElement('button');
      btn.setAttribute('part', 'wb-tool-btn');
      btn.type = 'button';
      btn.dataset.tool = t;
      btn.textContent = t[0]!.toUpperCase() + t.slice(1);
      if (t === 'pen' || t === 'eraser') btn.setAttribute('aria-pressed', String(this._tool === t));
      btn.addEventListener('click', () => this._onTool(t));
      toolRow.appendChild(btn);
    }
    this._mathBtn = document.createElement('button');
    this._mathBtn.setAttribute('part', 'wb-tool-btn');
    this._mathBtn.type = 'button';
    this._mathBtn.dataset.tool = 'math';
    this._mathBtn.textContent = 'Math';
    this._mathBtn.style.display = 'none';
    this._mathBtn.setAttribute('aria-pressed', 'false');
    this._mathBtn.addEventListener('click', () => this._toggleMath());
    toolRow.appendChild(this._mathBtn);
    panel.appendChild(toolRow);

    const colorRow = document.createElement('div');
    colorRow.className = 'row';
    for (const { hex, name } of COLORS) {
      const btn = document.createElement('button');
      btn.setAttribute('part', 'wb-color-btn');
      btn.type = 'button';
      btn.style.backgroundColor = hex;
      btn.style.width = btn.style.height = btn.style.minWidth = '24px';
      btn.dataset.color = hex;
      btn.setAttribute('aria-label', name);
      btn.setAttribute('aria-pressed', String(this._color === hex));
      btn.addEventListener('click', () => { this._color = hex; this._updatePressed(colorRow, hex, 'data-color'); });
      colorRow.appendChild(btn);
    }
    panel.appendChild(colorRow);

    const widthRow = document.createElement('div');
    widthRow.className = 'row';
    for (const w of WIDTHS) {
      const btn = document.createElement('button');
      btn.setAttribute('part', 'wb-width-btn');
      btn.type = 'button';
      btn.textContent = `${w}px`;
      btn.dataset.width = String(w);
      btn.setAttribute('aria-pressed', String(this._width === w));
      btn.addEventListener('click', () => { this._width = w; this._updatePressed(widthRow, String(w), 'data-width'); });
      widthRow.appendChild(btn);
    }
    panel.appendChild(widthRow);

    this._canvas = document.createElement('canvas');
    this._canvas.setAttribute('part', 'wb-canvas');
    this._canvas.width = 400;
    this._canvas.height = 250;
    this._ctx = this._canvas.getContext('2d');
    this._canvas.addEventListener('pointerdown', (e) => this._down(e));
    this._canvas.addEventListener('pointermove', (e) => this._move(e));
    this._canvas.addEventListener('pointerup', () => this._up());
    this._canvas.addEventListener('pointercancel', () => this._up());
    this._canvas.addEventListener('pointerleave', () => this._up());
    panel.appendChild(this._canvas);

    this._shadow.append(style, panel);
  }

  private _updatePressed(row: HTMLElement, match: string, prop: 'data-color' | 'data-width'): void {
    const key = prop === 'data-color' ? 'color' : 'width';
    row.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String((b as HTMLElement).dataset[key] === match));
    });
  }

  private _onTool(t: 'pen' | 'eraser' | 'undo' | 'clear'): void {
    if (t === 'undo') { this._strokes.pop(); this._redraw(); return; }
    if (t === 'clear') {
      if (this._clearPending) { this._strokes = []; this._current = null; this._redraw(); this._clearPending = false; }
      else { this._clearPending = true; setTimeout(() => { this._clearPending = false; }, 1000); }
      return;
    }
    this._tool = t;
    this._toolRow.querySelectorAll('[part~="wb-tool-btn"]').forEach((b) => {
      const d = (b as HTMLElement).dataset.tool;
      if (d === 'pen' || d === 'eraser') b.setAttribute('aria-pressed', String(this._tool === d));
    });
  }

  private _pt(e: PointerEvent): Point {
    const r = this._canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (this._canvas.width / r.width), y: (e.clientY - r.top) * (this._canvas.height / r.height) };
  }

  private _down(e: PointerEvent): void {
    try { this._canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events in tests lack an active pointer */ }
    this._current = { points: [this._pt(e)], color: this._color, width: this._width, tool: this._tool };
  }

  private _move(e: PointerEvent): void {
    if (!this._current) return;
    this._current.points.push(this._pt(e));
    this._redraw();
    this._draw(this._current);
  }

  private _up(): void {
    if (this._current && this._current.points.length > 1) this._strokes.push(this._current);
    this._current = null;
    this._redraw();
  }

  private _redraw(): void {
    if (!this._ctx) return;
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._drawMathTemplate();
    for (const s of this._strokes) this._draw(s);
  }

  private _draw(s: Stroke): void {
    const ctx = this._ctx;
    if (!ctx || s.points.length < 2) return;
    ctx.save();
    ctx.lineWidth = s.width;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.tool === 'eraser' ? 'rgba(0,0,0,1)' : s.color;
    ctx.beginPath();
    ctx.moveTo(s.points[0]!.x, s.points[0]!.y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i]!.x, s.points[i]!.y);
    ctx.stroke();
    ctx.restore();
  }
  private _dispatchMathError(expression: string, reason: string): void {
    this.dispatchEvent(new CustomEvent('choca-whiteboard-math-error', {
      detail: { expression, reason },
      bubbles: true,
      composed: true,
    }));
  }

  private _toggleMath(): void {
    this._mathVisible = !this._mathVisible;
    this._mathBtn.setAttribute('aria-pressed', String(this._mathVisible));
    this._redraw();
  }

  private _drawMathTemplate(): void {
    if (!this._ctx || !this._mathLayout || !this._mathVisible) return;
    if (this._mathLayout.kind === 'stacked') this._drawStackedLayout(this._mathLayout);
  }

  private _drawStackedLayout(layout: StackedMathLayout): void {
    const ctx = this._ctx!;
    ctx.save();

    const fontSize = 24;
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = '#333';
    ctx.textBaseline = 'top';

    const charWidth = ctx.measureText('0').width;
    const lineHeight = fontSize + 8;
    const carrySpace = 40;
    const opWidth = charWidth * 2;
    const digitWidth = charWidth * layout.maxDigits;
    const rightEdge = (this._canvas.width + opWidth + digitWidth) / 2;
    const ruleLeft = rightEdge - opWidth - digitWidth - charWidth;

    for (let i = 0; i < layout.operands.length; i++) {
      const y = carrySpace + i * lineHeight;
      ctx.textAlign = 'right';
      ctx.fillText(layout.operands[i]!, rightEdge, y);
      if (i === 1) {
        ctx.textAlign = 'left';
        ctx.fillText(layout.operator, rightEdge - digitWidth - opWidth, y);
      }
    }

    const ruleY = carrySpace + layout.operands.length * lineHeight;
    ctx.beginPath();
    ctx.moveTo(ruleLeft, ruleY);
    ctx.lineTo(rightEdge + charWidth * 0.5, ruleY);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }
}

if (!customElements.get('choca-whiteboard'))
  customElements.define('choca-whiteboard', ChocaWhiteboard);
