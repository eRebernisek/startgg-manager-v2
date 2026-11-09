import { BracketSet, Entrant, Image, Participant, SetState } from '../core/api/models';
import type { I18nKey } from '../core/i18n/en';
import type { AppLang, TranslateFn } from '../core/i18n/i18n.service';

export function profileImage(images: Image[] | null | undefined): string | null {
  if (!images?.length) return null;
  return (images.find((i) => i.type === 'profile') ?? images[0]).url;
}

export function participantAvatar(p: Participant | null | undefined): string | null {
  return profileImage(p?.user?.images);
}

/** Avatar of a singles entrant (first participant); team entrants show initials. */
export function entrantAvatar(e: Entrant | null | undefined): string | null {
  return e?.participants?.length === 1 ? participantAvatar(e.participants[0]) : null;
}

export function participantTag(p: Participant): string {
  return p.player?.gamerTag ?? p.gamerTag ?? '?';
}

export function participantPrefix(p: Participant): string | null {
  return (p.player?.prefix ?? p.prefix) || null;
}

export function initials(name: string | null | undefined): string {
  const clean = (name ?? '?').split('|').pop()!.trim();
  return clean.slice(0, 2).toUpperCase() || '?';
}

const STATE_KEYS: Record<number, I18nKey> = {
  [SetState.Created]: 'state.created',
  [SetState.InProgress]: 'state.inProgress',
  [SetState.Completed]: 'state.completed',
  [SetState.Ready]: 'state.ready',
  [SetState.Invalid]: 'state.invalid',
  [SetState.Called]: 'state.called',
  [SetState.Queued]: 'state.queued',
};

export function setStateLabel(state: number, t: TranslateFn): string {
  const key = STATE_KEYS[state];
  return key ? t(key) : t('state.unknown', { n: state });
}

export function setStateClass(set: BracketSet): string {
  switch (set.state) {
    case SetState.InProgress:
      return 'state-live';
    case SetState.Called:
      return 'state-called';
    case SetState.Completed:
      return 'state-done';
    default:
      return 'state-idle';
  }
}

export function formatDate(ts: number | null | undefined, lang: AppLang = 'en'): string {
  if (!ts) return '';
  const locale = lang === 'pt' ? 'pt-BR' : 'en-US';
  return new Date(ts * 1000).toLocaleDateString(locale, { dateStyle: 'medium' });
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
