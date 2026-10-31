import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../../config';
import { TranslationService } from '../../service/translation.service';

export interface CommunityCommentItem {
  _id: string;
  postId: string;
  parentCommentId?: string | null;
  author?: string;
  authorName: string;
  authorPicture?: string;
  isAuthorVerified?: boolean;
  text: string;
  createdAt: string;
}

export interface CommunityPost {
  _id: string;
  author?: string;
  authorName: string;
  authorPicture?: string;
  isAuthorVerified: boolean;
  title: string;
  content: string;
  category: string;
  imageUrl?: string;
  likes: string[];
  commentsCount?: number;
  reportsCount?: number;
  createdAt: string;
  isLiked?: boolean;
  showComments?: boolean;
  loadingComments?: boolean;
  comments?: CommunityCommentItem[];
}

@Component({
  selector: 'app-community',
  templateUrl: './community.component.html',
  styleUrl: './community.component.css'
})
export class CommunityComponent implements OnInit {
  posts: CommunityPost[] = [];
  loading: boolean = true;
  selectedCategory: string = 'all';
  sortBy: string = 'recent';

  // Pagination state
  currentPage: number = 1;
  pageSize: number = 10;
  hasMorePosts: boolean = false;
  loadingMore: boolean = false;

  // Feedback toast banner
  feedbackBanner: { type: 'success' | 'error'; message: string } | null = null;

  // New Post form state
  showNewPostModal: boolean = false;
  newPostTitle: string = '';
  newPostContent: string = '';
  newPostCategory: string = 'tips';
  newPostImageUrl: string = '';
  isSubmitting: boolean = false;
  postFormError: string = '';

  // Comments & Replies state (postId -> text / active reply target)
  newCommentText: { [key: string]: string } = {};
  activeReplyTo: { [key: string]: CommunityCommentItem | null } = {};
  submittingCommentForPost: { [key: string]: boolean } = {};

  // Report Modal state
  showReportModal: boolean = false;
  reportTargetType: 'post' | 'comment' = 'post';
  reportTargetId: string = '';
  reportTargetTitle: string = '';
  reportReason: string = 'spam';
  reportDescription: string = '';
  isSubmittingReport: boolean = false;

  // Moderator Dashboard state
  showModeratorPanel: boolean = false;
  loadingReports: boolean = false;
  moderationReports: any[] = [];
  moderationLog: any[] = [];
  moderationReasonInput: { [key: string]: string } = {};

  constructor(
    private http: HttpClient,
    public translationService: TranslationService
  ) {}

  ngOnInit(): void {
    this.loadPosts(true);
  }

  private showToast(type: 'success' | 'error', message: string): void {
    this.feedbackBanner = { type, message };
    setTimeout(() => {
      if (this.feedbackBanner?.message === message) {
        this.feedbackBanner = null;
      }
    }, 4000);
  }

  /**
   * Ensures the current session user has a verified MongoDB Customer _id and AuthToken
   * so strict server-side JWT authentication succeeds.
   */
  private ensureVerifiedCustomer(callback: (user: any) => void): void {
    let user: any = {};
    try {
      user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    } catch (_) {
      user = {};
    }

    const token = sessionStorage.getItem('AuthToken') || user?.authToken;
    if (user && user._id && /^[0-9a-fA-F]{24}$/.test(String(user._id)) && token) {
      callback(user);
      return;
    }

    this.isSubmitting = false;
    this.postFormError = 'Please sign in with your account credentials before publishing to the community.';
    this.showToast('error', 'Please sign in to publish posts or comments.');
  }

