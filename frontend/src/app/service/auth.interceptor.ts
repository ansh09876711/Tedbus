import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest< any >, next: HttpHandler): Observable<HttpEvent< any >> {
    const token = this.getStoredToken();
    if (token && !req.headers.has('Authorization')) {
      const authenticatedReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
      return next.handle(authenticatedReq);
    }
    return next.handle(req);
  }

  private getStoredToken(): string | null {
    try {
      const directToken = sessionStorage.getItem('AuthToken');
      if (directToken && directToken.trim()) {
        return directToken.trim();
      }
      const rawUser = sessionStorage.getItem('Loggedinuser');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed && typeof parsed.authToken === 'string' && parsed.authToken.trim()) {
          return parsed.authToken.trim();
        }
      }
    } catch {
      // Ignore storage access errors
    }
    return null;
  }
}

