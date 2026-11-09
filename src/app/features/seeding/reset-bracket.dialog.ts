import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ResetSummary } from '../../core/bracket-reset';
import { I18nService } from '../../core/i18n/i18n.service';
import { TPipe } from '../../core/i18n/t.pipe';

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
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog" role="alertdialog" aria-labelledby="reset-title">
      <header>
        <strong id="reset-title" class="spacer">{{ 'seeding.resetTitle' | t }}</strong>
        <button class="ghost" (click)="ref.close(false)" [attr.aria-label]="'common.close' | t">✕</button>
      </header>
      <div class="body stack">
        <p>{{ body() }}</p>
        <p class="muted small">{{ 'seeding.resetHint' | t: { total: data.total } }}</p>
      </div>
      <footer>
        <span class="spacer"></span>
        <button type="button" class="ghost" (click)="ref.close(false)">{{ 'common.cancel' | t }}</button>
        <button type="button" class="danger" (click)="ref.close(true)">{{ 'seeding.resetConfirm' | t }}</button>
      </footer>
    </div>
  `,
})
export class ResetBracketDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<ResetBracketData>(DIALOG_DATA);
  private readonly i18n = inject(I18nService);

  protected readonly body = computed(() => {
    this.i18n.lang();
    const d = this.data;
    if (!d.reported && !d.inProgress) {
      return this.i18n.t('seeding.resetBodyClean', { phase: d.phaseName });
    }
    const reportedSets = this.i18n.t(d.reported === 1 ? 'seeding.set' : 'seeding.sets');
    const inProgressPart =
      d.inProgress > 0
        ? this.i18n.t('seeding.resetInProgressPart', {
            n: d.inProgress,
            sets: this.i18n.t(d.inProgress === 1 ? 'seeding.set' : 'seeding.sets'),
          })
        : '';
    return this.i18n.t('seeding.resetBodyReported', {
      reported: d.reported,
      reportedSets,
      inProgressPart,
      phase: d.phaseName,
    });
  });
}
