import { Panel } from '@/components/Panel';
import defaultComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

/**
 * Components available to every MDX page.
 *
 * `Panel` is the same one the landing page uses, rendered from
 * `src/data/report.json` — real `inspect()` output. The docs used to show an ASCII
 * mock of the panel in a fenced block, which was a drawing of the tool rather than
 * the tool, and being language-less it also fell outside syntax highlighting and
 * rendered at 1.63:1.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultComponents, Panel, ...components };
}
