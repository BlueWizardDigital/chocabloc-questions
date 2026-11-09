import { expect } from '@esm-bundle/chai';
import { ChocaHelp } from '../../src/help/index';
import type { HelpRecord } from '../../src/help/index';
import { captureConsole, cleanup, firstArgs, holder, parts, stubSpeech, tick } from './lesson-test-utils';
import { BASE, click, div, events, focusedPart, hasTap, isOpen, mountHelp, mult, opened, roles, say, the, way } from './help-test-utils';
import type { Props } from './help-test-utils';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  cleanup();
});

describe('<chocabloc-help>: the flow', () => {
  it('does not open by itself', async () => {
    const s = stubSpeech();
    const el = mountHelp();
    const steps = events(el, 'help-step');
    el.fact = mult(7, 8);
    el.grade = '2';
    el.pick = 'mult.skip-count';
    el.solved = [{ a: 7, b: 7 }];
    el.pictureBase = BASE;
    await tick();
    expect(isOpen(el)).to.equal(false);
    expect(el.getBoundingClientRect().height).to.equal(0);
    expect(steps).to.deep.equal([]);
    expect(s.spoken).to.deep.equal([]);
  });

  it('open() shows the first way and its first step, once', () => {
    const el = mountHelp({ fact: mult(7, 8), grade: '5', solved: [{ a: 7, b: 7 }] });
    const steps = events(el, 'help-step');
    el.open();
    el.open();
    expect(isOpen(el)).to.equal(true);
    expect(way(el)).to.equal('Way 1 of 4: Equal groups');
    expect(say(el)).to.equal('7 rows of 8. How many in all?');
    expect(steps).to.deep.equal([{ strategy: 'mult.groups', index: 0, points: [] }]);
  });

  it('open() off the page warns and stays closed', () => {
    const got = captureConsole();
    const el = document.createElement('chocabloc-help') as ChocaHelp;
    el.fact = mult(7, 8);
    el.open();
    expect(firstArgs(got.warn).join()).to.include('chocabloc-help');
    expect(isOpen(el)).to.equal(false);
  });

  it('Show me more walks the steps, and Back returns to the previous step', () => {
    const el = opened({ fact: mult(7, 8), grade: '5' });
    const steps = events<{ index: number }>(el, 'help-step');
    expect((the(el, 'back') as HTMLButtonElement).disabled).to.equal(true);
    click(el, 'more');
    expect(say(el)).to.equal('Each row adds 8. Count row by row.');
    expect((the(el, 'back') as HTMLButtonElement).disabled).to.equal(false);
    click(el, 'more');
    expect(say(el)).to.equal('6 rows make 48. One row is left.');
    expect((the(el, 'more') as HTMLButtonElement).disabled).to.equal(true);
    click(el, 'back');
    expect(say(el)).to.equal('Each row adds 8. Count row by row.');
    expect((the(el, 'more') as HTMLButtonElement).disabled).to.equal(false);
    click(el, 'back');
    expect(say(el)).to.equal('7 rows of 8. How many in all?');
    expect(steps.map((s) => s.index)).to.deep.equal([1, 2, 1, 0]);
  });

  it('👎 moves to the next strategy and wraps with "Let\'s look at this one again."', () => {
    const el = opened({ fact: mult(7, 8), grade: '5', solved: [{ a: 7, b: 7 }] });
    click(el, 'more');
    click(el, 'thumb-down');
    expect(way(el)).to.equal('Way 2 of 4: Skip counting');
    expect(say(el)).to.equal('Count by 8s, 7 times.');
    click(el, 'thumb-down');
    expect(way(el)).to.equal('Way 3 of 4: Start from a fact you know');
    expect(say(el)).to.equal("5 × 8 is 40. 7 × 8 is 2 more 8s. What's that?");
    click(el, 'thumb-down');
    expect(way(el)).to.equal('Way 4 of 4: Look at a nearby fact');
    expect(say(el)).to.equal("7 × 7 is 49. 7 × 8 is one more 7. What's that?");
    click(el, 'thumb-down');
    expect(way(el)).to.equal("Let's look at this one again. Way 1 of 4: Equal groups");
    expect(say(el)).to.equal('7 rows of 8. How many in all?');
    click(el, 'more');
    expect(way(el)).to.equal('Way 1 of 4: Equal groups');
    click(el, 'back');
    expect(way(el)).to.equal("Let's look at this one again. Way 1 of 4: Equal groups");
    expect(isOpen(el)).to.equal(true);
  });

  it('a × 1 has one way: 👎 says it again, and records each time', () => {
    const el = opened({ fact: mult(1, 6), grade: '5' });
    const records = events<HelpRecord>(el, 'help-record');
    expect(way(el)).to.equal('Way 1 of 1: Equal groups');
    expect(say(el)).to.equal('One group of 6. How many is that?');
    click(el, 'thumb-down');
    expect(way(el)).to.equal("Let's look at this one again. Way 1 of 1: Equal groups");
    expect(records.map((r) => r.thumb)).to.deep.equal(['down']);
  });

  it('help-step carries the points a game lights up', () => {
    const el = mountHelp({ fact: mult(7, 8), grade: '5', pick: 'mult.known-fact', draw: 'strip' });
    const steps = events(el, 'help-step');
    el.open();
    click(el, 'more');
    expect(steps).to.deep.equal([
      { strategy: 'mult.known-fact', index: 0, points: [{ a: 5, b: 8 }] },
      { strategy: 'mult.known-fact', index: 1, points: [{ a: 5, b: 8 }] },
    ]);
  });

  it('👍 closes and emits one help-record with thumb up', () => {
    const el = opened({ fact: mult(7, 8), grade: '5' });
    const records = events<HelpRecord>(el, 'help-record');
    const closes = events(el, 'help-close');
    click(el, 'more');
    click(el, 'thumb-up');
    expect(isOpen(el)).to.equal(false);
    expect(records).to.have.length(1);
    expect(records[0]).to.deep.include({ family: 'mult-facts', strategy: 'mult.groups', thumb: 'up', fact: '7x8' });
    expect(records[0]!.eventId).to.match(UUID_V4);
    expect(Object.keys(records[0]!).sort()).to.deep.equal(['eventId', 'fact', 'family', 'strategy', 'thumb']);
    expect(closes).to.have.length(1);
  });

  it('close emits one help-record with thumb null', () => {
    const el = opened({ fact: div(24, 4), grade: '5' });
    const records = events<HelpRecord>(el, 'help-record');
    const closes = events(el, 'help-close');
    click(el, 'close');
    expect(isOpen(el)).to.equal(false);
    expect(records).to.have.length(1);
    expect(records[0]).to.deep.include({ family: 'div-facts', strategy: 'div.share', thumb: null, fact: '24÷4' });
    expect(closes).to.have.length(1);
    // Closing again is nothing.
    el.close();
    expect(records).to.have.length(1);
    expect(closes).to.have.length(1);
  });

  it('close() while a strategy is shown does the same, and every strategy left has its own id', () => {
    const el = opened({ fact: mult(7, 8), grade: '5' });
    const records = events<HelpRecord>(el, 'help-record');
    click(el, 'thumb-down');
    click(el, 'thumb-down');
    el.close();
    expect(records.map((r) => [r.strategy, r.thumb])).to.deep.equal([
      ['mult.groups', 'down'],
      ['mult.skip-count', 'down'],
      ['mult.known-fact', null],
    ]);
    const ids = records.map((r) => r.eventId);
    expect(new Set(ids).size).to.equal(3);
    for (const id of ids) expect(id).to.match(UUID_V4);
  });

  it('a page without crypto.randomUUID (not a secure context) still gets a v4 id', () => {
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
    try {
      const el = opened({ fact: mult(7, 8), grade: '5' });
      const records = events<HelpRecord>(el, 'help-record');
      el.close();
      expect(records[0]!.eventId).to.match(UUID_V4);
    } finally {
      Reflect.deleteProperty(crypto, 'randomUUID');
    }
  });

  it('events cross the shadow boundary', () => {
    const seen: string[] = [];
    const note = (e: Event): void => void seen.push(e.type);
    for (const t of ['help-step', 'help-record', 'help-close']) document.addEventListener(t, note);
    try {
      opened({ fact: mult(7, 8), grade: '5' }).close();
    } finally {
      for (const t of ['help-step', 'help-record', 'help-close']) document.removeEventListener(t, note);
    }
    expect(seen).to.deep.equal(['help-step', 'help-record', 'help-close']);
  });

  it('opens again from the first way, not wrapped', () => {
    const el = opened({ fact: mult(1, 6), grade: '5' });
    click(el, 'thumb-down');
    el.close();
    el.open();
    expect(way(el)).to.equal('Way 1 of 1: Equal groups');
  });

  it('a handler that closes the panel mid-way sends no second record', () => {
    const el = opened({ fact: mult(7, 8), grade: '5' });
    const records = events<HelpRecord>(el, 'help-record');
    const steps = events(el, 'help-step');
    el.addEventListener('help-record', () => el.close());
    click(el, 'thumb-down');
    expect(records.map((r) => r.thumb)).to.deep.equal(['down']);
    expect(steps).to.deep.equal([]);
    expect(isOpen(el)).to.equal(false);
  });

  it('a new fact while open closes the panel, records the old fact, and does not reopen', () => {
    const el = opened({ fact: mult(7, 8), grade: '5' });
    const records = events<HelpRecord>(el, 'help-record');
    const closes = events(el, 'help-close');
    el.fact = mult(7, 8);
    expect(isOpen(el), 'the same numbers change nothing').to.equal(true);
    el.fact = mult(6, 8);
    expect(isOpen(el)).to.equal(false);
    expect(records.map((r) => [r.fact, r.thumb])).to.deep.equal([['7x8', null]]);
    expect(closes).to.have.length(1);
    el.open();
    expect(say(el)).to.equal('6 rows of 8. How many in all?');
  });

  it('removing the element closes it, so the record is not lost and the voice stops', () => {
    const s = stubSpeech();
    const el = opened({ fact: mult(4, 6), grade: '2' });
    const records = events<HelpRecord>(el, 'help-record');
    const atDocument: Event[] = [];
    const note = (e: Event): void => void atDocument.push(e);
    document.addEventListener('help-record', note);
    const before = s.cancels();
    el.remove();
    document.removeEventListener('help-record', note);
    expect(records.map((r) => r.thumb)).to.deep.equal([null]);
    // Off the page the event goes no further than the element itself (PARTS-AND-VARS.md says so).
    expect(atDocument.length).to.equal(0);
    expect(s.cancels()).to.be.greaterThan(before);
    holder().append(el);
    expect(isOpen(el), 'it never opens by itself').to.equal(false);
  });

  it('properties set before the element is defined still count', () => {
    const s = stubSpeech();
    const el = document.createElement('chocabloc-help-early') as ChocaHelp;
    Object.assign(el, { fact: mult(7, 8), grade: '3', muted: true });
    holder().append(el);
    customElements.define('chocabloc-help-early', class extends ChocaHelp {});
    el.open();
    expect(way(el)).to.equal('Way 1 of 2: Equal groups');
    expect(el.hasAttribute('muted')).to.equal(true);
    expect(s.spoken).to.deep.equal([]);
  });

  it('reads nothing of the fact but its op and numbers', () => {
    const read = new Set<string>();
    const fact = new Proxy(
      { ...mult(7, 8), answer: 56, choices: [56], answerToken: 'tok', id: 'q1' },
      {
        get(t, k) {
          read.add(String(k));
          return Reflect.get(t, k);
        },
      },
    );
    const el = opened({ fact, grade: '5' });
    click(el, 'thumb-down');
    el.close();
    for (const banned of ['answer', 'choices', 'answerToken', 'id']) expect(read.has(banned), banned).to.equal(false);
  });

  it('open() puts focus on the words; a step keeps it on the button, unless the button just ran out', () => {
    const el = opened({ fact: mult(7, 8), grade: '5' });
    expect(focusedPart(el)).to.equal('text');
    the(el, 'more').focus();
    click(el, 'more');
    expect(focusedPart(el)).to.equal('button more');
    click(el, 'more');
    expect((the(el, 'more') as HTMLButtonElement).disabled).to.equal(true);
    expect(focusedPart(el)).to.equal('text');
  });
});

