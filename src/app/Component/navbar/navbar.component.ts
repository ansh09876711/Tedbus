import { Component, OnInit, AfterViewInit } from '@angular/core';
declare var google: any;
import { CustomerService } from '../../service/customer.service';
import { Customer } from '../../model/customer.model';
import { Router } from '@angular/router';
import { ThemeService } from '../../service/theme.service';
import { TranslationService, SupportedLanguage } from '../../service/translation.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent implements OnInit, AfterViewInit {
  isloggedIn: boolean = false;
  showAuthModal: boolean = false;
  loginName: string = 'Ansh Agarwal';
  loginEmail: string = 'anshagarwal590@gmail.com';
  isSubmittingAuth: boolean = false;
  authErrorMessage: string = '';

  // Google OAuth 2.0 Web Client ID
  private readonly GOOGLE_CLIENT_ID = "516929954818-jr4ns8vssalh676heifk40dek11pjoer.apps.googleusercontent.com";

  constructor(
    public router: Router, 
    private customerservice: CustomerService,
    public themeService: ThemeService,
    public translationService: TranslationService
  ) {}

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
    if (sessionStorage.getItem("Loggedinuser")) {
      this.isloggedIn = true;
    } else {
      this.isloggedIn = false;
    }

    this.initGoogleAuth();
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

  handleDirectSignIn(name?: string, email?: string): void {
    const finalName = (name || this.loginName || 'Traveler').trim();
    const finalEmail = (email || this.loginEmail || 'traveler@tedbus.com').trim();

    this.isSubmittingAuth = true;
    this.authErrorMessage = '';

    const payload = {
      name: finalName,
      email: finalEmail,
      googleId: 'tedbus-' + Date.now(),
      profilepicture: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(finalName)}`
    };

    this.customerservice.addcustomermongo(payload).subscribe({
      next: (res) => {
        sessionStorage.setItem("Loggedinuser", JSON.stringify(res));
        this.isloggedIn = true;
        this.isSubmittingAuth = false;
        this.showAuthModal = false;
      },
      error: (err) => {
        console.warn("Backend auth response fallback:", err);
        sessionStorage.setItem("Loggedinuser", JSON.stringify(payload));
        this.isloggedIn = true;
        this.isSubmittingAuth = false;
        this.showAuthModal = false;
      }
    });
  }

  handleDemoLogin(): void {
    this.handleDirectSignIn('Ansh Agarwal', 'anshagarwal590@gmail.com');
  }

  private decodetoken(token: string) {
    try {
      return JSON.parse(atob(token.split(".")[1]));
    } catch {
      return null;
    }
  }

  handlelogin(response: any) {
    const payload = this.decodetoken(response.credential);
    if (!payload) return;
    this.customerservice.addcustomermongo(payload).subscribe({
      next: (res) => {
        console.log('POST success', res);
        sessionStorage.setItem("Loggedinuser", JSON.stringify(res));
        this.isloggedIn = true;
        this.showAuthModal = false;
      },
      error: (error) => {
        console.error('Post request failed', error);
        // Fallback store decoded token payload so user is never locked out
        const fallbackUser = {
          name: payload.name,
          email: payload.email,
          googleId: payload.sub,
          profilePicture: payload.picture
        };
        sessionStorage.setItem("Loggedinuser", JSON.stringify(fallbackUser));
        this.isloggedIn = true;
        this.showAuthModal = false;
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
    this.isloggedIn = false;
    this.router.navigate(['/']);
  }

  navigate(route: string) {
    this.router.navigate([route]);
  }
}
