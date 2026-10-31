import { Component, Input, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../../../../../config';

interface ReviewItem {
  _id: string;
  authorName: string;
  rating: number;
  reviewText: string;
  helpfulVotes: string[];
  isVerifiedJourney: boolean;
  isTrustedReviewer?: boolean;
  canEdit?: boolean;
  editLocksAt?: string;
  createdAt: string;
  customerId?: string;
}

@Component({
  selector: 'app-bottom-tab',
  templateUrl: './bottom-tab.component.html',
  styleUrl: './bottom-tab.component.css'
})
export class BottomTabComponent implements OnInit {
  @Input() filledseats: any[] = [];
  @Input() seatprice: number = 0;
  @Input() routedetials: any;
  @Input() busarrivaltime: number = 0;
  @Input() busdeparturetime: number = 0;
  @Input() operatorname: string = '';
  @Input() busid: string | undefined = '';

  tabstate: boolean[] = [false, false, false, false, false];

  reviews: ReviewItem[] = [];
  averageRating: number = 4.5;
  totalReviews: number = 2;
  loadingReviews: boolean = false;

  // Write review form
  showReviewForm: boolean = false;
  newReviewRating: number = 5;
  newReviewText: string = '';
  isSubmittingReview: boolean = false;
  eligibleBookingId: string | null = null;

  // Edit review state
  editingReview: ReviewItem | null = null;
  editRating: number = 5;
  editText: string = '';
  isSubmittingEdit: boolean = false;

  // Report review state
  reportingReviewId: string | null = null;
  reportReason: string = 'spam';
  reportDescription: string = '';
  isSubmittingReport: boolean = false;
  reportReasons = [
    { value: 'spam', label: 'Spam or advertising' },
    { value: 'offensive', label: 'Offensive or hateful content' },
    { value: 'fake', label: 'Fake or misleading review' },
    { value: 'irrelevant', label: 'Irrelevant or off-topic' },
    { value: 'other', label: 'Other' }
  ];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {}

  handletabstate(value: number): void {
    for (let i = 0; i < this.tabstate.length; i++) {
      this.tabstate[i] = (i === value && !this.tabstate[i]);
    }
    if (value === 2 && this.tabstate[2] && this.reviews.length === 0) {
      this.loadReviews();
    }
  }

  loadReviews(): void {
    this.loadingReviews = true;
    this.http.get<any>(`${API_BASE_URL}reviews`).subscribe({
      next: (data) => {
        this.loadingReviews = false;
        this.reviews = data?.reviews || [];
        this.averageRating = data?.averageRating || 4.5;
        this.totalReviews = data?.totalReviews || this.reviews.length;
      },
      error: () => {
        this.loadingReviews = false;
        // Fallback reviews
        this.reviews = [
          {
            _id: 'rev-1',
            authorName: 'Vikram Mehta',
            rating: 5,
            reviewText: 'Exceptional journey on the Volvo Multi-Axle sleeper. Punctual departure from Kashmiri Gate and arrived on schedule. Blankets were freshly sealed and AC temperature was comfortable throughout.',
            helpfulVotes: ['user-1', 'user-2', 'user-3'],
            isVerifiedJourney: true,
            isTrustedReviewer: true,
            canEdit: false,
            createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
          },
          {
            _id: 'rev-2',
            authorName: 'Kavita Rao',
            rating: 4,
            reviewText: 'Great driving with zero harsh braking on mountain roads. Charging ports at each berth worked perfectly. Rest stop for dinner was clean and had decent food options.',
            helpfulVotes: ['user-3'],
            isVerifiedJourney: true,
            isTrustedReviewer: false,
            canEdit: false,
            createdAt: new Date(Date.now() - 3600000 * 96).toISOString(),
          }
        ];
      }
    });
  }

  /** Check DB eligibility and open review form if eligible */
  openReviewForm(): void {
    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const customerId = user._id || user.id || null;

    if (!customerId) {
      alert('Please sign in to write a verified journey review. Only passengers with a confirmed booking can leave reviews.');
      return;
    }

    // Check eligibility via DB API
    this.http.get<any>(`${API_BASE_URL}reviews/eligibility?customerId=${customerId}`).subscribe({
      next: (res) => {
        if (res.eligible) {
          this.eligibleBookingId = res.bookingId || null;
          this.showReviewForm = true;
        } else {
          alert(`Cannot write a review: ${res.reason || 'No eligible completed booking found.'}`);
        }
      },
      error: () => {
        // Fallback: allow if user has local trips
        const localTrips = JSON.parse(localStorage.getItem('my_trips') || '[]');
        if (localTrips.length > 0) {
          this.eligibleBookingId = localTrips[0]?._id || null;
          this.showReviewForm = true;
        } else {
          alert('Could not verify booking eligibility. Please ensure you have a confirmed booking before submitting a review.');
        }
      }
    });
  }

  submitReview(): void {
    if (this.newReviewText.trim().length < 20) {
      alert('Review text must be at least 20 characters long.');
      return;
    }

    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const localTrips = JSON.parse(localStorage.getItem('my_trips') || '[]');
    const bookingId = this.eligibleBookingId || localTrips[0]?._id || null;

    if (!bookingId) {
      alert('No confirmed booking found to associate with this review.');
      return;
    }

    const payload = {
      bookingId,
      customerId: user._id || user.id || null,
      authorName: user.name || 'Verified Traveler',
      rating: this.newReviewRating,
      reviewText: this.newReviewText.trim(),
      routeId: this.routedetials?._id || null,
      busId: this.busid || null,
    };

    this.isSubmittingReview = true;
    this.http.post<ReviewItem>(`${API_BASE_URL}reviews`, payload).subscribe({
      next: (created) => {
        this.isSubmittingReview = false;
        this.reviews.unshift(created);
        this.totalReviews++;
        this.showReviewForm = false;
        this.newReviewText = '';
        this.newReviewRating = 5;
        this.eligibleBookingId = null;
        alert('Thank you! Your verified journey review has been published.');
      },
      error: (err) => {
        this.isSubmittingReview = false;
        const msg = err.error?.message || err.error?.error || 'Failed to submit review. Please try again.';
        alert(msg);
      }
    });
  }

  /** Open edit form for a review (only within 24-hour window) */
  openEditReview(review: ReviewItem): void {
    if (!review.canEdit) {
      alert('The 24-hour edit window for this review has expired. Reviews are locked after 24 hours.');
      return;
    }
    this.editingReview = review;
    this.editRating = review.rating;
    this.editText = review.reviewText;
  }

  cancelEdit(): void {
    this.editingReview = null;
    this.editText = '';
    this.editRating = 5;
  }

  submitEdit(): void {
    if (!this.editingReview) return;
    if (this.editText.trim().length < 20) {
      alert('Review text must be at least 20 characters long.');
      return;
    }

    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const payload = {
      customerId: user._id || user.id || null,
      rating: this.editRating,
      reviewText: this.editText.trim()
    };

    this.isSubmittingEdit = true;
    this.http.put<ReviewItem>(`${API_BASE_URL}reviews/${this.editingReview._id}`, payload).subscribe({
      next: (updated) => {
        this.isSubmittingEdit = false;
        const idx = this.reviews.findIndex(r => r._id === this.editingReview!._id);
        if (idx !== -1) {
          this.reviews[idx] = updated;
        }
        this.editingReview = null;
        alert('Your review has been updated successfully.');
      },
      error: (err) => {
        this.isSubmittingEdit = false;
        const msg = err.error?.message || err.error?.error || 'Failed to update review.';
        alert(msg);
      }
    });
  }

  /** Get time remaining in edit window */
  getEditTimeRemaining(review: ReviewItem): string {
    if (!review.editLocksAt) return '';
    const remaining = new Date(review.editLocksAt).getTime() - Date.now();
    if (remaining <= 0) return 'Locked';
    const hours = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  }

  /** Open report modal */
  openReport(reviewId: string): void {
    this.reportingReviewId = reviewId;
    this.reportReason = 'spam';
    this.reportDescription = '';
  }

  cancelReport(): void {
    this.reportingReviewId = null;
  }

  submitReport(): void {
    if (!this.reportingReviewId) return;
    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const reportedBy = user._id || user.id;
    if (!reportedBy) {
      alert('Please sign in to report a review.');
      return;
    }

    const payload = {
      reportedBy,
      reason: this.reportReason,
      description: this.reportDescription
    };

    this.isSubmittingReport = true;
    this.http.post<any>(`${API_BASE_URL}reviews/${this.reportingReviewId}/report`, payload).subscribe({
      next: (res) => {
        this.isSubmittingReport = false;
        this.reportingReviewId = null;
        alert(res.message || 'Review reported successfully.');
      },
      error: (err) => {
        this.isSubmittingReport = false;
        const msg = err.error?.message || err.error?.error || 'Failed to report review.';
        alert(msg);
        this.reportingReviewId = null;
      }
    });
  }

  voteHelpful(review: ReviewItem): void {
    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const userId = user._id || user.id;
    if (!userId) {
      alert('Please sign in to vote on reviews.');
      return;
    }

    this.http.post<any>(`${API_BASE_URL}reviews/${review._id}/helpful`, { userId }).subscribe({
      next: (res) => {
        if (!review.helpfulVotes.includes(userId)) {
          review.helpfulVotes.push(userId);
          if (review.helpfulVotes.length >= 3) {
            review.isTrustedReviewer = true;
          }
        }
      },
      error: () => {
        if (!review.helpfulVotes.includes(userId)) {
          review.helpfulVotes.push(userId);
        }
      }
    });
  }
}