describe('<chocabloc-help>: grade', () => {
  for (const grade of ['K', '1', '2', '3']) {
    it(`grade "${grade}" shows two strategies`, () => {
      const el = opened({ fact: mult(7, 8), grade, solved: [{ a: 7, b: 7 }] });
      expect(way(el)).to.equal('Way 1 of 2: Equal groups');
      click(el, 'thumb-down');
      expect(way(el)).to.equal('Way 2 of 2: Skip counting');
      click(el, 'thumb-down');
      expect(way(el)).to.equal("Let's look at this one again. Way 1 of 2: Equal groups");
    });
  }

  it('grade "4" and up, and no grade, show them all', () => {
    for (const grade of ['4', '12', null]) {
      const el = opened({ fact: div(24, 4), grade });
      expect(way(el), String(grade)).to.equal('Way 1 of 4: Share into equal groups');
    }
  });

  it('a bad grade warns once and counts as no grade', () => {
    const got = captureConsole();
    const el = mountHelp({ fact: mult(7, 8), grade: 'seven', pictureBase: BASE });
    el.open();
    click(el, 'thumb-down');
    expect(firstArgs(got.warn).filter((w) => w.includes('unknown grade'))).to.have.length(1);
    expect(el.grade).to.equal(null);
    expect(way(el)).to.equal('Way 2 of 3: Skip counting');
  });

  it('the kid\'s pick goes first, and a pick above the grade is ignored', () => {
    expect(way(opened({ fact: mult(7, 8), grade: '5', pick: 'mult.known-fact' }))).to.equal('Way 1 of 3: Start from a fact you know');
    expect(way(opened({ fact: mult(7, 8), grade: '2', pick: 'mult.known-fact' }))).to.equal('Way 1 of 2: Equal groups');
    expect(way(opened({ fact: mult(7, 8), grade: '2', pick: 'mult.skip-count' }))).to.equal('Way 1 of 2: Skip counting');
    expect(way(opened({ fact: mult(7, 8), grade: '5', pick: 'div.share' }))).to.equal('Way 1 of 3: Equal groups');
  });

  it('the young look is bigger than the standard one', () => {
    const size = (grade: string): number => parseFloat(getComputedStyle(the(opened({ fact: mult(4, 6), grade }), 'text')).fontSize);
    expect(size('2')).to.be.greaterThan(size('5'));
  });
});

