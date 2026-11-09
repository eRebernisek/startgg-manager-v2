import { TestBed } from '@angular/core/testing';
import { StorageService } from '../storage.service';
import { detectLang, I18nService } from './i18n.service';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}

describe('detectLang', () => {
  it('prefers the saved language', () => {
    expect(detectLang('pt', ['en-US'], 'America/New_York')).toBe('pt');
    expect(detectLang('en', ['pt-BR'], 'America/Sao_Paulo')).toBe('en');
  });

  it('uses navigator languages starting with pt', () => {
    expect(detectLang(null, ['pt-BR', 'en'], 'America/New_York')).toBe('pt');
    expect(detectLang(null, ['en-US', 'pt'], 'UTC')).toBe('pt');
  });

  it('falls back to Brazil time zones, then English', () => {
    expect(detectLang(null, ['en-US'], 'America/Sao_Paulo')).toBe('pt');
    expect(detectLang(null, ['en-US'], 'America/Manaus')).toBe('pt');
    expect(detectLang(null, ['en-US'], 'America/New_York')).toBe('en');
  });
});

describe('I18nService', () => {
  let storage: MemoryStorage;
  let i18n: I18nService;

  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [{ provide: StorageService, useValue: storage }, I18nService],
    });
    i18n = TestBed.inject(I18nService);
  });

  it('loads the saved language and sets document.lang', async () => {
    await storage.set('lang', 'pt');
    await i18n.load();
    expect(i18n.lang()).toBe('pt');
    expect(document.documentElement.lang).toBe('pt-BR');
  });

  it('persists setLang and interpolates params', async () => {
    await i18n.setLang('pt');
    expect(await storage.get('lang')).toBe('pt');
    expect(i18n.t('tournament.entrantsCount', { n: 12 })).toBe('12 inscritos');
    expect(i18n.t('settings.signedIn', { name: 'Many' })).toBe('Conectado como Many');
  });

  it('falls back to the English string for known keys', async () => {
    await i18n.setLang('en');
    expect(i18n.t('nav.settings')).toBe('Settings');
  });
});
