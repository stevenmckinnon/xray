import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      /**
       * Chosen by measuring, not by eye.
       *
       * Every candidate theme's token colours were scored against its own
       * background: `ayu-dark` came out at a median 7.9:1 with one scope under AA,
       * and its #10141c background is within a hair of this page's own #0a0d12, so
       * a code block reads as part of the page rather than pasted onto it.
       *
       * The first attempt used vitesse, which is beautifully muted and too muted:
       * a median of 4.59:1 in light with thirteen scopes under AA, and punctuation
       * down at 3.26:1. The warm light themes that would have matched the paper
       * surface score worse still — everforest-light 2.79, rose-pine-dawn 3.47 —
       * so light takes a white background and the contrast that comes with it.
       *
       * Both palettes are emitted as CSS variables and selected in docs.css,
       * keyed off `[data-theme]` — see the note there.
       */
      themes: {
        light: 'github-light-default',
        dark: 'ayu-dark',
      },
      /**
       * No default palette baked in.
       *
       * Shiki's dual-theme mode otherwise writes the light theme's colour inline
       * on the `pre` element, and an inline style beats any stylesheet — so the
       * rules in docs.css lost, and code rendered as vitesse-light's near-black
       * text on this page's near-black surface at 1.73:1. With this off, Shiki
       * emits only the two CSS variables and docs.css decides.
       */
      defaultColor: false,
    },
  },
});
