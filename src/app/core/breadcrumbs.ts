import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './auth.service';
import type { I18nKey } from './i18n/en';
import { I18nService, type TranslateFn } from './i18n/i18n.service';

export interface Crumb {
  label: string;
  /** Omitted on the current page. */
  url?: string;
}

const SECTION_KEYS: Record<string, I18nKey> = {
  bracket: 'nav.section.bracket',
  sets: 'nav.section.sets',
  entrants: 'nav.section.entrants',
  seeding: 'nav.section.seeding',
};

export function tournamentCrumbKey(slug: string): string {
  return `tournament:${slug}`;
}

export function eventCrumbKey(tournamentSlug: string, eventSlug: string): string {
  return `event:${tournamentSlug}/${eventSlug}`;
}

/** Splits a router URL into a path (no query) and the path plus query. */
export function splitAppUrl(url: string): { path: string; full: string } {
  const noHash = url.split('#')[0] ?? '';
  const q = noHash.indexOf('?');
  const rawPath = q >= 0 ? noHash.slice(0, q) : noHash;
  const query = q >= 0 ? noHash.slice(q + 1) : '';
  let path = rawPath || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return { path, full: query ? `${path}?${query}` : path };
}

export function humanizeSlug(slug: string): string {
  let text = slug;
  try {
    text = decodeURIComponent(slug);
  } catch {
    text = slug;
  }
  return text
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/(^|\s)(\S)/g, (_match, space: string, ch: string) => space + ch.toUpperCase());
}

/**
 * Where the back button goes when this screen was opened directly.
 * Event tab → tournament → my tournaments (or home without a token) → home.
 */
export function logicalParent(url: string, hasToken: boolean): string | null {
  const parts = splitAppUrl(url).path.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts[0] === 'settings' || parts[0] === 'tournaments') return '/';
  if (parts[0] === 'tournament' && parts[1]) {
    if (parts[2] === 'event' && parts[3]) return `/tournament/${parts[1]}`;
    return hasToken ? '/tournaments' : '/';
  }
  return '/';
}

/** Breadcrumb trail for a router URL. Names fall back to the slug until a page reports the real title. */
export function breadcrumbTrail(
  url: string,
  labels: Readonly<Record<string, string>>,
  hasToken: boolean,
  t: TranslateFn = (key) => key,
): Crumb[] {
  const parts = splitAppUrl(url).path.split('/').filter(Boolean);
  const home: Crumb = { label: t('nav.home'), url: '/' };
  if (parts.length === 0) return [{ label: t('nav.home') }];
  if (parts[0] === 'settings') return [home, { label: t('nav.settings') }];
  if (parts[0] === 'tournaments') return [home, { label: t('nav.tournaments') }];

  if (parts[0] === 'tournament' && parts[1]) {
    const tournamentSlug = parts[1];
    const tournamentLabel = labels[tournamentCrumbKey(tournamentSlug)] ?? humanizeSlug(tournamentSlug);
    const crumbs: Crumb[] = [home];
    if (hasToken) crumbs.push({ label: t('nav.tournaments'), url: '/tournaments' });

    const eventSlug = parts[2] === 'event' ? parts[3] : undefined;
    if (!eventSlug) {
      crumbs.push({ label: tournamentLabel });
      return crumbs;
    }

    crumbs.push({ label: tournamentLabel, url: `/tournament/${tournamentSlug}` });
    const section = parts[4] || 'bracket';
    const eventLabel = labels[eventCrumbKey(tournamentSlug, eventSlug)] ?? humanizeSlug(eventSlug);
    crumbs.push({
      label: eventLabel,
      url: `/tournament/${tournamentSlug}/event/${eventSlug}/bracket`,
    });
    const sectionKey = SECTION_KEYS[section];
    crumbs.push({ label: sectionKey ? t(sectionKey) : humanizeSlug(section) });
    return crumbs;
  }

  return [{ label: t('nav.home') }];
}

@Injectable({ providedIn: 'root' })
export class BreadcrumbService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly labels = signal<Record<string, string>>({});
  private readonly url = signal(splitAppUrl(this.router.url).full);

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.url.set(splitAppUrl(event.urlAfterRedirects).full));
  }

  /**
   * True when `url` is the screen already open. The event crumb points at `/bracket`
   * without `?phase=&group=`, and following it must replace the current entry.
   */
  samePath(url: string): boolean {
    return splitAppUrl(this.url()).path === splitAppUrl(url).path;
  }

  /** Real tournament or event title, keyed with {@link tournamentCrumbKey} / {@link eventCrumbKey}. */
  setLabel(key: string, label: string): void {
    const trimmed = label.trim();
    if (!trimmed) return;
    this.labels.update((map) => (map[key] === trimmed ? map : { ...map, [key]: trimmed }));
  }

  readonly trail = computed(() => {
    this.i18n.lang();
    return breadcrumbTrail(this.url(), this.labels(), this.auth.hasToken(), (key, params) =>
      this.i18n.t(key, params),
    );
  });
}
