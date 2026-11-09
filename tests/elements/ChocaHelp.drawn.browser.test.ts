import { expect } from '@esm-bundle/chai';
import { STRATEGIES, buildSteps, strategyOrder } from '../../src/help/index';
import type { ChocaHelp, HelpFact, HelpPicture, SolvedFact, StrategyId } from '../../src/help/index';
import { drawPicture, roleNodes } from '../../src/help/dom/picture';
import { lookup } from '../../src/lesson/messages';
import en from '../../src/help/messages/en.json';
import { captureConsole, cleanup, firstArgs, holder, stubSpeech, until } from './lesson-test-utils';
import { codes } from './help-drawn-check';
import { BASE, check, click, count, div, events, labels, mountHelp, mult, opened, say, the, way } from './help-test-utils';

afterEach(() => {
  cleanup();
});

describe('<chocabloc-help>: pictures', () => {
  /** Each animal's src. */
  const imgs = (el: HTMLElement): (string | null)[] => Array.from(the(el, 'picture').querySelectorAll('img')).map((i) => i.getAttribute('src'));
  /** How many objects each row holds. */
  const rowsOf = (el: HTMLElement): number[] => Array.from(the(el, 'picture').querySelectorAll('[part~="row"]')).map((r) => r.childElementCount);
  const blocks = (el: HTMLElement): number => count(el, '.blk');

  it('a strip draws no picture and still sends points', () => {
    const el = mountHelp({ fact: mult(7, 8), grade: '5', draw: 'strip', pick: 'mult.known-fact' });
    const steps = events<{ points: SolvedFact[] }>(el, 'help-step');
    el.open();
    click(el, 'more');
    expect(the(el, 'picture').hidden).to.equal(true);
    expect(the(el, 'picture').childElementCount).to.equal(0);
    expect(steps[1]!.points).to.deep.equal([{ a: 5, b: 8 }]);
  });

  it('a strip with young grade still speaks, with no picture and no animals', () => {
    const s = stubSpeech();
    const el = opened({ fact: mult(4, 6), grade: '2', draw: 'strip', pictureBase: BASE });
    expect(s.spoken).to.have.length(1);
    expect(the(el, 'picture').hidden).to.equal(true);
    expect(imgs(el)).to.have.length(0);
  });

  it('an unknown draw warns and keeps the last good one', () => {
    const got = captureConsole();
    const el = mountHelp({ fact: mult(4, 6), grade: '5' });
    el.draw = 'poster' as never;
    expect(el.draw).to.equal('card');
    expect(firstArgs(got.warn).join()).to.include('poster');
  });

  it('a step with no picture leaves the box hidden', () => {
    const el = opened({ fact: mult(7, 8), grade: '5', pick: 'mult.known-fact' });
    expect(say(el)).to.equal("5 × 8 is 40. 7 × 8 is 2 more 8s. What's that?");
    expect(the(el, 'picture').hidden).to.equal(true);
    click(el, 'more');
    expect(the(el, 'picture').hidden).to.equal(false);
  });

  it('a rows picture labels totals for rows 1 to counted only', () => {
    const el = opened({ fact: mult(7, 8), grade: '5' });
    expect(rowsOf(el)).to.have.length(7);
    expect(labels(el)).to.deep.equal([]);
    click(el, 'more');
    expect(labels(el)).to.deep.equal(['8']);
    click(el, 'more');
    expect(labels(el)).to.deep.equal(['8', '16', '24', '32', '40', '48']);
    const totals = Array.from(the(el, 'picture').querySelectorAll('[part~="row-total"]'));
    expect(totals.length).to.equal(7);
    expect(totals[6]!.textContent).to.equal('');
    expect(totals[6]!.hasAttribute('data-help-role')).to.equal(false);
    for (const t of totals.slice(0, 6)) expect(t.getAttribute('data-help-role')).to.equal('partial');
  });

  it("the last total is the kid's, whatever the picture asks for", () => {
    const pic: HelpPicture = { kind: 'rows', rows: 3, perRow: 4, counted: 3 };
    const drawn = drawPicture(pic, { young: false, base: null, key: 'k' });
    const printed = Array.from(drawn.querySelectorAll('[data-help-role]')).map((e) => e.textContent);
    expect(printed).to.deep.equal(['4', '8']);
  });

  it('a deal picture labels nothing per row', () => {
    const el = opened({ fact: div(24, 4), grade: '5' });
    expect(rowsOf(el)).to.deep.equal([0, 0, 0, 0]);
    expect(the(el, 'picture').textContent).to.equal('');
    click(el, 'more');
    expect(rowsOf(el)).to.deep.equal([1, 1, 1, 1]);
    expect(count(el, '.hpool > *')).to.equal(20);
    click(el, 'more');
    expect(rowsOf(el)).to.deep.equal([2, 2, 2, 2]);
    expect(the(el, 'picture').textContent).to.equal('');
  });

  it('a take picture never labels a group count', () => {
    const el = opened({ fact: div(24, 4), grade: '5', pick: 'div.groups' });
    expect(count(el, '.hgroup')).to.equal(0);
    expect(count(el, '.hpool > *')).to.equal(24);
    click(el, 'more');
    expect(count(el, '.hgroup')).to.equal(1);
    expect(count(el, '.hgroup > *')).to.equal(4);
    expect(count(el, '.hpool > *')).to.equal(20);
    click(el, 'more');
    expect(count(el, '.hgroup')).to.equal(2);
    expect(the(el, 'picture').textContent).to.equal('');
  });

  it('a young kid gets animals up to 30 objects', () => {
    const at30 = opened({ fact: mult(5, 6), grade: '2', pictureBase: BASE });
    expect(imgs(at30)).to.have.length(30);
    expect(count(at30, 'img[alt=""]')).to.equal(30);
    expect(imgs(at30)[0]).to.match(/\/fixtures\/animals\/[a-z]+\.webp$/);
    expect(new Set(imgs(at30)).size, 'one animal per question').to.equal(1);
    expect(blocks(at30)).to.equal(0);
    // A missing trailing slash is added, as in the lesson.
    const noSlash = opened({ fact: mult(5, 6), grade: '2', pictureBase: BASE.replace(/\/$/, '') });
    expect(imgs(noSlash)[0]).to.match(/\/fixtures\/animals\/[a-z]+\.webp$/);
    const share = opened({ fact: div(24, 4), grade: '2', pictureBase: BASE });
    expect(imgs(share)).to.have.length(24);
    const take = opened({ fact: div(24, 4), grade: '2', pictureBase: BASE, pick: 'div.groups' });
    expect(imgs(take)).to.have.length(24);
  });

  it('above 30 objects, and for an older kid, it draws grouped blocks', () => {
    const many = opened({ fact: mult(7, 8), grade: '2', pictureBase: BASE });
    expect(imgs(many)).to.have.length(0);
    expect(blocks(many)).to.equal(56);
    const older = opened({ fact: mult(4, 6), grade: '5', pictureBase: BASE });
    expect(imgs(older)).to.have.length(0);
    expect(blocks(older)).to.equal(24);
    const noBase = opened({ fact: mult(4, 6), grade: '2' });
    expect(imgs(noBase)).to.have.length(0);
    expect(blocks(noBase)).to.equal(24);
    const deal = opened({ fact: div(32, 4), grade: '2', pictureBase: BASE });
    expect(imgs(deal)).to.have.length(0);
    expect(blocks(deal)).to.equal(32);
  });

  it('a 12 × 12 fits a narrow panel without a sideways scroll', () => {
    const box = holder();
    box.style.width = '320px';
    const el = document.createElement('chocabloc-help') as ChocaHelp;
    Object.assign(el, { fact: mult(12, 12), grade: '5' });
    box.append(el);
    el.open();
    const picture = the(el, 'picture');
    expect(picture.scrollWidth).to.be.at.most(picture.clientWidth);
    expect(picture.getBoundingClientRect().height).to.be.below(400);
  });

  it('a failed animal falls back to blocks with the same labels, and the rest of the run stays blocks', async () => {
    const el = opened({ fact: mult(4, 6), grade: '2', pictureBase: '/no-such-folder/' });
    click(el, 'more');
    expect(labels(el)).to.deep.equal(['6']);
    await until(() => imgs(el).length === 0, 'the picture to fall back');
    expect(labels(el)).to.deep.equal(['6']);
    expect(blocks(el)).to.equal(24);
    click(el, 'more');
    expect(imgs(el)).to.have.length(0);
    expect(labels(el)).to.deep.equal(['6', '12', '18']);
    // The next opening tries the animals again.
    el.close();
    el.open();
    expect(imgs(el)).to.have.length(24);
  });

  it('the picture is hidden from a screen reader and has no words of its own', () => {
    const el = opened({ fact: mult(4, 6), grade: '2', pictureBase: BASE });
    click(el, 'more');
    expect(the(el, 'picture').getAttribute('aria-hidden')).to.equal('true');
    expect(count(el, '[aria-label]')).to.equal(0);
  });
});

