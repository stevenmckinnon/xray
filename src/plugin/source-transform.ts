/**
 * Stamp `data-xray-src="file:line:col"` onto DOM-producing JSX elements.
 *
 * A finding is only actionable if you can get to the line that caused it. React
 * dropped `_debugSource` in 19, so we add our own attribute in dev — the same
 * trick the JSX source plugin used, narrowed to lowercase tags so component
 * props are never touched.
 */

import { parse } from '@babel/parser';
import MagicString from 'magic-string';

interface Node {
  type: string;
  start?: number;
  end?: number;
  loc?: { start: { line: number; column: number } };
  [key: string]: unknown;
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && typeof (child as Node).type === 'string') {
          walk(child as Node, visit);
        }
      }
    } else if (value && typeof value === 'object' && typeof (value as Node).type === 'string') {
      walk(value as Node, visit);
    }
  }
}

/** Lowercase, dash-free names are DOM elements; anything else is a component. */
function isDomElement(name: Node | undefined): boolean {
  if (!name || name.type !== 'JSXIdentifier') return false;
  const raw = name['name'];
  return typeof raw === 'string' && /^[a-z]/.test(raw);
}

export function injectSource(
  code: string,
  id: string,
  root: string,
): { code: string; map: ReturnType<MagicString['generateMap']> } | null {
  if (!code.includes('<')) return null;

  let ast: Node;
  try {
    ast = parse(code, {
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      plugins: [
        'jsx',
        id.endsWith('.tsx') || id.endsWith('.ts') ? 'typescript' : 'flow',
        'decorators-legacy',
        'classProperties',
      ],
    }) as unknown as Node;
  } catch {
    return null; // let the real transform report the syntax error
  }

  const relative = id.startsWith(root) ? id.slice(root.length).replace(/^\//, '') : id;
  const s = new MagicString(code);
  let touched = false;

  walk(ast, (node) => {
    if (node.type !== 'JSXOpeningElement') return;
    const name = node['name'] as Node | undefined;
    if (!isDomElement(name)) return;
    const attrs = (node['attributes'] as Node[] | undefined) ?? [];
    if (attrs.some((a) => a.type === 'JSXAttribute' && (a['name'] as Node | undefined)?.['name'] === 'data-xray-src')) {
      return;
    }
    const end = name?.end;
    const loc = node.loc?.start;
    if (end === undefined || !loc) return;
    s.appendLeft(end, ` data-xray-src="${relative}:${loc.line}:${loc.column + 1}"`);
    touched = true;
  });

  if (!touched) return null;
  return { code: s.toString(), map: s.generateMap({ hires: true, source: id }) };
}
