import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type ResetSetChoice = 'this' | 'dependents';

const panel = {
  panelClass: 'app-dialog-panel',
  backdropClass: ['cdk-overlay-backdrop', 'app-dialog-backdrop'],
};

/** Opens the set-reset chooser. Resolves `'this'`, `'dependents'`, or `undefined` if cancelled. */
export function openResetSetDialog(dialog: Dialog) {
  return dialog.open<ResetSetChoice | undefined>(ResetSetDialog, panel);
}

export async function askResetSet(dialog: Dialog): Promise<ResetSetChoice | null> {
  const ref = openResetSetDialog(dialog);
  const result = await firstValueFrom(ref.closed);
  return result ?? null;
}

@Component({
  selector: 'app-reset-set-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog" role="alertdialog" aria-labelledby="reset-set-title">
      <header>
        <strong id="reset-set-title" class="spacer">Reset set?</strong>
        <button type="button" class="ghost" (click)="ref.close()" aria-label="Close">✕</button>
      </header>
      <div class="body stack">
        <p>This clears the reported result for this set on start.gg.</p>
        <p class="muted small">
          If later sets already advanced from this result, choose <strong>Reset with dependents</strong> so those
          sets are cleared too. That cannot be undone.
        </p>
      </div>
      <footer class="reset-set-footer">
        <button type="button" class="ghost" (click)="ref.close()">Cancel</button>
        <span class="spacer"></span>
        <button type="button" class="sm" (click)="ref.close('this')">Reset this set</button>
        <button type="button" class="danger sm" (click)="ref.close('dependents')">Reset with dependents</button>
      </footer>
    </div>
  `,
  styles: `
    .reset-set-footer {
      flex-wrap: wrap;
      gap: 0.4rem;
    }
  `,
})
export class ResetSetDialog {
  protected readonly ref = inject<DialogRef<ResetSetChoice | undefined>>(DialogRef);
}
