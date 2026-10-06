import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AttendeesApi } from '../../core/api/attendees-api.service';
import { startggAdminUrl } from '../../core/bracket-url';
import { errorMessage } from '../../shared/display';
import { AttendeeTarget, attendeeLabel, dialogConfig } from './attendee-dialogs';

export function openRemoveAttendee(dialog: Dialog, injector: Injector, data: AttendeeTarget) {
  return dialog.open<boolean, AttendeeTarget>(RemoveAttendeeDialog, { ...dialogConfig, injector, data });
}

@Component({
  selector: 'app-remove-attendee-dialog',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './attendees.scss',
  template: `
    <div class="dialog attendee-dialog" role="alertdialog" aria-labelledby="remove-title">
      <header>
        <strong id="remove-title" class="spacer">Remove attendee?</strong>
        <button type="button" class="ghost" (click)="ref.close(false)" aria-label="Close">✕</button>
      </header>
      <div class="body stack">
        <p>
          Remove <strong>{{ label }}</strong> from <strong>{{ data.tournamentName }}</strong>?
        </p>
        <p class="muted small">
          start.gg removes the attendee from the tournament
          @if ((data.eventCount ?? 1) > 1) {
            and from <strong>all {{ data.eventCount }} events</strong> they entered, not only {{ data.eventName }}.
            To drop just this event, edit their registration on start.gg.
          } @else {
            and from {{ data.eventName }}.
          }
          Their seed and any unplayed sets go with them. This cannot be undone.
        </p>
        @if ((data.eventCount ?? 1) > 1) {
          <a class="btn sm" [href]="attendeesUrl" target="_blank" rel="noopener">Edit registration on start.gg ↗</a>
        }
        @if (data.blockedReason) {
          <div class="alert warn small stack">
            <span>{{ data.blockedReason }}</span>
            <span class="row">
              <a class="btn sm" routerLink="/settings" (click)="ref.close(false)">Open Settings</a>
              <a class="btn sm" [href]="attendeesUrl" target="_blank" rel="noopener">Remove on start.gg ↗</a>
            </span>
          </div>
        }
        @if (error()) {
          <div class="alert error small" role="alert">{{ error() }}</div>
        }
      </div>
      <footer>
        <span class="spacer"></span>
        <button type="button" class="ghost" [disabled]="busy()" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="danger" [disabled]="busy() || !!data.blockedReason" (click)="remove()">
          @if (busy()) {
            <span class="spinner sm"></span> Removing…
          } @else {
            Remove
          }
        </button>
      </footer>
    </div>
  `,
})
export class RemoveAttendeeDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<AttendeeTarget>(DIALOG_DATA);
  private readonly attendees = inject(AttendeesApi);

  protected readonly label = attendeeLabel(this.data.tag, this.data.prefix);
  protected readonly attendeesUrl = startggAdminUrl(this.data.tournamentSlug, 'attendees');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async remove(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.attendees.remove(this.data.participantId);
      this.ref.close(true);
    } catch (e) {
      this.error.set(`start.gg: ${errorMessage(e)}`);
    } finally {
      this.busy.set(false);
    }
  }
}
