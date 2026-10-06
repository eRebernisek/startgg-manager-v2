import { BracketSet, Entrant, Image, Participant, SetState } from '../core/api/models';

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

const STATE_LABELS: Record<number, string> = {
  [SetState.Created]: 'Not started',
  [SetState.InProgress]: 'In progress',
  [SetState.Completed]: 'Completed',
  [SetState.Ready]: 'Ready',
  [SetState.Invalid]: 'Invalid',
  [SetState.Called]: 'Called',
  [SetState.Queued]: 'Queued',
};

export function setStateLabel(state: number): string {
  return STATE_LABELS[state] ?? `State ${state}`;
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

export function formatDate(ts: number | null | undefined): string {
  return ts ? new Date(ts * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
