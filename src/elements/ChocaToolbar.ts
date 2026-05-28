import type { ToolName } from '../types';

const TOOL_META: Record<ToolName, { label: string; partSuffix: string; icon: string }> = {
  'whiteboard': {
    label: 'Whiteboard', partSuffix: 'whiteboard',
    icon: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M12 19l7-7 3 3-7 7-3-3z'/%3E%3Cpath d='M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z'/%3E%3Cpath d='M2 2l7.586 7.586'/%3E%3C/svg%3E")`,
  },
  'calculator': {
    label: 'Calculator', partSuffix: 'calculator',
    icon: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Crect x='4' y='2' width='16' height='20' rx='2'/%3E%3Cline x1='8' y1='6' x2='16' y2='6'/%3E%3C/svg%3E")`,
  },
  'place-value-chart': {
    label: 'Place Value Chart', partSuffix: 'pvc',
    icon: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cline x1='9' y1='3' x2='9' y2='21'/%3E%3Cline x1='15' y1='3' x2='15' y2='21'/%3E%3Cline x1='3' y1='9' x2='21' y2='9'/%3E%3C/svg%3E")`,
  },
};

export class ChocaToolbar extends HTMLElement {
  private _shadow: ShadowRoot;
  private _tools: ToolName[] = [];
  private _active = new Set<ToolName>();
  private _container: HTMLElement;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; }
      [part="toolbar"] { display: flex; gap: 8px; padding: 4px 0; }
      [part~="tool-btn"] {
        width: var(--cq-tool-icon-size, 32px); height: var(--cq-tool-icon-size, 32px);
        border: var(--cq-tool-border, 1px solid #ccc); border-radius: var(--cq-tool-radius, 6px);
        background-color: var(--cq-tool-icon-color, currentColor); cursor: pointer; padding: 4px;
        mask-image: var(--_icon); -webkit-mask-image: var(--_icon);
        mask-size: 60%; mask-repeat: no-repeat; mask-position: center;
        -webkit-mask-size: 60%; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center;
      }
      [part~="tool-btn"][aria-pressed="true"] {
        background-color: var(--cq-tool-icon-active, #4a90d9);
        outline: 2px solid var(--cq-tool-icon-active, #4a90d9); outline-offset: 1px;
      }
      [part~="tool-btn"]:focus-visible {
        outline: 2px solid var(--cq-focus-ring, currentColor); outline-offset: 2px;
      }
    `;
    this._container = document.createElement('div');
    this._container.setAttribute('part', 'toolbar');
    this._shadow.append(style, this._container);
  }

  set tools(v: ToolName[]) { this._tools = v; this._render(); }
  get tools(): ToolName[] { return this._tools; }
  get activeTools(): Set<ToolName> { return new Set(this._active); }

  private _render(): void {
    this._container.replaceChildren();
    for (const tool of this._tools) {
      const meta = TOOL_META[tool];
      const btn = document.createElement('button');
      btn.setAttribute('part', `tool-btn tool-btn-${meta.partSuffix}`);
      btn.type = 'button';
      btn.setAttribute('aria-label', meta.label);
      btn.setAttribute('aria-pressed', String(this._active.has(tool)));
      btn.style.setProperty('--_icon', meta.icon);
      btn.addEventListener('click', () => {
        if (this._active.has(tool)) this._active.delete(tool);
        else this._active.add(tool);
        this._render();
        this.dispatchEvent(new CustomEvent('tool-toggled', {
          detail: { tool, active: this._active.has(tool) },
          bubbles: true, composed: true,
        }));
      });
      this._container.appendChild(btn);
    }
  }
}

if (!customElements.get('choca-toolbar'))
  customElements.define('choca-toolbar', ChocaToolbar);
