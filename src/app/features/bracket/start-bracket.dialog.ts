import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

export interface StartBracketData {
  poolName: string;
  setCount: number;
}

/** Resolves to true only when the user presses Start. */
export function confirmBracketStart(dialog: Dialog, data: StartBracketData) {
  return dialog.open<boolean, StartBracketData>(StartBracketDialog, {
    data,
    panelClass: 'app-dialog-panel',
    backdropClass: ['cdk-overlay-backdrop', 'app-dialog-backdrop'],
  });
}

@Component({
  selector: 'app-start-bracket-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog" role="alertdialog" aria-labelledby="start-title">
      <header>
        <strong id="start-title" class="spacer">Start bracket?</strong>
        <button class="ghost" (click)="ref.close(false)" aria-label="Close">✕</button>
      </header>
      <div class="body stack">
        <p>
          This starts <strong>{{ data.poolName }}</strong> on start.gg and creates its
          {{ data.setCount }} sets, so you can report results here.
        </p>
        <p class="muted small">
          start.gg has no start button in its API: the app calls one opening set to start the bracket and then
          clears that call, so no set is left marked as called. Seeding is locked once the bracket has started
          (use Reset bracket on the Seeding tab to change it).
        </p>
      </div>
      <footer>
        <span class="spacer"></span>
        <button type="button" class="ghost" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="primary" (click)="ref.close(true)">Start</button>
      </footer>
    </div>
  `,
})
export class StartBracketDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<StartBracketData>(DIALOG_DATA);
}
