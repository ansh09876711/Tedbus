import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

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

  constructor() {
    this.applyTheme(this.currentThemeSubject.value);

    // Listen for system theme preference changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (this.currentThemeSubject.value === 'system') {
          this.applyTheme('system');
        }
      });
    }
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

  setTheme(theme: ThemeMode): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.THEME_KEY, theme);
    }
    this.currentThemeSubject.next(theme);
    this.applyTheme(theme);
  }

  toggleTheme(): void {
    const nextTheme = this.isDarkSubject.value ? 'light' : 'dark';
    this.setTheme(nextTheme);
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