describe('the drawn-output checker catches deliberate leaks', () => {
  const span = (role: string, text: string): HTMLElement => {
    const s = document.createElement('span');
    s.setAttribute('data-help-role', role);
    s.textContent = text;
    return s;
  };
  /** 7 × 8 on its third step: rows of 8, six counted. Unknown 56. */
  const sevenEights = (): ChocaHelp => {
    const el = opened({ fact: mult(7, 8), grade: '5' });
    click(el, 'more');
    click(el, 'more');
    return el;
  };
  const F = mult(7, 8);
  const WAY = 'Way 1 of 3: Equal groups';
  const PIC: HelpPicture = { kind: 'rows', rows: 7, perRow: 8, counted: 6 };

  it('passes a clean panel', () => {
    expect(check(sevenEights(), F, ['6 rows make 48. One row is left.'], PIC, WAY)).to.deep.equal([]);
  });

  it('the product in the text', () => {
    const el = sevenEights();
    the(el, 'text').append(' It is 56.');
    expect(codes(check(el, F, [], PIC, WAY))).to.deep.equal(['no-role', 'shows-unknown']);
  });

  it('the product in the text, from a translator', () => {
    const el = opened({ fact: F, grade: '5', translator: (k) => (k === 'mult.groups.ask' ? 'The answer is 56.' : undefined) });
    expect(codes(check(el, F))).to.include('shows-unknown');
  });

  it('the product behind a nested shadow root', () => {
    const el = sevenEights();
    const inner = document.createElement('span');
    inner.attachShadow({ mode: 'open' }).textContent = '56';
    the(el, 'text').append(inner);
    expect(codes(check(el, F))).to.include('shows-unknown');
  });

  it('the product in a spoken string', () => {
    expect(codes(check(sevenEights(), F, ['Six rows make 48. The answer is 56.'], PIC, WAY))).to.deep.equal(['spoken-differs']);
  });

  for (const attr of ['aria-label', 'alt', 'title']) {
    it(`the product in an ${attr}`, () => {
      const el = sevenEights();
      the(el, 'picture').setAttribute(attr, '56 in all');
      expect(codes(check(el, F, [], PIC, WAY))).to.deep.equal(['attribute-no-role', 'attribute-shows-unknown']);
    });
  }

  it('the product in a label marked partial', () => {
    const el = sevenEights();
    the(el, 'picture').append(span('partial', '56'));
    expect(codes(check(el, F, [], undefined, WAY))).to.deep.equal(['shows-unknown']);
  });

  it('the product in a label marked given, which the question does not show', () => {
    const el = sevenEights();
    the(el, 'picture').append(span('given', '56'));
    expect(codes(check(el, F, [], undefined, WAY))).to.deep.equal(['given-not-shown', 'shows-unknown']);
  });

  it('a label on the last row, even a given one, and a total past counted', () => {
    const el = opened({ fact: div(24, 4), grade: '5', pick: 'div.array' });
    click(el, 'more');
    const totals = Array.from(the(el, 'picture').querySelectorAll('[part~="row-total"]'));
    expect(totals.length).to.equal(6);
    totals[5]!.append(span('given', '24'));
    expect(codes(check(el, div(24, 4), [], { kind: 'rows', rows: 6, perRow: 4, counted: 1 }, 'Way 1 of 4: Array'))).to.deep.equal([
      'given-on-last-row',
      'last-row-labelled',
      'wrong-labels',
    ]);
  });

  it('a number with no role, even when it is not the unknown', () => {
    const el = sevenEights();
    the(el, 'picture').append('12');
    expect(codes(check(el, F, [], undefined, WAY))).to.deep.equal(['no-role']);
  });

  it('a made-up role', () => {
    const el = sevenEights();
    the(el, 'picture').append(span('hint', '12'));
    expect(codes(check(el, F, [], undefined, WAY))).to.deep.equal(['bad-role']);
  });

  it('a label on a deal or a take', () => {
    const el = opened({ fact: div(24, 4), grade: '5' });
    the(el, 'picture').append(span('partial', '4'));
    const deal: HelpPicture = { kind: 'deal', total: 24, rows: 4, dealt: 0 };
    expect(codes(check(el, div(24, 4), [], deal, 'Way 1 of 4: Share into equal groups'))).to.deep.equal(['wrong-labels']);
  });

  it('role decides when the question shows the unknown: 1 × 6 may say 6 as given, never as partial', () => {
    const f = mult(1, 6);
    const line = 'Way 1 of 1: Equal groups';
    const el = opened({ fact: f, grade: '5' });
    expect(check(el, f, ['One group of 6. How many is that?'], undefined, line)).to.deep.equal([]);
    the(el, 'picture').append(span('given', '6'));
    expect(check(el, f, [], undefined, line)).to.deep.equal([]);
    the(el, 'picture').append(span('partial', '6'));
    expect(codes(check(el, f, [], undefined, line))).to.deep.equal(['shows-unknown']);
  });

  it('roleNodes keeps a partial or anchor 6 from hiding behind a given 6 on 1 × 6, in any order', () => {
    const f = mult(1, 6);
    const line = 'Way 1 of 1: Equal groups';
    const words = 'One group of 6. 1 row makes 6.';
    for (const params of [
      { givenEach: 6, partialRows: 1, partialSum: 6 },
      { partialSum: 6, partialRows: 1, givenEach: 6 },
      { givenEach: 6, anchorRows: 1, anchorProduct: 6 },
    ]) {
      const el = opened({ fact: f, grade: '5' });
      the(el, 'text').replaceChildren(...roleNodes(words, params));
      expect(codes(check(el, f, [], undefined, line)), JSON.stringify(params)).to.deep.equal(['shows-unknown', 'shows-unknown']);
    }
    // A given 6 with nothing else behind it is fine.
    const el = opened({ fact: f, grade: '5' });
    the(el, 'text').replaceChildren(...roleNodes('One group of 6.', { givenEach: 6 }));
    expect(check(el, f, [], undefined, line)).to.deep.equal([]);
  });

  // The question shows the unknown on these, so "is it on screen" can't catch a leak: only the role can.
  for (const [name, fact, unknown] of [
    ['1 × 6', mult(1, 6), 6],
    ['6 × 1', mult(6, 1), 6],
    ['6 ÷ 1', div(6, 1), 6],
    ['49 ÷ 7', div(49, 7), 7],
    ['7 × ? = 49', mult(7, null, 49), 7],
  ] as [string, HelpFact, number][]) {
    it(`${name}: the unknown fails outside a given element, in an attribute, in speech and as a label`, () => {
      const drawn = (change: (el: ChocaHelp) => void, spoken: string[] = []): string[] => {
        const el = opened({ fact, grade: '5' });
        const line = way(el) as string;
        change(el);
        return codes(check(el, fact, spoken, undefined, line));
      };
      const clean = opened({ fact, grade: '5' });
      expect(check(clean, fact, [say(clean) as string], undefined, way(clean) as string), 'as drawn').to.deep.equal([]);
      for (const attr of ['aria-label', 'alt', 'title']) {
        expect(drawn((el) => the(el, 'picture').setAttribute(attr, `${unknown} in all`)), attr).to.deep.equal(['attribute-no-role', 'attribute-shows-unknown']);
        const labelled = (role: string): ((el: ChocaHelp) => void) => (el) => {
          const s = span(role, '');
          s.setAttribute(attr, String(unknown));
          the(el, 'picture').append(s);
        };
        expect(drawn(labelled('partial')), `${attr} on a partial`).to.deep.equal(['attribute-shows-unknown']);
        expect(drawn(labelled('given')), `${attr} on a given`).to.deep.equal([]);
      }
      expect(drawn(() => undefined, [`The answer is ${unknown}.`]), 'spoken').to.deep.equal(['spoken-differs']);
      expect(drawn((el) => the(el, 'picture').append(span('partial', String(unknown)))), 'a partial label').to.deep.equal(['shows-unknown']);
    });
  }

  it('the way line is excused only when it is exactly what it should be', () => {
    // 8 ÷ 2 has 4 ways, and its unknown is 4.
    const f = div(8, 2);
    const el = opened({ fact: f, grade: '5' });
    const right = 'Way 1 of 4: Share into equal groups';
    expect(way(el)).to.equal(right);
    expect(check(el, f, [], undefined, right)).to.deep.equal([]);
    expect(codes(check(el, f))).to.include('shows-unknown');
    expect(codes(check(el, f, [], undefined, 'Way 1 of 5: Share into equal groups'))).to.include('shows-unknown');

    // The excuse covers the line's own text and nothing else on it.
    const seven = mult(7, 8);
    const line = 'Way 1 of 3: Equal groups';
    const onWay = (change: (w: HTMLElement) => void): string[] => {
      const e = opened({ fact: seven, grade: '5' });
      expect(way(e)).to.equal(line);
      change(the(e, 'way'));
      return codes(check(e, seven, [], undefined, line));
    };
    expect(onWay(() => undefined)).to.deep.equal([]);
    expect(onWay((w) => w.setAttribute('aria-label', '56 in all')), 'its aria-label').to.deep.equal(['attribute-no-role', 'attribute-shows-unknown']);
    expect(
      onWay((w) => {
        const img = document.createElement('img');
        img.alt = '56';
        w.append(img);
      }),
      'a child alt',
    ).to.deep.equal(['attribute-no-role', 'attribute-shows-unknown']);
    expect(
      onWay((w) => {
        w.attachShadow({ mode: 'open' }).textContent = 'The answer is 56';
      }),
      'its shadow root',
    ).to.deep.equal(['no-role', 'shows-unknown']);
  });
});