describe('<chocabloc-help>: voice', () => {
  it('a grade 2 kid hears each step; Tap to hear shows when the page was never tapped', () => {
    const heard = stubSpeech();
    const el = opened({ fact: mult(4, 6), grade: '2' });
    expect(heard.spoken).to.deep.equal(['4 rows of 6. How many in all?']);
    expect(hasTap(el)).to.equal(false);
    click(el, 'more');
    expect(heard.spoken[1]).to.equal('Each row adds 6. Count row by row.');
    click(el, 'thumb-down');
    expect(heard.spoken[2]).to.equal('Count by 6s, 4 times.');
    click(el, 'thumb-down');
    expect(heard.spoken[3]).to.equal("Let's look at this one again. 4 rows of 6. How many in all?");
    heard.log.forEach((entry, i) => {
      if (entry === 'speak') expect(heard.log[i - 1]).to.equal('cancel');
    });
    el.close();
    cleanup();

    const silent = stubSpeech(true, false);
    const el2 = opened({ fact: mult(4, 6), grade: '2' });
    expect(silent.spoken).to.deep.equal([]);
    const tap = the(el2, 'tap-to-hear');
    expect(tap.textContent).to.equal('Tap to hear');
    expect(tap.querySelectorAll('svg').length).to.equal(1);
    tap.click();
    expect(silent.spoken).to.deep.equal(['4 rows of 6. How many in all?']);
    expect(hasTap(el2)).to.equal(false);
    expect(focusedPart(el2)).to.equal('text');
    click(el2, 'more');
    expect(silent.spoken[1]).to.equal('Each row adds 6. Count row by row.');
    expect(hasTap(el2)).to.equal(false);
    // The element remembers the tap across a close.
    el2.close();
    el2.open();
    expect(hasTap(el2)).to.equal(false);
  });

  it('Tap to hear stays up from step to step until it is tapped', () => {
    const s = stubSpeech(true, false);
    const el = opened({ fact: mult(4, 6), grade: '2' });
    click(el, 'more');
    expect(hasTap(el)).to.equal(true);
    expect(s.spoken).to.deep.equal([]);
    click(el, 'tap-to-hear');
    expect(s.spoken).to.deep.equal(['Each row adds 6. Count row by row.']);
  });

  it('symbols are spoken as words', () => {
    const s = stubSpeech();
    opened({ fact: mult(13, 4), grade: '2', pick: 'mult.skip-count' });
    expect(s.spoken).to.deep.equal(['10 times 4 is 40. Count on by 4s.']);
  });

  it('a standard kid hears nothing, sees no speaker button, and the panel leaves speech alone', () => {
    const s = stubSpeech(true, false);
    const el = opened({ fact: mult(7, 8), grade: '5' });
    click(el, 'more');
    click(el, 'thumb-down');
    el.close();
    expect(hasTap(el)).to.equal(false);
    expect(s.log).to.deep.equal([]);
  });

  it('without speechSynthesis nothing throws, the words show, and there is no Tap to hear', () => {
    stubSpeech(false, false);
    const el = opened({ fact: mult(4, 6), grade: '2' });
    expect(say(el)).to.equal('4 rows of 6. How many in all?');
    expect(hasTap(el)).to.equal(false);
    click(el, 'more');
    expect(say(el)).to.equal('Each row adds 6. Count row by row.');
  });

  it('closing cancels the voice', () => {
    const s = stubSpeech();
    const el = opened({ fact: mult(4, 6), grade: '2' });
    const before = s.cancels();
    click(el, 'thumb-up');
    expect(s.cancels()).to.be.greaterThan(before);
  });
});

