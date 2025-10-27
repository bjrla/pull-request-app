import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  PullRequest,
  PullRequestSuggestion,
} from "../../azure-devops/azure-devops.service";
import { RepositoryColorService } from "../../services/repository-color.service";
import { PinnedAuthorsService } from "../../services/pinned-authors.service";

export interface ProjectSummary {
  project: string;
  count: number;
  suggestions?: PullRequestSuggestion[];
}

@Component({
  selector: "app-pull-request-summary",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./pull-request-summary.component.html",
  styleUrl: "./pull-request-summary.component.scss",
})
export class PullRequestSummaryComponent {
  @Input() pullRequests: PullRequest[] = [];
  @Input() filteredPullRequests: PullRequest[] = [];
  @Input() selectedRepositories: Set<string> = new Set();
  @Input() selectedAuthors: Set<string> = new Set();
  @Input() uniqueAuthors: string[] = [];
  @Input() isLoading = false;
  @Input() projectSummary: ProjectSummary[] = [];
  @Input() suggestions: PullRequestSuggestion[] = [];
  @Input() showDrafts = false;
  @Input() draftCount = 0;
  @Input() regularCount = 0;
  @Input() pinnedAuthors: Set<string> = new Set();
  @Input() selectedPRs: PullRequest[] = [];

  @Output() refreshRequested = new EventEmitter<void>();
  @Output() repositoryFilterChanged = new EventEmitter<string>();
  @Output() authorFilterChanged = new EventEmitter<string>();
  @Output() filterCleared = new EventEmitter<void>();
  @Output() myPullRequestsRequested = new EventEmitter<string>();
  @Output() createPRRequested = new EventEmitter<string>();
  @Output() draftsToggled = new EventEmitter<void>();
  @Output() authorPinToggled = new EventEmitter<string>();
  @Output() multiPRPostRequested = new EventEmitter<void>();
  @Output() clearSelectedPRs = new EventEmitter<void>();

  constructor(
    private repositoryColorService: RepositoryColorService,
    private pinnedAuthorsService: PinnedAuthorsService
  ) {}

  getRepositoryColor(projectName: string): string {
    return this.repositoryColorService.getRepositoryColor(projectName);
  }

  onRefresh() {
    this.refreshRequested.emit();
  }

  onFilterByRepository(project: string) {
    this.repositoryFilterChanged.emit(project);
  }

  onFilterByAuthor(author: string) {
    this.authorFilterChanged.emit(author);
  }

  onClearFilter() {
    this.filterCleared.emit();
  }

  onOpenMyPullRequests(project: string, event: Event) {
    event.stopPropagation();
    this.myPullRequestsRequested.emit(project);
  }

  isRepositorySelected(project: string): boolean {
    return this.selectedRepositories.has(project);
  }

  hasActivePRs(project: string): boolean {
    return this.pullRequests.some((pr) => pr.repository.name === project);
  }

  getSelectedRepositoriesText(): string {
    return Array.from(this.selectedRepositories).join(", ");
  }

  getSelectedAuthorsText(): string {
    return Array.from(this.selectedAuthors).join(", ");
  }

  isAuthorSelected(author: string): boolean {
    return this.selectedAuthors.has(author);
  }

  getPRCountForAuthor(author: string): number {
    return this.pullRequests.filter((pr) => pr.createdBy.displayName === author)
      .length;
  }

  getAuthorProfilePictureUrl(author: string): string {
    // Find the first PR by this author to get their profile data
    const pr = this.pullRequests.find(
      (pr) => pr.createdBy.displayName === author
    );
    if (!pr) {
      return this.getInitialsAvatar(author);
    }

    // Azure DevOps typically provides profile pictures via _links.avatar.href
    if (pr.createdBy._links?.avatar?.href) {
      return pr.createdBy._links.avatar.href;
    }

    // Fallback to initials avatar
    return this.getInitialsAvatar(
      pr.createdBy.displayName || pr.createdBy.uniqueName
    );
  }

  private getInitialsAvatar(name: string): string {
    // Check if we're in a browser environment
    if (typeof document === "undefined") {
      return ""; // Return empty string for SSR
    }

    const initials = name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();

    // Generate a simple data URL with initials
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return ""; // Fallback if context is not available
    }

    // Background color based on name hash
    const colors = [
      "#0078d4",
      "#107c10",
      "#d13438",
      "#ca5010",
      "#8764b8",
      "#00bcf2",
    ];
    const colorIndex = name.length % colors.length;
    ctx.fillStyle = colors[colorIndex];
    ctx.fillRect(0, 0, 24, 24);

    // Text
    ctx.fillStyle = "white";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, 12, 12);

    return canvas.toDataURL();
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target && target.dataset["fallbackName"]) {
      target.src = this.getInitialsAvatar(target.dataset["fallbackName"]);
    }
  }

  // Get PR suggestions for a specific project/repository
  getSuggestionsForProject(repositoryName: string): PullRequestSuggestion[] {
    return Array.isArray(this.suggestions)
      ? this.suggestions.filter(
          (suggestion) =>
            suggestion.properties.sourceRepository.name === repositoryName
        )
      : [];
  }

  // Check if a project has PR suggestions
  hasCreatePRSuggestions(repositoryName: string): boolean {
    return this.getSuggestionsForProject(repositoryName).length > 0;
  }

  // Generate create PR URL for a suggestion
  generateCreatePRUrl(suggestion: PullRequestSuggestion): string {
    const baseUrl = suggestion.properties.sourceRepository.webUrl;
    const sourceBranch = suggestion.properties.sourceBranch.replace(
      "refs/heads/",
      ""
    );
    const targetBranch = suggestion.properties.targetBranch.replace(
      "refs/heads/",
      ""
    );
    const repositoryId = suggestion.properties.sourceRepository.id;

    return `${baseUrl}/pullrequestcreate?sourceRef=${encodeURIComponent(
      sourceBranch
    )}&targetRef=${encodeURIComponent(
      targetBranch
    )}&sourceRepositoryId=${repositoryId}&targetRepositoryId=${repositoryId}`;
  }

  // Handle create PR button click
  onCreatePR(suggestion: PullRequestSuggestion, event: Event) {
    event.stopPropagation();
    const createPRUrl = this.generateCreatePRUrl(suggestion);
    window.open(createPRUrl, "_blank");
  }

  onToggleDrafts() {
    this.draftsToggled.emit();
  }

  onToggleAuthorPin(author: string, event: Event): void {
    event.stopPropagation();
    this.pinnedAuthorsService.togglePin(author);
    this.authorPinToggled.emit(author);
  }

  onMultiPRPost(): void {
    this.multiPRPostRequested.emit();
  }

  onClearSelectedPRs(): void {
    this.clearSelectedPRs.emit();
  }

  isAuthorPinned(author: string): boolean {
    return this.pinnedAuthors.has(author);
  }
}
