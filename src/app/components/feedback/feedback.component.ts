import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

export interface FeedbackItem {
  id: string;
  category: string | null;
  subCategory: string | null;
  description: string;
  translatedDescription: string | null;
  time: string;
  language: string | null;
  customerNo: string | null;
  boUserId: string;
  posneg: number | null;
  descriptiveCategory: string | null;
  shortname: string | null;
  agreementNo: string | null;
  assignedShortname: string | null;
  assignedDepartment: string | null;
  platform: string;
  // Added for translation functionality
  isTranslating?: boolean;
  generatedTranslation?: string;
}

export interface TranslationRequest {
  q: string;
  source: string;
  target: string;
  format: string;
  alternatives: number;
  api_key: string;
}

export interface TranslationResponse {
  translatedText: string;
  alternatives?: string[];
}

@Component({
  selector: "app-feedback",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./feedback.component.html",
  styleUrls: ["./feedback.component.scss"],
})
export class FeedbackComponent implements OnInit {
  feedbackList: FeedbackItem[] = [];
  isLoading = false;
  error: string | null = null;
  translatingItems: Set<string> = new Set();

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadFeedback();
  }

  loadFeedback(): void {
    this.isLoading = true;
    this.error = null;

    const fromDate = "2025-09-21";
    const toDate = "2025-10-21";
    const url = `https://int.prod.eb.danskenet.net/district/feedbackinternal/v1/feedback?from=${fromDate}&to=${toDate}&limit=500&offset=0`;

    this.http.get<FeedbackItem[]>(url).subscribe({
      next: (data) => {
        this.feedbackList = data;
        this.isLoading = false;
      },
      error: (error) => {
        this.error = "Failed to load feedback data. Please try again later.";
        this.isLoading = false;
        console.error("Error loading feedback:", error);
      },
    });
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  getPlatformIcon(platform: string): string {
    switch (platform) {
      case "district-mobile":
        return "📱";
      case "district":
        return "💻";
      case "district-one":
        return "🌐";
      default:
        return "📝";
    }
  }

  getSentimentIcon(posneg: number | null): string {
    if (posneg === null) return "❓";
    return posneg > 0 ? "😊" : "😞";
  }

  getCategoryColor(category: string | null): string {
    if (!category) return "#6c757d";

    const colors: { [key: string]: string } = {
      payments: "#007bff",
      "payments-modal": "#28a745",
      general: "#ffc107",
      default: "#6c757d",
    };

    return colors[category] || colors["default"];
  }

  trackByFeedbackId(index: number, item: FeedbackItem): string {
    return item.id;
  }

  getCountByPlatform(platform: string): number {
    return this.feedbackList.filter((item) => item.platform === platform)
      .length;
  }

  getNegativeFeedbackCount(): number {
    return this.feedbackList.filter((item) => item.posneg === 0).length;
  }

  getUntranslatedCount(): number {
    return this.feedbackList.filter((item) => 
      !item.translatedDescription && !item.generatedTranslation
    ).length;
  }

  translateFeedback(feedback: FeedbackItem): void {
    if (feedback.translatedDescription || feedback.generatedTranslation || this.translatingItems.has(feedback.id)) {
      return;
    }

    this.translatingItems.add(feedback.id);
    feedback.isTranslating = true;

    const translationRequest: TranslationRequest = {
      q: feedback.description,
      source: "auto",
      target: "en",
      format: "text",
      alternatives: 3,
      api_key: ""
    };

    this.http.post<TranslationResponse>("https://libretranslate.com/translate", translationRequest, {
      headers: { "Content-Type": "application/json" }
    }).subscribe({
      next: (response) => {
        feedback.generatedTranslation = response.translatedText;
        feedback.isTranslating = false;
        this.translatingItems.delete(feedback.id);
      },
      error: (error) => {
        console.error('Translation failed:', error);
        feedback.isTranslating = false;
        this.translatingItems.delete(feedback.id);
        
        // Set a fallback message for failed translations
        if (error.status === 0) {
          feedback.generatedTranslation = "[Translation failed: CORS or network error]";
        } else if (error.status === 429) {
          feedback.generatedTranslation = "[Translation failed: Rate limit exceeded]";
        } else {
          feedback.generatedTranslation = `[Translation failed: ${error.status || 'Unknown error'}]`;
        }
      }
    });
  }

  translateAllUntranslated(): void {
    const untranslatedItems = this.feedbackList.filter(item => 
      !item.translatedDescription && !item.generatedTranslation && !this.translatingItems.has(item.id)
    );

    untranslatedItems.forEach((item, index) => {
      // Stagger the requests to avoid overwhelming the API
      setTimeout(() => {
        this.translateFeedback(item);
      }, index * 500); // 500ms delay between requests
    });
  }

  hasTranslation(feedback: FeedbackItem): boolean {
    return !!(feedback.translatedDescription || feedback.generatedTranslation);
  }

  getTranslation(feedback: FeedbackItem): string {
    return feedback.translatedDescription || feedback.generatedTranslation || '';
  }

  isTranslating(feedback: FeedbackItem): boolean {
    return feedback.isTranslating || false;
  }

  isTranslationFailed(feedback: FeedbackItem): boolean {
    return !!(feedback.generatedTranslation && feedback.generatedTranslation.startsWith('[Translation failed'));
  }

  retryTranslation(feedback: FeedbackItem): void {
    feedback.generatedTranslation = undefined;
    this.translateFeedback(feedback);
  }
}