describe('<chocabloc-help>: muted', () => {
  /** What the kid sees on each step of the first way, then on the second way's first step, as strings. */
  const seen = (props: Props): string[] => {
    const el = opened({ pictureBase: BASE, ...props });
    const out: string[] = [];
    const note = (): void => void out.push(`${way(el)} | ${say(el)} | ${the(el, 'picture').hidden} | ${the(el, 'picture').innerHTML}`);
    note();
    while (!(the(el, 'more') as HTMLButtonElement).disabled) {
      click(el, 'more');
      note();
    }
    click(el, 'thumb-down');
    note();
    el.close();
    return out;
  };
  /** Every button's words, hidden or not. */
  const buttonWords = (el: HTMLElement): string[] =>
    Array.from((el.shadowRoot as ShadowRoot).querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());

  it('a young kid hears nothing while muted', () => {
    const s = stubSpeech();
    expect(mountHelp().muted, 'off by default').to.equal(false);
    const el = opened({ fact: mult(4, 6), grade: '2', muted: true });
    expect(say(el)).to.equal('4 rows of 6. How many in all?');
    click(el, 'more');
    click(el, 'thumb-down');
    click(el, 'thumb-down');
    el.close();
    // The fallback line too.
    el.fact = mult(0, 5);
    el.open();
    expect(say(el)).to.equal("Let's ask your teacher about this one.");
    // The attribute does the same.
    const byAttr = mountHelp({ fact: mult(4, 6), grade: '2' });
    byAttr.setAttribute('muted', '');
    expect(byAttr.muted).to.equal(true);
    byAttr.open();
    expect(s.spoken).to.deep.equal([]);
    // Words and pictures are what an unmuted kid sees.
    const young = { fact: mult(4, 6), grade: '2' };
    expect(seen({ ...young, muted: true })).to.deep.equal(seen(young));
  });

  it('muting mid-step cancels speech', () => {
    const s = stubSpeech();
    const el = opened({ fact: mult(4, 6), grade: '2' });
    expect(s.spoken).to.deep.equal(['4 rows of 6. How many in all?']);
    const before = s.cancels();
    el.muted = true;
    expect(s.cancels()).to.equal(before + 1);
    expect(s.log[s.log.length - 1]).to.equal('cancel');
    expect(el.hasAttribute('muted'), 'the property sets the attribute').to.equal(true);
    click(el, 'more');
    expect(s.spoken).to.have.length(1);

    // The attribute, mid-step, cancels too.
    const other = opened({ fact: mult(4, 6), grade: '2' });
    const was = s.cancels();
    other.setAttribute('muted', '');
    expect(s.cancels()).to.equal(was + 1);
  });

  it('unmuting speaks from the next step', () => {
    const s = stubSpeech();
    const el = opened({ fact: mult(4, 6), grade: '2', muted: true });
    el.muted = false;
    expect(el.hasAttribute('muted')).to.equal(false);
    expect(s.spoken, 'the step on screen is not replayed').to.deep.equal([]);
    click(el, 'more');
    expect(s.spoken).to.deep.equal(['Each row adds 6. Count row by row.']);
    cleanup();

    // A page never tapped: Tap to hear comes back with the next step, not the current one.
    const locked = stubSpeech(true, false);
    const el2 = opened({ fact: mult(4, 6), grade: '2' });
    el2.setAttribute('muted', '');
    el2.removeAttribute('muted');
    expect(el2.muted).to.equal(false);
    expect(hasTap(el2)).to.equal(false);
    click(el2, 'more');
    expect(hasTap(el2)).to.equal(true);
    click(el2, 'tap-to-hear');
    expect(locked.spoken).to.deep.equal(['Each row adds 6. Count row by row.']);
  });

  it('muted hides Read to me and Tap to hear', () => {
    stubSpeech(true, false);
    const el = opened({ fact: mult(4, 6), grade: '2' });
    expect(hasTap(el)).to.equal(true);
    el.muted = true;
    expect(hasTap(el)).to.equal(false);
    click(el, 'more');
    click(el, 'thumb-down');
    expect(hasTap(el)).to.equal(false);
    const fresh = opened({ fact: mult(4, 6), grade: '2', muted: true });
    expect(hasTap(fresh)).to.equal(false);
    for (const e of [el, fresh]) {
      expect(parts(e, 'read-to-me').length).to.equal(0);
      for (const words of ['Read to me', 'Tap to hear']) expect(buttonWords(e)).not.to.include(words);
    }
  });

  it('standard kids are unchanged', () => {
    const s = stubSpeech(true, false);
    const el = opened({ fact: mult(7, 8), grade: '5' });
    el.muted = true;
    click(el, 'more');
    el.muted = false;
    click(el, 'thumb-down');
    el.close();
    expect(hasTap(el)).to.equal(false);
    expect(s.log, 'the panel leaves speech alone').to.deep.equal([]);
    const standard = { fact: mult(7, 8), grade: '5', solved: [{ a: 7, b: 7 }] };
    expect(seen({ ...standard, muted: true })).to.deep.equal(seen(standard));
  });
});

