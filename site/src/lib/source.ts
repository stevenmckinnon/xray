import { docs } from '../../.source/server';
import { loader } from 'fumadocs-core/source';

/**
 * The docs tree.
 *
 * `baseUrl` has to match the route segment, or every generated link 404s while
 * the pages themselves render fine — which is a confusing way to find out.
 */
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
