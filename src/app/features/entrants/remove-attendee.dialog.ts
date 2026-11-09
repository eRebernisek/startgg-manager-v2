import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AttendeesApi } from '../../core/api/attendees-api.service';
import { startggAdminUrl } from '../../core/bracket-url';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';
import { errorMessage } from '../../shared/display';
import { AttendeeTarget, attendeeLabel, dialogConfig } from './attendee-dialogs';

export function openRemoveAttendee(dialog: Dialog, injector: Injector, data: AttendeeTarget) {
  return dialog.open<boolean, AttendeeTarget>(RemoveAttendeeDialog, { ...dialogConfig, injector, data });
}

@Component({
  selector: 'app-remove-attendee-dialog',
  imports: [RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './attendees.scss',
  template: `
    <div class="dialog attendee-dialog" role="alertdialog" aria-labelledby="remove-title">
      <header>
        <strong id="remove-title" class="spacer">{{ 'entrants.removeTitle' | t }}</strong>
        <button type="button" class="ghost" (click)="ref.close(false)" [attr.aria-label]="'common.close' | t">
          ✕
        </button>
      </header>
      <div class="body stack">
        <p>{{ 'entrants.removeBody' | t: { label: label, tournament: data.tournamentName } }}</p>
        <p class="muted small">
          @if ((data.eventCount ?? 1) > 1) {
            {{ 'entrants.removeMulti' | t: { n: data.eventCount ?? 1, event: data.eventName } }}
          } @else {
            {{ 'entrants.removeSingle' | t: { event: data.eventName } }}
          }
        </p>
        @if ((data.eventCount ?? 1) > 1) {
          <a class="btn sm" [href]="attendeesUrl" target="_blank" rel="noopener">{{ 'entrants.editReg' | t }}</a>
        }
        @if (data.blockedReason) {
          <div class="alert warn small stack">
            <span>{{ data.blockedReason }}</span>
            <span class="row">
              <a class="btn sm" routerLink="/settings" (click)="ref.close(false)">{{
                'entrants.openSettings' | t
              }}</a>
              <a class="btn sm" [href]="attendeesUrl" target="_blank" rel="noopener">{{
                'entrants.removeOnStartgg' | t
              }}</a>
            </span>
          </div>
        }
        @if (error()) {
          <div class="alert error small" role="alert">{{ error() }}</div>
        }
      </div>
      <footer>
        <span class="spacer"></span>
        <button type="button" class="ghost" [disabled]="busy()" (click)="ref.close(false)">
          {{ 'common.cancel' | t }}
        </button>
        <button type="button" class="danger" [disabled]="busy() || !!data.blockedReason" (click)="remove()">
          @if (busy()) {
            <span class="spinner sm"></span> {{ 'entrants.removing' | t }}
          } @else {
            {{ 'entrants.remove' | t }}
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
  private readonly i18n = inject(I18nService);

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
      this.error.set(this.i18n.t('entrants.apiError', { message: errorMessage(e) }));
    } finally {
      this.busy.set(false);
    }
  }
}