describe('drawn output never shows the unknown', () => {
  /** Every fact with factors 1–12: both ops, the unknown in each position. */
  const allFacts = (): HelpFact[] => {
    const out: HelpFact[] = [];
    for (let x = 1; x <= 12; x++) {
      for (let y = 1; y <= 12; y++) {
        const p = x * y;
        out.push(mult(x, y), mult(null, y, p), mult(x, null, p), div(p, y), div(p, null, x), div(null, y, x));
      }
    }
    return out;
  };
  const isProduct = (f: HelpFact): boolean => f.op === 'mult' && f.c === null;
  const isTimesOne = (f: HelpFact): boolean => isProduct(f) && (f.a === 1 || f.b === 1);
  /** With the neighbours (the nearby fact adds on), then only the larger ones (it takes away). */
  const solvedSets = (f: HelpFact): SolvedFact[][] => {
    if (!isProduct(f)) return [[]];
    const a = f.a as number;
    const b = f.b as number;
    const smaller = [{ a: a - 1, b }, { a, b: b - 1 }];
    const larger = [{ a: a + 1, b }, { a, b: b + 1 }];
    return [[...smaller, ...larger, { a, b }, { a: b, b: a }], larger];
  };
  /** × 1 offers one strategy, but a kid's pick can reach the others. */
  const picksFor = (f: HelpFact): (StrategyId | null)[] => (isTimesOne(f) ? [null, ...STRATEGIES.map((s) => s.id)] : [null]);
  const nameOf = (id: StrategyId): string => lookup(en, `name.${id}`) as string;
  const yieldNow = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  /** Walks every way and every step of `fact`, checking each; returns the steps checked. */
  function walk(el: ChocaHelp, fact: HelpFact, grade: number, pick: StrategyId | null, solved: SolvedFact[], heard: ReturnType<typeof stubSpeech>, young: boolean, problems: string[]): number {
    const order = strategyOrder(fact, { grade, pick, solved });
    el.pick = pick;
    el.solved = solved;
    heard.spoken.length = 0;
    el.open();
    let checked = 0;
    const note = (where: string, found: string[]): void => {
      for (const p of found) problems.push(`${JSON.stringify(fact)} ${where}: ${p}`);
    };
    if (order.length === 0) {
      note('fallback', check(el, fact, heard.spoken, null));
      checked++;
    }
    order.forEach((id, w) => {
      const steps = buildSteps(id, fact, { grade, solved }) ?? [];
      const line = `Way ${w + 1} of ${order.length}: ${nameOf(id)}`;
      if (way(el) !== line) problems.push(`${JSON.stringify(fact)} expected "${line}", saw "${way(el)}"`);
      steps.forEach((step, i) => {
        if (young && heard.spoken.length !== 1) problems.push(`${JSON.stringify(fact)} ${id} step ${i}: heard ${heard.spoken.length} utterances`);
        note(`${id} step ${i}`, check(el, fact, heard.spoken, step.picture, line));
        checked++;
        heard.spoken.length = 0;
        if (i < steps.length - 1) click(el, 'more');
      });
      if (w < order.length - 1) click(el, 'thumb-down');
    });
    el.close();
    return checked;
  }

  it('in every step of every strategy, young, standard and with a failed animal', async function () {
    this.timeout(60000);
    const heard = stubSpeech();
    const problems: string[] = [];
    const facts = allFacts();
    const el = mountHelp();
    const counts = { young: 0, standard: 0, failed: 0, fellBack: 0 };

    // Young, with animals.
    el.grade = '2';
    el.pictureBase = BASE;
    let n = 0;
    for (const fact of facts) {
      el.fact = fact;
      for (const pick of picksFor(fact)) counts.young += walk(el, fact, 2, pick, [], heard, true, problems);
      if (++n % 40 === 0) await yieldNow();
    }

    // Standard, grade 5, with the nearby fact both ways.
    el.grade = '5';
    for (const fact of facts) {
      el.fact = fact;
      for (const solved of solvedSets(fact)) {
        for (const pick of picksFor(fact)) counts.standard += walk(el, fact, 5, pick, solved, heard, false, problems);
      }
      if (++n % 40 === 0) await yieldNow();
    }

    // Young with a forced animal failure on each step: its own opening each time, because a
    // failure turns the rest of the run to blocks.
    el.grade = '2';
    for (const fact of facts) {
      el.fact = fact;
      el.solved = [];
      const ids = new Set(picksFor(fact).flatMap((pick) => strategyOrder(fact, { grade: 2, pick, solved: [] })));
      for (const id of ids) {
        el.pick = id;
        const ways = strategyOrder(fact, { grade: 2, pick: id, solved: [] }).length;
        const line = `Way 1 of ${ways}: ${nameOf(id)}`;
        for (const [i, step] of (buildSteps(id, fact, { grade: 2, solved: [] }) ?? []).entries()) {
          el.open();
          for (let k = 0; k < i; k++) click(el, 'more');
          const before = labels(el);
          const img = the(el, 'picture').querySelector('img');
          if (img) {
            img.dispatchEvent(new Event('error'));
            if (the(el, 'picture').querySelector('img')) problems.push(`${JSON.stringify(fact)} ${id} step ${i}: animals still drawn`);
            if (labels(el).join() !== before.join()) problems.push(`${JSON.stringify(fact)} ${id} step ${i}: labels changed in the fallback`);
            counts.fellBack++;
          }
          // One utterance per step opened so far; the words on screen are only the last one's.
          if (heard.spoken.length !== i + 1) problems.push(`${JSON.stringify(fact)} ${id} step ${i}: heard ${heard.spoken.length} utterances`);
          for (const p of check(el, fact, heard.spoken.slice(-1), step.picture, line)) {
            problems.push(`${JSON.stringify(fact)} ${id} step ${i} (failed animal): ${p}`);
          }
          heard.spoken.length = 0;
          counts.failed++;
          el.close();
        }
      }
      if (++n % 40 === 0) await yieldNow();
    }

    expect(problems.slice(0, 20), `${problems.length} problems`).to.deep.equal([]);
    // The sweep really walked them: 3921, 9124, 3616 and 1566 when this was written.
    expect(counts.young, 'young steps').to.be.at.least(3900);
    expect(counts.standard, 'standard steps').to.be.at.least(9100);
    expect(counts.failed, 'failed-animal steps').to.be.at.least(3600);
    expect(counts.fellBack, 'steps with an animal to fail').to.be.at.least(1500);
  });
});
