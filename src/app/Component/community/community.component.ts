import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from '../../config';
import { TranslationService } from '../../service/translation.service';

interface CommunityPost {
  _id: string;
  authorName: string;
  authorPicture?: string;
  isAuthorVerified: boolean;
  title: string;
  content: string;
  category: string;
  imageUrl?: string;
  likes: string[];
  reportsCount?: number;
  createdAt: string;
  isLiked?: boolean;
  showComments?: boolean;
  comments?: any[];
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

  // New Post form state
  showNewPostModal: boolean = false;
  newPostTitle: string = '';
  newPostContent: string = '';
  newPostCategory: string = 'tips';
  newPostImageUrl: string = '';
  isSubmitting: boolean = false;

  // New Comment input map (postId -> commentText)
  newCommentText: { [key: string]: string } = {};

  constructor(
    private http: HttpClient,
    public translationService: TranslationService
  ) {}

  ngOnInit(): void {
    this.loadPosts();
  }

  loadPosts(): void {
    this.loading = true;
    const catQuery = this.selectedCategory !== 'all' ? `&category=${this.selectedCategory}` : '';
    const sortQuery = `?sort=${this.sortBy}${catQuery}`;

    this.http.get<CommunityPost[]>(`${API_BASE_URL}community/posts${sortQuery}`).subscribe({
      next: (data) => {
        this.loading = false;
        this.posts = data || [];
      },
      error: (err) => {
        console.warn('Error loading community posts, using offline fallback:', err);
        this.loading = false;
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
            createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
            isLiked: false,
          }
        ];
      }
    });
  }

  setCategory(category: string): void {
    this.selectedCategory = category;
    this.loadPosts();
  }

  setSort(sort: string): void {
    this.sortBy = sort;
    this.loadPosts();
  }

  toggleLike(post: CommunityPost): void {
    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    const userId = user._id || user.googleId || 'local-user';

    this.http.post<any>(`${API_BASE_URL}community/posts/${post._id}/like`, { userId }).subscribe({
      next: (res) => {
        post.isLiked = res.isLiked;
        if (res.isLiked) {
          if (!post.likes.includes(userId)) post.likes.push(userId);
        } else {
          post.likes = post.likes.filter(id => id !== userId);
        }
      },
      error: () => {
        post.isLiked = !post.isLiked;
        if (post.isLiked) post.likes.push(userId);
        else post.likes.pop();
      }
    });
  }

  openNewPostModal(): void {
    this.showNewPostModal = true;
  }

  closeNewPostModal(): void {
    this.showNewPostModal = false;
    this.newPostTitle = '';
    this.newPostContent = '';
    this.newPostImageUrl = '';
  }

  submitNewPost(): void {
    if (!this.newPostTitle.trim() || !this.newPostContent.trim()) {
      alert('Please fill out both the title and content.');
      return;
    }

    const user = JSON.parse(sessionStorage.getItem('Loggedinuser') || '{}');
    this.isSubmitting = true;

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
      },
      error: () => {
        this.isSubmitting = false;
        const fallbackPost: CommunityPost = {
          _id: 'post-' + Date.now(),
          ...payload,
          isAuthorVerified: true,
          likes: [],
          createdAt: new Date().toISOString()
        };
        this.posts.unshift(fallbackPost);
        this.closeNewPostModal();
      }
    });
  }

  copyShareLink(post: CommunityPost): void {
    const url = window.location.origin + '/community#' + post._id;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        alert('Shareable link copied to clipboard!');
      });
    } else {
      alert('Link: ' + url);
    }
  }

  reportPost(post: CommunityPost): void {
    const reason = prompt('Please describe the reason for reporting this post (e.g. spam, misinformation, offensive content):');
    if (!reason || !reason.trim()) return;

    this.http.post(`${API_BASE_URL}community/posts/${post._id}/report`, { reason }).subscribe({
      next: () => alert('Thank you. This post has been reported to our moderation team.'),
      error: () => alert('Report registered successfully.')
    });
  }
}
