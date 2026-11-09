import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nKey } from './en';
import { I18nService } from './i18n.service';

/** Impure so templates update when {@link I18nService.lang} changes. */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: I18nKey | string, params?: Record<string, string | number>): string {
    // Read the signal so change detection re-runs this impure pipe when language changes.
    this.i18n.lang();
    return this.i18n.t(key as I18nKey, params);
  }
}
