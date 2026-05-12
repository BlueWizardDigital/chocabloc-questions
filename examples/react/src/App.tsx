import { useEffect, useRef, useState } from 'react';
import 'chocabloc-questions/elements/coin-pile';
import { normalizeQuestion } from 'chocabloc-questions/helpers';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'chocabloc-question': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'answer-mode'?: string;
          seed?: string;
        },
        HTMLElement
      >;
    }
  }
}

const SAMPLE_RAW = {
  id: 'MONEY-COIN-VALUE-USD-144',
  skill_ids: ['MONEY-COIN-VALUE-USD'],
  content: { coins: { penny: 4, nickel: 1, dime: 1, quarter: 5 }, operation: 'money' },
  answer: 144,
  distractors: [
    { value: 140, error_type: 'off-by-nickel' },
    { value: 150, error_type: 'off-by-nickel' },
    { value: 145, error_type: 'off-by-1' },
  ],
  format: 'money',
  image_type: 'coins',
};

export default function App() {
  const ref = useRef<HTMLElement>(null);
  const [verdict, setVerdict] = useState<unknown>(null);

  useEffect(() => {
    const el = ref.current as (HTMLElement & { question: unknown }) | null;
    if (!el) return;
    el.question = normalizeQuestion(SAMPLE_RAW);
    const handler = (e: Event) => setVerdict((e as CustomEvent).detail);
    el.addEventListener('answered', handler);
    return () => el.removeEventListener('answered', handler);
  }, []);

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui', maxWidth: 800, margin: '0 auto' }}>
      <h1>chocabloc-questions — React Example</h1>
      <p>Pick a choice. Verdict appears below.</p>
      <chocabloc-question ref={ref as React.Ref<HTMLElement>} answer-mode="mc" seed="42" />
      <pre style={{ marginTop: 16, fontSize: 12 }}>{JSON.stringify(verdict, null, 2)}</pre>
    </div>
  );
}
