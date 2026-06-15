import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The autonomy ladder — colour tracks escalating authority / cost-of-error.
        ladder: {
          suggest: '#15803d', // surfaces an option, human decides     (lowest authority)
          draft: '#0e7490', // produces a reviewable artefact
          approve: '#a16207', // acts, but only behind a human gate
          act: '#b91c1c', // acts autonomously                      (highest authority)
        },
        // The AI-or-not verdict — grey for "not AI", warming as model involvement rises.
        verdict: {
          none: '#475569', // not an AI problem (a SQL view / a workflow)
          ml: '#0369a1', // classical ML over tabular history
          single: '#0e7490', // one LLM call, no external knowledge
          rag: '#7c3aed', // retrieval-grounded generation
          agent: '#be185d', // a genuine multi-step agent
        },
        // EU AI Act risk tier — one lightweight governance input, not the product.
        risk: {
          prohibited: '#b91c1c',
          high: '#c2410c',
          limited: '#a16207',
          minimal: '#15803d',
        },
      },
    },
  },
  plugins: [],
};

export default config;
