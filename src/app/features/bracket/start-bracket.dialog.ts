import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TPipe } from '../../core/i18n/t.pipe';

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
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog" role="alertdialog" aria-labelledby="start-title">
      <header>
        <strong id="start-title" class="spacer">{{ 'bracket.startDialogTitle' | t }}</strong>
        <button class="ghost" (click)="ref.close(false)" [attr.aria-label]="'common.close' | t">✕</button>
      </header>
      <div class="body stack">
        <p>
          {{ 'bracket.startDialogBody' | t: { pool: data.poolName, count: data.setCount } }}
        </p>
        <p class="muted small">{{ 'bracket.startDialogHint' | t }}</p>
      </div>
      <footer>
        <span class="spacer"></span>
        <button type="button" class="ghost" (click)="ref.close(false)">{{ 'common.cancel' | t }}</button>
        <button type="button" class="primary" (click)="ref.close(true)">{{ 'bracket.startConfirm' | t }}</button>
      </footer>
    </div>
  `,
})
export class StartBracketDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<StartBracketData>(DIALOG_DATA);
}
