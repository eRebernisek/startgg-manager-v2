import { Id } from '../../core/api/models';
import { Placement } from '../../core/attendees';

export interface AttendeeDialogContext {
  tournamentId: Id;
  tournamentName: string;
  tournamentSlug: string;
  eventId: Id;
  eventName: string;
  /** Why mutations cannot run right now (no session / no transport), or null when they can. */
  blockedReason: string | null;
}

export interface AddAttendeeData extends AttendeeDialogContext {
  registeredPlayerIds: string[];
}

export interface AddAttendeeResult {
  participantId: Id;
  label: string;
  placement: Placement;
}

export interface AttendeeTarget extends AttendeeDialogContext {
  participantId: Id;
  tag: string;
  prefix: string | null;
  eventCount: number | null;
}

export const dialogConfig = {
  panelClass: 'app-dialog-panel',
  backdropClass: ['cdk-overlay-backdrop', 'app-dialog-backdrop'],
};

export function attendeeLabel(tag: string, prefix: string | null | undefined): string {
  return prefix ? `${prefix} | ${tag}` : tag;
}
