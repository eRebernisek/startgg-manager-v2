export interface BracketUrlParts {
  tournamentSlug: string;
  eventSlug?: string;
  phaseId?: string;
  phaseGroupId?: string;
}

/**
 * Parses start.gg URLs (also legacy smash.gg), e.g.
 *   https://www.start.gg/tournament/<t>/event/<e>/brackets/<phaseId>/<phaseGroupId>
 *   https://start.gg/tournament/<t>/event/<e>/overview
 *   https://www.start.gg/admin/tournament/<t>/brackets
 *   tournament/<t>/event/<e>
 */
export function parseBracketUrl(input: string): BracketUrlParts | null {
  // Allow pasted text with surrounding whitespace / junk before the URL.
  const match = input.match(
    /(?:https?:\/\/)?(?:www\.)?(?:start\.gg|smash\.gg)\/[^\s]*/i,
  );
  const text = (match?.[0] ?? input).trim().replace(/\/+$/, '');
  if (!text) return null;
  let path: string;
  try {
    const url = new URL(text.includes('://') ? text : `https://www.start.gg/${text.replace(/^\/+/, '')}`);
    path = url.pathname;
  } catch {
    return null;
  }
  const parts = path.split('/').filter(Boolean);
  const t = parts.indexOf('tournament');
  if (t < 0 || !parts[t + 1]) return null;

  const result: BracketUrlParts = { tournamentSlug: parts[t + 1] };
  const e = parts.indexOf('event', t);
  if (e > 0 && parts[e + 1]) {
    result.eventSlug = parts[e + 1];
    const b = parts.indexOf('brackets', e);
    if (b > 0 && /^\d+$/.test(parts[b + 1] ?? '')) {
      result.phaseId = parts[b + 1];
      if (/^\d+$/.test(parts[b + 2] ?? '')) result.phaseGroupId = parts[b + 2];
    }
  }
  return result;
}

/** Full start.gg event slug as used by the API: `tournament/<t>/event/<e>`. */
export function eventApiSlug(tournamentSlug: string, eventSlug: string): string {
  return `tournament/${tournamentSlug}/event/${eventSlug}`;
}

/** Strips the `tournament/` prefix the API returns in `Tournament.slug`. */
export function shortSlug(slug: string): string {
  return slug.split('/').filter(Boolean).pop() ?? slug;
}

export function startggAdminUrl(tournamentSlug: string, path = ''): string {
  return `https://www.start.gg/admin/tournament/${tournamentSlug}${path ? '/' + path : ''}`;
}