describe('<chocabloc-help>: words', () => {
  it('zero fact shows the fallback line and no thumbs', () => {
    const heard = stubSpeech();
    for (const fact of [mult(0, 5), div(0, 5), div(null, 4, 6), mult(16, 2), null]) {
      heard.spoken.length = 0;
      const el = mountHelp({ fact, grade: '2' });
      const steps = events(el, 'help-step');
      const records = events(el, 'help-record');
      const closes = events(el, 'help-close');
      el.open();
      expect(say(el)).to.equal("Let's ask your teacher about this one.");
      expect(heard.spoken).to.deep.equal(["Let's ask your teacher about this one."]);
      for (const p of ['thumb-up', 'thumb-down', 'more', 'back', 'way', 'picture']) expect(the(el, p).hidden, p).to.equal(true);
      expect(the(el, 'close').hidden).to.equal(false);
      expect(steps).to.deep.equal([]);
      click(el, 'close');
      expect(records).to.deep.equal([]);
      expect(closes).to.have.length(1);
    }
  });

  it('a fact that works after a zero fact shows its controls again', () => {
    const el = opened({ fact: mult(0, 5), grade: '5' });
    el.close();
    el.fact = mult(7, 8);
    el.open();
    for (const p of ['thumb-up', 'thumb-down', 'more', 'back', 'way']) expect(the(el, p).hidden, p).to.equal(false);
  });

  it('default English shows real words', () => {
    const got = captureConsole();
    const s = stubSpeech();
    const el = opened({ fact: mult(13, 4), grade: '2', pictureBase: BASE });
    expect(say(el)).to.equal('10 rows of 4 make 40.');
    expect(way(el)).to.equal('Way 1 of 2: Equal groups');
    expect(the(el, 'more').textContent).to.equal('Show me more');
    expect(the(el, 'back').textContent).to.equal('Back');
    expect(the(el, 'close').textContent).to.equal('Close help');
    expect(the(el, 'thumb-up').textContent).to.equal('👍');
    expect(the(el, 'thumb-up').getAttribute('aria-label')).to.equal('That helped');
    expect(the(el, 'thumb-down').textContent).to.equal('👎');
    expect(the(el, 'thumb-down').getAttribute('aria-label')).to.equal('Show another way');
    click(el, 'thumb-down');
    click(el, 'thumb-down');
    expect(way(el)).to.include("Let's look at this one again.");
    expect(s.spoken.length).to.be.greaterThan(0);
    el.fact = mult(0, 5);
    el.open();
    expect(say(el)).to.equal("Let's ask your teacher about this one.");
    expect(firstArgs(got.warn)).to.deep.equal([]);
  });

  it('a translator answers first; what it leaves falls back to English', () => {
    const el = opened({
      fact: mult(7, 8),
      grade: '5',
      translator: (key, vars) => {
        if (key === 'panel.more') return 'Encore';
        if (key === 'mult.groups.ask') return `${String(vars?.givenRows)} rangées de ${String(vars?.givenEach)}.`;
        return undefined;
      },
    });
    expect(the(el, 'more').textContent).to.equal('Encore');
    expect(the(el, 'back').textContent).to.equal('Back');
    expect(say(el)).to.equal('7 rangées de 8.');
    expect(roles(el)).to.deep.equal([['7', 'given'], ['8', 'given']]);
  });

  it('never writes message text as HTML', () => {
    const el = opened({
      fact: mult(7, 8),
      grade: '5',
      translator: (key) => (key === 'mult.groups.ask' || key === 'panel.more' ? '<img src=x onerror=alert(1)>' : undefined),
    });
    expect(the(el, 'text').querySelectorAll('img').length).to.equal(0);
    expect(the(el, 'more').querySelectorAll('img').length).to.equal(0);
    expect(say(el)).to.equal('<img src=x onerror=alert(1)>');
  });

  it('every number in the words carries its role', () => {
    const el = opened({ fact: mult(7, 8), grade: '5' });
    expect(roles(el)).to.deep.equal([['7', 'given'], ['8', 'given']]);
    click(el, 'more');
    click(el, 'more');
    expect(roles(el)).to.deep.equal([['6', 'partial'], ['48', 'partial']]);
    click(el, 'thumb-down');
    click(el, 'thumb-down');
    expect(say(el)).to.equal("5 × 8 is 40. 7 × 8 is 2 more 8s. What's that?");
    expect(roles(el)).to.deep.equal([
      ['5', 'anchor'],
      ['8', 'given'],
      ['40', 'anchor'],
      ['7', 'given'],
      ['8', 'given'],
      ['2', 'partial'],
      ['8', 'given'],
    ]);
  });

  it('a number with two roles takes the non-given one', () => {
    const el = opened({ fact: mult(7, 8), grade: '5', pick: 'mult.nearby-fact', solved: [{ a: 7, b: 7 }] });
    expect(say(el)).to.equal("7 × 7 is 49. 7 × 8 is one more 7. What's that?");
    expect(roles(el)).to.deep.equal([
      ['7', 'anchor'],
      ['7', 'anchor'],
      ['49', 'anchor'],
      ['7', 'anchor'],
      ['8', 'given'],
      ['7', 'anchor'],
    ]);
  });
});

