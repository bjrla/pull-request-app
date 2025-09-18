import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  PullRequest,
  PullRequestSuggestion,
} from "../../azure-devops/azure-devops.service";
import { RepositoryColorService } from "../../services/repository-color.service";

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
  @Input() isLoading = false;
  @Input() projectSummary: ProjectSummary[] = [];
  @Input() suggestions: PullRequestSuggestion[] = [];

  @Output() refreshRequested = new EventEmitter<void>();
  @Output() repositoryFilterChanged = new EventEmitter<string>();
  @Output() filterCleared = new EventEmitter<void>();
  @Output() myPullRequestsRequested = new EventEmitter<string>();
  @Output() createPRRequested = new EventEmitter<string>();

  constructor(private repositoryColorService: RepositoryColorService) {}

  getRepositoryColor(projectName: string): string {
    return this.repositoryColorService.getRepositoryColor(projectName);
  }

  onRefresh() {
    this.refreshRequested.emit();
  }

  onFilterByRepository(project: string) {
    this.repositoryFilterChanged.emit(project);
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
}
