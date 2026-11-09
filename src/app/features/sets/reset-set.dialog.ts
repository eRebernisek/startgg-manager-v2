import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TPipe } from '../../core/i18n/t.pipe';

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
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog" role="alertdialog" aria-labelledby="reset-set-title">
      <header>
        <strong id="reset-set-title" class="spacer">{{ 'setEditor.resetTitle' | t }}</strong>
        <button type="button" class="ghost" (click)="ref.close()" [attr.aria-label]="'common.close' | t">✕</button>
      </header>
      <div class="body stack">
        <p>{{ 'setEditor.resetBody' | t }}</p>
        <p class="muted small">{{ 'setEditor.resetHint' | t }}</p>
      </div>
      <footer class="reset-set-footer">
        <button type="button" class="ghost" (click)="ref.close()">{{ 'common.cancel' | t }}</button>
        <span class="spacer"></span>
        <button type="button" class="sm" (click)="ref.close('this')">{{ 'setEditor.resetThis' | t }}</button>
        <button type="button" class="danger sm" (click)="ref.close('dependents')">
          {{ 'setEditor.resetDeps' | t }}
        </button>
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
