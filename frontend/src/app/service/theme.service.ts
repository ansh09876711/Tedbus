import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { API_BASE_URL } from '../config';

export type ThemeMode = 'light' | 'dark' | 'system';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'tedbus_theme';
  private currentThemeSubject = new BehaviorSubject<ThemeMode>(this.getInitialTheme());
  currentTheme$: Observable<ThemeMode> = this.currentThemeSubject.asObservable();
  get theme$(): Observable<ThemeMode> {
    return this.currentTheme$;
  }

  private isDarkSubject = new BehaviorSubject<boolean>(this.checkIfDark(this.getInitialTheme()));
  isDark$: Observable<boolean> = this.isDarkSubject.asObservable();

  constructor(private http: HttpClient) {
    this.applyTheme(this.currentThemeSubject.value);

    // Listen for system theme preference changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (this.currentThemeSubject.value === 'system') {
          this.applyTheme('system');
        }
      });
    }

    // Initial sync with logged-in user if available
    this.checkAndSyncUserTheme();
  }

  private getInitialTheme(): ThemeMode {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(this.THEME_KEY) as ThemeMode;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    }
    return 'system';
  }

  private checkIfDark(theme: ThemeMode): boolean {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  }

  /**
   * Sets the theme preference.
   * Persists to localStorage for guests, and sends an update to MongoDB for authenticated users.
   */
  setTheme(theme: ThemeMode): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.THEME_KEY, theme);
    }
    this.currentThemeSubject.next(theme);
    this.applyTheme(theme);
    this.persistToBackend(theme);
  }

  toggleTheme(): void {
    const nextTheme = this.isDarkSubject.value ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  private persistToBackend(theme: ThemeMode): void {
    try {
      const userStr = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('Loggedinuser')) ||
                      (typeof localStorage !== 'undefined' && localStorage.getItem('currentUser'));
      if (userStr) {
        const user = JSON.parse(userStr);
        const userId = user._id || user.email || user.googleId;
        if (userId) {
          this.http.put(`${API_BASE_URL}customer/${userId}/preferences`, { themePreference: theme }).subscribe({
            next: () => {},
            error: (err) => console.warn('Could not sync theme preference with backend:', err?.message)
          });
        }
      }
    } catch (e) {}
  }

  private checkAndSyncUserTheme(): void {
    try {
      const userStr = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('Loggedinuser');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.themePreference && (user.themePreference === 'light' || user.themePreference === 'dark' || user.themePreference === 'system')) {
          this.setTheme(user.themePreference);
        }
      }
    } catch (e) {}
  }

  isDark(): boolean {
    return this.isDarkSubject.value;
  }

  private applyTheme(theme: ThemeMode): void {
    const isDark = this.checkIfDark(theme);
    this.isDarkSubject.next(isDark);

    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      const body = document.body;

      if (isDark) {
        root.classList.add('dark');
        body?.classList.add('dark');
      } else {
        root.classList.remove('dark');
        body?.classList.remove('dark');
      }
    }
  }
}
