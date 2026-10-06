import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AttendeesApi } from '../../core/api/attendees-api.service';
import { MAX_GAMER_TAG, MAX_PREFIX, validateTag } from '../../core/attendees';
import { startggAdminUrl } from '../../core/bracket-url';
import { errorMessage } from '../../shared/display';
import { AttendeeTarget, dialogConfig } from './attendee-dialogs';

export interface EditTagResult {
  gamerTag: string;
  prefix: string | null;
}

export function openEditTag(dialog: Dialog, injector: Injector, data: AttendeeTarget) {
  return dialog.open<EditTagResult, AttendeeTarget>(EditTagDialog, { ...dialogConfig, injector, data });
}

@Component({
  selector: 'app-edit-tag-dialog',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './attendees.scss',
  template: `
    <form class="dialog attendee-dialog" (ngSubmit)="save()" aria-labelledby="tag-title">
      <header>
        <strong id="tag-title" class="spacer">Change tag</strong>
        <button type="button" class="ghost" (click)="ref.close()" aria-label="Close">✕</button>
      </header>
      <div class="body stack">
        <p class="muted small">
          How this attendee appears in <strong>{{ data.tournamentName }}</strong> (brackets, seeding, results). Their
          start.gg profile is not changed.
        </p>
        @if (data.blockedReason) {
          <div class="alert warn small stack">
            <span>{{ data.blockedReason }}</span>
            <span class="row">
              <a class="btn sm" routerLink="/settings" (click)="ref.close()">Open Settings</a>
              <a class="btn sm" [href]="attendeesUrl" target="_blank" rel="noopener">Edit on start.gg ↗</a>
            </span>
          </div>
        }
        <div class="tag-fields">
          <label class="field prefix-field">
            Prefix
            <input name="prefix" [maxlength]="maxPrefix" [ngModel]="prefix()" (ngModelChange)="prefix.set($event)" />
          </label>
          <label class="field">
            Gamer tag *
            <input
              name="gamerTag"
              required
              [maxlength]="maxTag"
              [ngModel]="tag()"
              (ngModelChange)="tag.set($event)"
            />
          </label>
        </div>
        @if (invalid()) {
          <div class="small error-text">{{ invalid() }}</div>
        }
        @if (error()) {
          <div class="alert error small" role="alert">{{ error() }}</div>
        }
      </div>
      <footer>
        <button type="submit" class="primary" [disabled]="!canSave()">
          @if (busy()) {
            <span class="spinner sm"></span> Saving…
          } @else {
            Save tag
          }
        </button>
        <button type="button" class="cancel" [disabled]="busy()" (click)="ref.close()">Cancel</button>
      </footer>
    </form>
  `,
})
export class EditTagDialog {
  protected readonly ref = inject<DialogRef<EditTagResult>>(DialogRef);
  protected readonly data = inject<AttendeeTarget>(DIALOG_DATA);
  private readonly attendees = inject(AttendeesApi);

  protected readonly maxTag = MAX_GAMER_TAG;
  protected readonly maxPrefix = MAX_PREFIX;
  protected readonly attendeesUrl = startggAdminUrl(this.data.tournamentSlug, 'attendees');
  protected readonly tag = signal(this.data.tag);
  protected readonly prefix = signal(this.data.prefix ?? '');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly invalid = computed(() => validateTag(this.tag(), this.prefix()));
  private readonly unchanged = computed(
    () => this.tag().trim() === this.data.tag && this.prefix().trim() === (this.data.prefix ?? ''),
  );
  protected readonly canSave = computed(
    () => !this.busy() && !this.data.blockedReason && !this.invalid() && !this.unchanged(),
  );

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const updated = await this.attendees.rename(this.data.participantId, this.tag(), this.prefix());
      this.ref.close({ gamerTag: updated.gamerTag, prefix: updated.prefix || null });
    } catch (e) {
      this.error.set(`start.gg: ${errorMessage(e)}`);
    } finally {
      this.busy.set(false);
    }
  }
}
