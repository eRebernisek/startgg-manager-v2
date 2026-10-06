import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ResetSummary } from '../../core/bracket-reset';

export interface ResetBracketData extends ResetSummary {
  phaseName: string;
}

/** Resolves to true only when the user presses Reset. */
export function confirmBracketReset(dialog: Dialog, data: ResetBracketData) {
  return dialog.open<boolean, ResetBracketData>(ResetBracketDialog, {
    data,
    panelClass: 'app-dialog-panel',
    backdropClass: ['cdk-overlay-backdrop', 'app-dialog-backdrop'],
  });
}

@Component({
  selector: 'app-reset-bracket-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog" role="alertdialog" aria-labelledby="reset-title">
      <header>
        <strong id="reset-title" class="spacer">Reset bracket?</strong>
        <button class="ghost" (click)="ref.close(false)" aria-label="Close">✕</button>
      </header>
      <div class="body stack">
        <p>
          @if (data.reported || data.inProgress) {
            This will reset <strong>{{ data.reported }}</strong> reported
            {{ data.reported === 1 ? 'set' : 'sets' }}
            @if (data.inProgress) {
              and <strong>{{ data.inProgress }}</strong> in-progress
              {{ data.inProgress === 1 ? 'set' : 'sets' }}
            }
            in <strong>{{ data.phaseName }}</strong> and erase their results.
          } @else {
            No sets in <strong>{{ data.phaseName }}</strong> have been reported, so no results will be lost.
          }
        </p>
        <p class="muted small">
          start.gg will un-start the bracket and rebuild its {{ data.total }} sets from the seeding, so you can
          reseed. This cannot be undone.
        </p>
      </div>
      <footer>
        <span class="spacer"></span>
        <button type="button" class="ghost" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="danger" (click)="ref.close(true)">Reset</button>
      </footer>
    </div>
  `,
})
export class ResetBracketDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<ResetBracketData>(DIALOG_DATA);
}
