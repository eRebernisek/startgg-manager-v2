import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { I18nService } from '../core/i18n/i18n.service';
import { TPipe } from '../core/i18n/t.pipe';

export interface ConfirmDialogData {
  title: string;
  body: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the danger button style (destructive actions). */
  danger?: boolean;
}

const panel = {
  panelClass: 'app-dialog-panel',
  backdropClass: ['cdk-overlay-backdrop', 'app-dialog-backdrop'],
};

/** Opens a CDK confirm dialog (same chrome as Reset Bracket). Resolves true only on confirm. */
export function openConfirm(dialog: Dialog, data: ConfirmDialogData) {
  return dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, { ...panel, data });
}

export async function askConfirm(dialog: Dialog, data: ConfirmDialogData): Promise<boolean> {
  const ref = openConfirm(dialog, data);
  return (await firstValueFrom(ref.closed)) === true;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog" role="alertdialog" [attr.aria-labelledby]="titleId">
      <header>
        <strong [id]="titleId" class="spacer">{{ data.title }}</strong>
        <button type="button" class="ghost" (click)="ref.close(false)" [attr.aria-label]="'common.close' | t">✕</button>
      </header>
      <div class="body stack">
        <p>{{ data.body }}</p>
        @if (data.detail) {
          <p class="muted small">{{ data.detail }}</p>
        }
      </div>
      <footer>
        <span class="spacer"></span>
        <button type="button" class="ghost" (click)="ref.close(false)">
          {{ data.cancelLabel ?? i18n.t('common.cancel') }}
        </button>
        <button
          type="button"
          [class.danger]="data.danger"
          [class.primary]="!data.danger"
          (click)="ref.close(true)"
        >
          {{ data.confirmLabel ?? i18n.t('common.ok') }}
        </button>
      </footer>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  protected readonly i18n = inject(I18nService);
  protected readonly titleId = 'confirm-dialog-title';
}
