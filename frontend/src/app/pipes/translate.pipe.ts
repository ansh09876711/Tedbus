import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform } from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslationService } from '../service/translation.service';

@Pipe({
  name: 'translate',
  pure: false // Enables instant re-evaluation upon language toggle without page reload
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  private langSubscription: Subscription;
  private lastLang: string = '';

  constructor(
    private translationService: TranslationService,
    private cdr: ChangeDetectorRef
  ) {
    // Re-render all uses of this pipe when language changes
    this.langSubscription = this.translationService.currentLang$.subscribe(lang => {
      if (lang !== this.lastLang) {
        this.lastLang = lang;
        this.cdr.markForCheck();
      }
    });
  }

  transform(key: string, params?: Record<string, any>): string {
    if (!key) return '';
    return this.translationService.translate(key, params);
  }

  ngOnDestroy(): void {
    this.langSubscription?.unsubscribe();
  }
}
