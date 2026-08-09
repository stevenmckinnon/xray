import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

/**
 * The search index, as a static file.
 *
 * The site is `output: 'export'`, so there is no server to answer a query at
 * request time. `staticGET` pre-renders the whole index instead and the client
 * searches it in the browser — which is why the provider below has to be told
 * `type: 'static'`. Without both halves the search box renders and then fails.
 */
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source);
