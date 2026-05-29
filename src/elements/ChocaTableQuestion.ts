import type { Choice, NormalizedQuestion } from '../types';
import { syncChoicePad, handlePick } from './shared-pad';
import './ChocaChoicePad';

function centsToDisplay(cents: number): string {
  if (cents >= 0 && cents < 100) return `${cents}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

function buildShell(): {
  fragment: DocumentFragment;
  promptEl: HTMLElement;
  tableEl: HTMLTableElement;
  pad: HTMLElement;
  container: HTMLElement;
} {
  const fragment = document.createDocumentFragment();
  const style = document.createElement('style');
  style.textContent = `
    :host {
      display: block;
      font-family: var(--cq-font, system-ui, sans-serif);
      color: var(--cq-text, #222);
    }
    [part="container"] {
      display: flex;
      flex-direction: column;
      gap: var(--cq-section-gap, 16px);
      padding: var(--cq-container-padding, 16px);
    }
    [part="prompt"] {
      font-size: var(--cq-prompt-size, 1rem);
      font-weight: var(--cq-prompt-weight, 600);
    }
    [part="table"] {
      border-collapse: collapse;
      width: var(--cq-table-width, auto);
      font-size: var(--cq-table-font-size, 0.9rem);
    }
    [part~="table-header"] {
      background: var(--cq-table-header-bg, #f5f5f5);
      font-weight: 600;
      text-align: left;
      padding: var(--cq-table-cell-padding, 8px 12px);
      border-bottom: var(--cq-table-border, 2px solid #ddd);
    }
    [part~="table-cell"] {
      padding: var(--cq-table-cell-padding, 8px 12px);
      border-bottom: var(--cq-table-border-row, 1px solid #eee);
    }
    [part~="solve-for"] {
      background: var(--cq-table-highlight-bg, #fff3e0);
      font-weight: 600;
    }
    [part~="table-footer"] {
      font-weight: 600;
      padding: var(--cq-table-cell-padding, 8px 12px);
      border-top: var(--cq-table-border, 2px solid #ddd);
    }
    [part="change-event"] {
      font-size: var(--cq-table-note-size, 0.85rem);
      color: var(--cq-table-note-color, #666);
      font-style: italic;
    }
  `;
  const container = document.createElement('div');
  container.setAttribute('part', 'container');
  container.setAttribute('role', 'group');
  const promptEl = document.createElement('div');
  promptEl.setAttribute('part', 'prompt');
  const tableEl = document.createElement('table');
  tableEl.setAttribute('part', 'table');
  const pad = document.createElement('choca-choice-pad');
  pad.setAttribute('part', 'choices');
  container.append(promptEl, tableEl, pad);
  fragment.append(style, container);
  return { fragment, promptEl, tableEl, pad, container };
}

export class ChocaTableQuestion extends HTMLElement {
  private _shadow: ShadowRoot;
  private _question: NormalizedQuestion | null = null;
  private _renderedAt = 0;
  private _promptEl!: HTMLElement;
  private _tableEl!: HTMLTableElement;
  private _pad!: HTMLElement;
  private _container!: HTMLElement;

  static get observedAttributes(): string[] {
    return ['answer-mode', 'disabled', 'seed', 'student-answer'];
  }

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    const shell = buildShell();
    this._promptEl = shell.promptEl;
    this._tableEl = shell.tableEl;
    this._pad = shell.pad;
    this._container = shell.container;
    this._shadow.append(shell.fragment);
    this._shadow.addEventListener('picked', (e) =>
      this._onPicked((e as CustomEvent).detail as Choice),
    );
  }

  set question(q: NormalizedQuestion) {
    this._question = q;
    this._render();
  }

  get question(): NormalizedQuestion | null {
    return this._question;
  }

  attributeChangedCallback(): void {
    this._render();
  }

  private _render(): void {
    if (!this._question || this._question.format !== 'money_budget_adjust') return;
    const q = this._question;
    if (q.format !== 'money_budget_adjust') return;
    const c = q.content;

    this._promptEl.textContent =
      q.questionText || `After the change, how much goes to ${c.solve_for}?`;
    this._container.setAttribute('aria-label', `Question: ${this._promptEl.textContent}`);

    this._tableEl.replaceChildren();
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const text of ['Category', 'Amount']) {
      const th = document.createElement('th');
      th.setAttribute('part', 'table-header');
      th.setAttribute('scope', 'col');
      th.textContent = text;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    this._tableEl.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of c.original_rows) {
      const tr = document.createElement('tr');
      const isSolveFor = row.category === c.solve_for;

      const tdCat = document.createElement('td');
      tdCat.setAttribute('part', `table-cell${isSolveFor ? ' solve-for' : ''}`);
      tdCat.textContent = row.category;
      tr.appendChild(tdCat);

      const tdAmt = document.createElement('td');
      tdAmt.setAttribute('part', `table-cell${isSolveFor ? ' solve-for' : ''}`);
      tdAmt.textContent = isSolveFor ? '?' : centsToDisplay(row.amount_cents);
      tr.appendChild(tdAmt);

      tbody.appendChild(tr);
    }
    this._tableEl.appendChild(tbody);

    const tfoot = document.createElement('tfoot');
    const footRow = document.createElement('tr');
    const ftdLabel = document.createElement('td');
    ftdLabel.setAttribute('part', 'table-footer');
    ftdLabel.textContent = 'Income';
    footRow.appendChild(ftdLabel);
    const ftdVal = document.createElement('td');
    ftdVal.setAttribute('part', 'table-footer');
    ftdVal.textContent = centsToDisplay(c.change_event.new_income_cents);
    footRow.appendChild(ftdVal);
    tfoot.appendChild(footRow);
    this._tableEl.appendChild(tfoot);

    // Change event note
    let noteEl = this._shadow.querySelector('[part="change-event"]') as HTMLElement | null;
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.setAttribute('part', 'change-event');
      this._container.insertBefore(noteEl, this._pad);
    }
    const eventType = c.change_event.type.replace(/_/g, ' ');
    noteEl.textContent = `Change: ${eventType} (was ${centsToDisplay(c.original_income_cents)}, now ${centsToDisplay(c.change_event.new_income_cents)})`;

    this._renderChoices();
    this._renderedAt = performance.now();
    this.dispatchEvent(
      new CustomEvent('rendered', {
        detail: { renderedAt: this._renderedAt },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _renderChoices(): void {
    if (!this._question) return;
    syncChoicePad(this._question, this._pad, this);
  }

  private _onPicked(choice: Choice): void {
    if (!this._question) return;
    handlePick(this, this._question, choice, this._renderedAt, this._pad);
  }
}

if (!customElements.get('choca-table-question')) {
  customElements.define('choca-table-question', ChocaTableQuestion);
}
