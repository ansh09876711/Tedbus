import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { enTranslations } from '../i18n/en';
import { hiTranslations } from '../i18n/hi';
import { API_BASE_URL } from '../config';

export type SupportedLanguage = 'en' | 'hi';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private readonly LANG_KEY = 'tedbus_lang';
  private currentLangSubject = new BehaviorSubject<SupportedLanguage>(this.getInitialLanguage());
  currentLang$: Observable<SupportedLanguage> = this.currentLangSubject.asObservable();
  get language$(): Observable<SupportedLanguage> {
    return this.currentLang$;
  }

  private translations: Record<SupportedLanguage, Record<string, string>> = {
    en: enTranslations,
    hi: hiTranslations
  };

  constructor(private http: HttpClient) {
    this.applyLanguage(this.currentLangSubject.value);
    this.checkAndSyncUserLanguage();
  }

  private getInitialLanguage(): SupportedLanguage {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(this.LANG_KEY) as SupportedLanguage;
      if (saved === 'en' || saved === 'hi') {
        return saved;
      }
    }
    return 'en';
  }

  get currentLanguage(): SupportedLanguage {
    return this.currentLangSubject.value;
  }

  setLanguage(lang: SupportedLanguage): void {
    if (lang !== 'en' && lang !== 'hi') return;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.LANG_KEY, lang);
    }
    this.currentLangSubject.next(lang);
    this.applyLanguage(lang);
    this.persistToBackend(lang);
  }

  toggleLanguage(): void {
    const nextLang: SupportedLanguage = this.currentLangSubject.value === 'en' ? 'hi' : 'en';
    this.setLanguage(nextLang);
  }

  private persistToBackend(lang: SupportedLanguage): void {
    try {
      const userStr = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('Loggedinuser')) ||
                      (typeof localStorage !== 'undefined' && localStorage.getItem('currentUser'));
      if (userStr) {
        const user = JSON.parse(userStr);
        const userId = user._id || user.email || user.googleId;
        if (userId) {
          this.http.put(`${API_BASE_URL}customer/${userId}/preferences`, { languagePreference: lang }).subscribe({
            next: () => {},
            error: (err) => console.warn('Could not sync language preference with backend:', err?.message)
          });
        }
      }
    } catch (e) {}
  }

  private checkAndSyncUserLanguage(): void {
    try {
      const userStr = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('Loggedinuser');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.languagePreference && (user.languagePreference === 'en' || user.languagePreference === 'hi')) {
          this.setLanguage(user.languagePreference);
        }
      }
    } catch (e) {}
  }


  translate(key: string, params?: Record<string, any>): string {
    const lang = this.currentLangSubject.value;
    let text = this.translations[lang]?.[key] || this.translations['en']?.[key] || key;

    if (params) {
      Object.keys(params).forEach(param => {
        text = text.replace(new RegExp(`{{${param}}}`, 'g'), String(params[param]));
      });
    }

    return text;
  }

  private applyLanguage(lang: SupportedLanguage): void {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }
}
