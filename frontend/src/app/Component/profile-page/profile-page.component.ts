import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../../config';
import { ThemeService, ThemeMode } from '../../service/theme.service';
import { TranslationService, SupportedLanguage } from '../../service/translation.service';

interface UserNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

interface NotificationPrefs {
  email: boolean;
  push: boolean;
  inApp: boolean;
  promotional: boolean;
}

@Component({
  selector: 'app-profile-page',
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.css'
})
export class ProfilePageComponent implements OnInit {
  activeTab: string = 'trips';
  user: any = null;
  walletBalance: number | null = null;
  walletTransactions: any[] = [];

  // Notifications
  notifications: UserNotification[] = [];
  loadingNotifications: boolean = false;
  notificationPrefs: NotificationPrefs = {
    email: true,
    push: true,
    inApp: true,
    promotional: false
  };

  filterUnreadOnly: boolean = false;

  // Community Activity
  loadingCommunity: boolean = false;
  communityActivity: {
    authoredPosts: any[];
    likedPosts: any[];
    comments: any[];
    stats: { postsCount: number; likesGivenCount: number; commentsCount: number };
  } = {
    authoredPosts: [],
    likedPosts: [],
    comments: [],
    stats: { postsCount: 0, likesGivenCount: 0, commentsCount: 0 }
  };

  get unreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  get displayedNotifications(): UserNotification[] {
    if (this.filterUnreadOnly) {
      return this.notifications.filter(n => !n.read);
    }
    return this.notifications;
  }

  constructor(
    private http: HttpClient,
    public themeService: ThemeService,
    public translationService: TranslationService
  ) {}


  ngOnInit(): void {
    const sessionUser = sessionStorage.getItem('Loggedinuser');
    if (sessionUser) {
      try {
        this.user = JSON.parse(sessionUser);
      } catch (e) {
        this.user = null;
      }
    }

    if (!this.user) {
      const storedUser = localStorage.getItem('currentUser');
      if (storedUser) {
        try {
          this.user = JSON.parse(storedUser);
        } catch (e) {
          this.user = null;
        }
      }
    }

    if (!this.user) {
      this.user = {
        _id: 'user-demo-123',
        name: 'Demo Passenger',
        email: 'passenger@tedbus.com',
        phone: '+91 98765 43210',
        gender: 'Male',
        picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        isVerified: true
      };
    } else if (this.user._id || this.user.email) {
      this.loadCustomerProfile();
    }

    this.loadNotifications();
  }

  loadCustomerProfile(): void {
    const id = this.user._id || this.user.email;
    this.http.get<any>(`${API_BASE_URL}customer/${id}`).subscribe({
      next: (profile) => {
        if (profile) {
          if (profile.themePreference) {
            this.themeService.setTheme(profile.themePreference);
          }
          if (profile.languagePreference) {
            this.translationService.setLanguage(profile.languagePreference);
          }
          if (profile.notificationPreferences) {
            this.notificationPrefs = { ...this.notificationPrefs, ...profile.notificationPreferences };
          }
          if (typeof profile.walletBalance === 'number') {
            this.walletBalance = profile.walletBalance;
          }
          if (Array.isArray(profile.walletTransactions)) {
            this.walletTransactions = profile.walletTransactions;
          }
        }
      },
      error: () => {}
    });
  }


  setTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'notifications') {
      this.loadNotifications();
    } else if (tab === 'community') {
      this.loadCommunityActivity();
    }
  }

  loadCommunityActivity(): void {
    this.loadingCommunity = true;
    const customerId = this.user?._id || '';
    this.http.get<any>(`${API_BASE_URL}community/user/${customerId}`).subscribe({
      next: (data) => {
        this.loadingCommunity = false;
        if (data) {
          this.communityActivity = {
            authoredPosts: data.authoredPosts || [],
            likedPosts: data.likedPosts || [],
            comments: data.comments || [],
            stats: data.stats || { postsCount: 0, likesGivenCount: 0, commentsCount: 0 }
          };
        }
      },
      error: () => {
        this.loadingCommunity = false;
      }
    });
  }

  loadNotifications(): void {
    this.loadingNotifications = true;
    const customerId = this.user?._id || '';

    this.http.get<UserNotification[]>(`${API_BASE_URL}notifications?customerId=${customerId}`).subscribe({
      next: (data) => {
        this.loadingNotifications = false;
        this.notifications = data || [];
        this.dispatchBrowserPushForUnread();
      },
      error: () => {
        this.loadingNotifications = false;
        this.notifications = [
          {
            _id: 'notif-1',
            type: 'booking_confirmed',
            title: 'Booking Confirmed #TB-789412',
            message: 'Your journey from Delhi to Jaipur is confirmed. Safe travels with TedBus!',
            link: '/profile',
            read: false,
            createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          },
          {
            _id: 'notif-2',
            type: 'departure_reminder',
            title: 'Boarding Gate Reminder',
            message: 'Bus leaves from Bay #4. Please arrive 15 minutes prior to scheduled departure.',
            link: '/profile',
            read: true,
            createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          }
        ];
      }
    });
  }

  private dispatchBrowserPushForUnread(): void {
    if (!this.notificationPrefs.push || typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }
    if (Notification.permission === 'granted') {
      const latestUnread = this.notifications.find(n => !n.read && n._id && !n._id.startsWith('notif-'));
      if (latestUnread) {
        const shownKey = `tedbus_push_shown_${latestUnread._id}`;
        if (!sessionStorage.getItem(shownKey)) {
          try {
            new Notification(latestUnread.title, { body: latestUnread.message });
            sessionStorage.setItem(shownKey, '1');
          } catch (_) {}
        }
      }
    }
  }

  markAsRead(item: UserNotification): void {
    item.read = true;
    this.http.put(`${API_BASE_URL}notifications/${item._id}/read`, {}).subscribe();
  }

  markAllAsRead(): void {
    this.notifications.forEach(n => n.read = true);
    this.http.post(`${API_BASE_URL}notifications/mark-all-read`, { customerId: this.user?._id }).subscribe();
  }

  updatePref(channel: keyof NotificationPrefs): void {
    this.notificationPrefs[channel] = !this.notificationPrefs[channel];
    if (channel === 'push' && this.notificationPrefs.push && typeof window !== 'undefined') {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw-push.js').catch(() => {});
      }
    }
    if (this.user?._id) {
      this.http.put(`${API_BASE_URL}notifications/preferences/${this.user._id}`, this.notificationPrefs).subscribe();
    }
  }

  onThemeChange(theme: ThemeMode): void {
    this.themeService.setTheme(theme);
  }

  onLanguageChange(lang: SupportedLanguage): void {
    this.translationService.setLanguage(lang);
  }
}
