import { Component, OnInit, AfterViewInit } from '@angular/core';
declare var google: any;
import { CustomerService } from '../../service/customer.service';
import { Customer } from '../../model/customer.model';
import { Router } from '@angular/router';
import { ThemeService } from '../../service/theme.service';
import { TranslationService, SupportedLanguage } from '../../service/translation.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit, AfterViewInit {
  isloggedIn: boolean = false;
  loggedInUser: Customer | null = null;
  showAuthModal: boolean = false;
  loginName: string = '';
  loginEmail: string = '';
  loginPassword: string = '';
  isSubmittingAuth: boolean = false;
  authErrorMessage: string = '';

  // Google OAuth 2.0 Web Client ID — sourced from environment configuration
  private readonly GOOGLE_CLIENT_ID = environment.googleClientId;

  constructor(
    public router: Router, 
    private customerservice: CustomerService,
    public themeService: ThemeService,
    public translationService: TranslationService
  ) {}

  get userInitial(): string {
    const name = (this.loggedInUser?.name || this.loginName || '').trim();
    return name ? name.charAt(0).toUpperCase() : 'U';
  }

  get userDisplayName(): string {
    return (this.loggedInUser?.name || '').trim();
  }

  get isDark(): boolean {
    return this.themeService.isDark();
  }

  get currentLang(): SupportedLanguage {
    return this.translationService.currentLanguage;
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
    if (this.showAuthModal) {
      setTimeout(() => this.renderGoogleButton(), 50);
    }
  }

  toggleLanguage(): void {
    this.translationService.toggleLanguage();
  }

  setLanguage(lang: SupportedLanguage): void {
    this.translationService.setLanguage(lang);
  }

  ngOnInit(): void {
    this.syncLoggedInUserFromStorage();
    this.initGoogleAuth();
  }

  private syncLoggedInUserFromStorage(): void {
    const rawUser = sessionStorage.getItem("Loggedinuser") || localStorage.getItem("currentUser");
    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        if (parsed && (parsed.name || parsed.email || parsed._id)) {
          this.loggedInUser = parsed;
          this.isloggedIn = true;
          this.loginName = parsed.name || '';
          this.loginEmail = parsed.email || '';
          return;
        }
      } catch {
        // Ignore malformed storage entry
      }
    }
    this.loggedInUser = null;
    this.isloggedIn = false;
  }

  ngAfterViewInit(): void {
    this.initGoogleAuth();
  }

  private initGoogleAuth(): void {
    try {
      if (typeof google !== 'undefined' && google?.accounts?.id) {
        google.accounts.id.initialize({
          client_id: this.GOOGLE_CLIENT_ID,
          callback: (response: any) => {
            this.handlelogin(response);
          }
        });
      }
    } catch (e) {
      console.warn("Google Auth init failed:", e);
    }
  }

  openAuthModal(): void {
    this.showAuthModal = true;
    this.authErrorMessage = '';
    this.initGoogleAuth();
    setTimeout(() => {
      this.renderGoogleButton();
    }, 120);
  }

  closeAuthModal(): void {
    this.showAuthModal = false;
    this.authErrorMessage = '';
  }

  private renderGoogleButton(): void {
    try {
      const googleBtn = document.getElementById('google-modal-btn');
      if (googleBtn && typeof google !== 'undefined' && google?.accounts?.id) {
        googleBtn.innerHTML = '';
        google.accounts.id.renderButton(googleBtn, {
          theme: this.isDark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          width: 320,
          text: 'signin_with'
        });
      }
    } catch (e) {
      console.warn("Render google button skipped:", e);
    }
  }

  handleDirectSignIn(name?: string, email?: string, password?: string): void {
    const finalName = (name ?? this.loginName ?? '').trim();
    const finalEmail = (email ?? this.loginEmail ?? '').trim().toLowerCase();
    const finalPassword = password ?? this.loginPassword ?? '';

    if (!finalName || finalName.length < 2) {
      this.authErrorMessage = 'Please enter your full name (at least 2 characters).';
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!finalEmail || !emailRegex.test(finalEmail)) {
      this.authErrorMessage = 'Please enter a valid email address.';
      return;
    }
    if (!finalPassword || finalPassword.length < 6) {
      this.authErrorMessage = 'Please enter a password (at least 6 characters).';
      return;
    }

    this.isSubmittingAuth = true;
    this.authErrorMessage = '';

    const payload = {
      name: finalName,
      email: finalEmail,
      password: finalPassword,
      profilepicture: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(finalName)}`
    };

    this.customerservice.addcustomermongo(payload).subscribe({
      next: (res: Customer) => {
        sessionStorage.setItem("Loggedinuser", JSON.stringify(res));
        if (res.authToken) {
          sessionStorage.setItem("AuthToken", res.authToken);
        }
        this.loggedInUser = res;
        this.isloggedIn = true;
        this.loginPassword = '';
        this.isSubmittingAuth = false;
        this.showAuthModal = false;
      },
      error: (err) => {
        this.isSubmittingAuth = false;
        this.authErrorMessage = err?.error?.message || 'Invalid email or password. Please verify your credentials.';
      }
    });
  }

  private decodetoken(token: string) {
    try {
      return JSON.parse(atob(token.split(".")[1]));
    } catch {
      return null;
    }
  }

  handlelogin(response: any) {
    const payload = this.decodetoken(response?.credential);
    if (!payload) return;
    this.customerservice.addcustomermongo(payload).subscribe({
      next: (res: Customer) => {
        if (!res || !res.authToken) {
          this.authErrorMessage = 'Google sign-in requires a verified account password on this server.';
          return;
        }
        sessionStorage.setItem("Loggedinuser", JSON.stringify(res));
        sessionStorage.setItem("AuthToken", res.authToken);
        this.loggedInUser = res;
        this.loginName = res.name || payload.name || '';
        this.loginEmail = res.email || payload.email || '';
        this.isloggedIn = true;
        this.showAuthModal = false;
      },
      error: (error) => {
        console.warn('Google sign-in rejected by backend:', error?.error?.message || error?.message);
        this.authErrorMessage = error?.error?.message || 'Please sign in using your email and password.';
      }
    });
  }

  handlelogout() {
    try {
      if (typeof google !== 'undefined' && google?.accounts?.id) {
        google.accounts.id.disableAutoSelect();
      }
    } catch (e) {}
    sessionStorage.removeItem('Loggedinuser');
    sessionStorage.removeItem('AuthToken');
    localStorage.removeItem('currentUser');
    this.loggedInUser = null;
    this.loginName = '';
    this.loginEmail = '';
    this.loginPassword = '';
    this.isloggedIn = false;
    this.router.navigate(['/']);
  }

  navigate(route: string) {
    this.router.navigate([route]);
  }
}
