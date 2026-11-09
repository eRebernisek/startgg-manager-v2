import { Injectable, inject, signal } from '@angular/core';
import { StorageService } from '../storage.service';
import { en, type I18nKey } from './en';
import { pt } from './pt';

export type AppLang = 'en' | 'pt';

const LANG_KEY = 'lang';

const DICTS: Record<AppLang, Record<I18nKey, string>> = { en, pt };

/** Brazil time zones used to pick PT when the browser language is not Portuguese. */
const BRAZIL_TIMEZONES = new Set([
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Bahia',
  'America/Maceio',
  'America/Araguaina',
  'America/Cuiaba',
  'America/Campo_Grande',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Rio_Branco',
  'America/Noronha',
]);

export type TranslateFn = (key: I18nKey, params?: Record<string, string | number>) => string;

/** Detects preferred language without asking for permission. */
export function detectLang(
  saved: string | null,
  languages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages : [],
  timeZone: string = safeTimeZone(),
): AppLang {
  if (saved === 'en' || saved === 'pt') return saved;
  if (languages.some((l) => l.toLowerCase().startsWith('pt'))) return 'pt';
  if (BRAZIL_TIMEZONES.has(timeZone)) return 'pt';
  return 'en';
}

function safeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** English-only translate for pure helpers / specs that do not inject {@link I18nService}. */
export const translateEn: TranslateFn = (key, params) => interpolate(en[key], params);

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly storage = inject(StorageService);
  readonly lang = signal<AppLang>('en');

  /** Load saved language (or detect) before first paint. */
  async load(): Promise<void> {
    const saved = await this.storage.get(LANG_KEY);
    this.apply(detectLang(saved));
  }

  t(key: I18nKey, params?: Record<string, string | number>): string {
    const dict = DICTS[this.lang()];
    const template = dict[key] ?? en[key] ?? String(key);
    return interpolate(template, params);
  }

  async setLang(lang: AppLang): Promise<void> {
    this.apply(lang);
    await this.storage.set(LANG_KEY, lang);
  }

  /** Locale tag for `toLocaleDateString` / similar. */
  locale(): string {
    return this.lang() === 'pt' ? 'pt-BR' : 'en-US';
  }

  private apply(lang: AppLang): void {
    this.lang.set(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    }
  }
}