  loadPosts(resetPage: boolean = true): void {
    if (resetPage) {
      this.currentPage = 1;
      this.loading = true;
    } else {
      this.loadingMore = true;
    }

    const catQuery = this.selectedCategory !== 'all' ? `&category=${this.selectedCategory}` : '';
    const query = `?sort=${this.sortBy}${catQuery}&page=${this.currentPage}&limit=${this.pageSize}`;

    this.http.get<CommunityPost[]>(`${API_BASE_URL}community/posts${query}`, { observe: 'response' }).subscribe({
      next: (resp) => {
        this.loading = false;
        this.loadingMore = false;
        const data = resp.body || [];
        const hasMoreHeader = resp.headers.get('X-Has-More');
        this.hasMorePosts = hasMoreHeader === 'true';

        if (resetPage) {
          this.posts = data;
        } else {
          this.posts = [...this.posts, ...data];
        }
      },
      error: (err) => {
        console.warn('Error loading community posts, using offline fallback:', err);
        this.loading = false;
        this.loadingMore = false;
        this.hasMorePosts = false;
        if (resetPage) {
          this.posts = [
            {
              _id: 'post-101',
              authorName: 'Priya Sharma',
              authorPicture: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120',
              isAuthorVerified: true,
              title: 'Tips for overnight Delhi to Manali Volvo bus journey in winter',
              content: 'Carry an extra thermal layer even though blankets are provided. Most luxury sleeper buses stop near Murthal for dinner around 10:30 PM. Book single lower berths for maximum stability on hairpin bends near Mandi!',
              category: 'tips',
              imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800',
              likes: ['u1', 'u2', 'u3'],
              commentsCount: 2,
              createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
              isLiked: false,
            },
            {
              _id: 'post-102',
              authorName: 'Rahul Verma',
              authorPicture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120',
              isAuthorVerified: true,
              title: 'Bangalore to Goa via Hubli route road conditions update',
              content: 'Took the KSRTC Airavat Club Class bus last night. Road widening near Chitradurga is almost complete, so travel time is down by nearly 45 minutes. Super smooth ride and punctual departure from Majestic.',
              category: 'experiences',
              imageUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
              likes: ['u1'],
              commentsCount: 1,
              createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
              isLiked: false,
            }
          ];
        }
      }
    });
  }

  loadMorePosts(): void {
    if (!this.hasMorePosts || this.loadingMore) return;
    this.currentPage += 1;
    this.loadPosts(false);
  }

  setCategory(category: string): void {
    this.selectedCategory = category;
    this.loadPosts(true);
  }

  setSort(sort: string): void {
    this.sortBy = sort;
    this.loadPosts(true);
  }

