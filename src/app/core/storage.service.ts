import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/** Key/value storage: native SharedPreferences on Android, localStorage on the web. */
@Injectable({ providedIn: 'root' })
export class StorageService {
  async get(key: string): Promise<string | null> {
    return (await Preferences.get({ key })).value;
  }

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}
