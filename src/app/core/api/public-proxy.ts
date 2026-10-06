/**
 * Default CORS proxy for token-less view-only reads from static hosts (GitHub Pages).
 *
 * start.gg's website GraphQL (`www.start.gg/api/-/gql`) allows anonymous reads (same approach as
 * TournamentStreamHelper) but its CORS only allows `https://www.start.gg`. The small Worker in
 * `proxy/` forwards POSTs there with no secrets stored. Override in Settings → Proxy URL.
 *
 * Official API (`api.start.gg/gql/alpha`) always requires a personal token — do not bake one in.
 */
export const DEFAULT_PUBLIC_PROXY_URL =
  'https://startgg-manager-v2-proxy.scratch-gallium.workers.dev';