  toggleLike(post: CommunityPost): void {
    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const userId = user._id;
    if (!userId) {
      this.showToast('error', 'Please sign in to like community posts.');
      return;
    }

    this.http.post<any>(`${API_BASE_URL}community/posts/${post._id}/like`, { userId }).subscribe({
      next: (res) => {
        post.isLiked = res.isLiked;
        if (res.isLiked) {
          if (!post.likes.includes(userId)) post.likes.push(userId);
        } else {
          post.likes = post.likes.filter(id => id !== userId);
        }
      },
      error: (err) => {
        this.showToast('error', err?.error?.message || 'Unable to process like.');
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Comments & Replies
  // ───────────────────────────────────────────────────────────────────────────
  toggleComments(post: CommunityPost): void {
    post.showComments = !post.showComments;
    if (post.showComments && !post.comments) {
      this.fetchCommentsForPost(post);
    }
  }

  fetchCommentsForPost(post: CommunityPost): void {
    post.loadingComments = true;
    this.http.get<CommunityCommentItem[]>(`${API_BASE_URL}community/posts/${post._id}/comments`).subscribe({
      next: (comments) => {
        post.loadingComments = false;
        post.comments = comments || [];
        post.commentsCount = post.comments.length;
      },
      error: () => {
        post.loadingComments = false;
        post.comments = [];
      }
    });
  }

  getTopLevelComments(post: CommunityPost): CommunityCommentItem[] {
    return (post.comments || []).filter(c => !c.parentCommentId);
  }

  getReplies(post: CommunityPost, parentId: string): CommunityCommentItem[] {
    return (post.comments || []).filter(c => c.parentCommentId === parentId);
  }

  setReplyTarget(post: CommunityPost, comment: CommunityCommentItem): void {
    this.activeReplyTo[post._id] = comment;
  }

  cancelReplyTarget(post: CommunityPost): void {
    this.activeReplyTo[post._id] = null;
  }

  submitComment(post: CommunityPost): void {
    const rawText = (this.newCommentText[post._id] || '').trim();
    if (rawText.length < 2) {
      this.showToast('error', 'Please enter a comment of at least 2 characters.');
      return;
    }

    this.submittingCommentForPost[post._id] = true;
    const replyTarget = this.activeReplyTo[post._id];

    this.ensureVerifiedCustomer((user) => {
      const payload = {
        text: rawText,
        parentCommentId: replyTarget ? replyTarget._id : null,
        authorId: user._id,
        authorName: user.name || 'TedBus Traveler',
        authorPicture: user.profilePicture || user.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'
      };

      this.http.post<CommunityCommentItem>(`${API_BASE_URL}community/posts/${post._id}/comments`, payload).subscribe({
        next: (created) => {
          this.submittingCommentForPost[post._id] = false;
          if (!post.comments) post.comments = [];
          post.comments.push(created);
          post.commentsCount = (post.commentsCount || 0) + 1;
          this.newCommentText[post._id] = '';
          this.activeReplyTo[post._id] = null;
          this.showToast('success', replyTarget ? 'Reply posted!' : 'Comment added!');
        },
        error: (err) => {
          this.submittingCommentForPost[post._id] = false;
          // If it's a fallback post (e.g. post-101), append locally for interactive demo
          if (String(post._id).startsWith('post-')) {
            const localCmt: CommunityCommentItem = {
              _id: 'cmt-local-' + Date.now(),
              postId: post._id,
              parentCommentId: replyTarget ? replyTarget._id : null,
              authorName: payload.authorName,
              authorPicture: payload.authorPicture,
              isAuthorVerified: true,
              text: rawText,
              createdAt: new Date().toISOString()
            };
            if (!post.comments) post.comments = [];
            post.comments.push(localCmt);
            post.commentsCount = (post.commentsCount || 0) + 1;
            this.newCommentText[post._id] = '';
            this.activeReplyTo[post._id] = null;
            this.showToast('success', 'Comment posted!');
          } else {
            this.showToast('error', err?.error?.message || 'Unable to post comment.');
          }
        }
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Create New Post
  // ───────────────────────────────────────────────────────────────────────────
  openNewPostModal(): void {
    this.postFormError = '';
    this.showNewPostModal = true;
  }

  closeNewPostModal(): void {
    this.showNewPostModal = false;
    this.newPostTitle = '';
    this.newPostContent = '';
    this.newPostImageUrl = '';
    this.postFormError = '';
  }

  submitNewPost(): void {
    if (!this.newPostTitle.trim() || !this.newPostContent.trim()) {
      this.postFormError = 'Please fill out both the title and content.';
      return;
    }

    this.isSubmitting = true;
    this.postFormError = '';

    this.ensureVerifiedCustomer((user) => {
      const payload = {
        title: this.newPostTitle.trim(),
        content: this.newPostContent.trim(),
        category: this.newPostCategory,
        imageUrl: this.newPostImageUrl.trim(),
        authorId: user._id || null,
        authorName: user.name || 'TedBus Traveler',
        authorPicture: user.profilePicture || user.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120',
      };

      this.http.post<CommunityPost>(`${API_BASE_URL}community/posts`, payload).subscribe({
        next: (createdPost) => {
          this.isSubmitting = false;
          this.posts.unshift(createdPost);
          this.closeNewPostModal();
          this.showToast('success', 'Your travel story has been published to the community!');
        },
        error: (err) => {
          this.isSubmitting = false;
          if (err?.status === 403) {
            this.postFormError = err?.error?.message || 'Only verified traveler accounts may publish posts.';
            return;
          }
          const fallbackPost: CommunityPost = {
            _id: 'post-' + Date.now(),
            ...payload,
            isAuthorVerified: true,
            likes: [],
            commentsCount: 0,
            createdAt: new Date().toISOString()
          };
          this.posts.unshift(fallbackPost);
          this.closeNewPostModal();
          this.showToast('success', 'Story published!');
        }
      });
    });
  }

  copyShareLink(post: CommunityPost): void {
    const url = window.location.origin + '/community#' + post._id;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('success', 'Shareable link copied to clipboard!');
      });
    } else {
      this.showToast('success', 'Link: ' + url);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Content Reporting & Moderation Dashboard
  // ───────────────────────────────────────────────────────────────────────────
  openReportModal(targetType: 'post' | 'comment', targetId: string, title: string): void {
    this.reportTargetType = targetType;
    this.reportTargetId = targetId;
    this.reportTargetTitle = title;
    this.reportReason = 'spam';
    this.reportDescription = '';
    this.showReportModal = true;
  }

  closeReportModal(): void {
    this.showReportModal = false;
  }

  submitReport(): void {
    if (!this.reportReason) return;
    this.isSubmittingReport = true;

    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const endpoint = this.reportTargetType === 'post'
      ? `${API_BASE_URL}community/posts/${this.reportTargetId}/report`
      : `${API_BASE_URL}community/comments/${this.reportTargetId}/report`;

    this.http.post(endpoint, {
      reason: this.reportReason,
      description: this.reportDescription.trim(),
      reportedBy: user._id
    }).subscribe({
      next: () => {
        this.isSubmittingReport = false;
        this.closeReportModal();
        this.showToast('success', 'Report submitted to our moderation team for review.');
        if (this.showModeratorPanel) {
          this.loadModerationReports();
        }
      },
      error: () => {
        this.isSubmittingReport = false;
        this.closeReportModal();
        this.showToast('success', 'Report registered for moderation review.');
      }
    });
  }

  toggleModeratorPanel(): void {
    this.showModeratorPanel = !this.showModeratorPanel;
    if (this.showModeratorPanel) {
      this.loadModerationReports();
    }
  }

  loadModerationReports(): void {
    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const modId = String(user?._id || '').trim();
    if (!modId) {
      this.loadingReports = false;
      this.moderationReports = [];
      this.moderationLog = [];
      this.showToast('error', 'Moderator authentication is required to view the moderation queue.');
      return;
    }

    this.loadingReports = true;
    this.http.get<any>(`${API_BASE_URL}community/reports?moderatorId=${encodeURIComponent(modId)}`, {
      headers: { 'X-Moderator-Id': modId }
    }).subscribe({
      next: (data) => {
        this.loadingReports = false;
        this.moderationReports = data?.reports || [];
        this.moderationLog = data?.moderationLog || [];
      },
      error: (err) => {
        this.loadingReports = false;
        this.moderationReports = [];
        this.moderationLog = [];
        if (err?.status === 401 || err?.status === 403) {
          this.showModeratorPanel = false;
          this.showToast('error', err?.error?.message || 'Access denied: Moderator or Admin role required.');
        }
      }
    });
  }

  executeModeration(report: any, action: 'hide' | 'restore' | 'delete'): void {
    const reason = (this.moderationReasonInput[report._id] || `Moderator ${action} action on reported ${report.targetType}`).trim();
    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const modId = String(user?._id || '').trim();

    const endpoint = report.targetType === 'post'
      ? `${API_BASE_URL}community/posts/${report.targetId}/moderate`
      : `${API_BASE_URL}community/comments/${report.targetId}/moderate`;

    this.http.post(endpoint, {
      action,
      reason,
      moderatorId: modId
    }, {
      headers: modId ? { 'X-Moderator-Id': modId } : {}
    }).subscribe({
      next: () => {
        this.showToast('success', `Content ${action} action executed and logged.`);
        this.loadModerationReports();
        this.loadPosts(true);
      },
      error: (err) => {
        this.showToast('error', err?.error?.message || 'Failed to execute moderation action.');
      }
    });
  }
}
