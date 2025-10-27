import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Subscription } from "rxjs";
import {
  AzureDevOpsService,
  PullRequest,
  PullRequestSuggestion,
} from "../../azure-devops/azure-devops.service";
import {
  AZURE_DEVOPS_CONFIG,
  ProjectConfig,
} from "../../azure-devops/azure-devops.config";
import {
  PullRequestSummaryComponent,
  ProjectSummary,
} from "../pull-request-summary/pull-request-summary.component";
import { PullRequestCardComponent } from "../pull-request-card/pull-request-card.component";
import { LoadingComponent } from "../loading/loading.component";
import { ErrorMessageComponent } from "../error-message/error-message.component";
import { NoDataComponent } from "../no-data/no-data.component";
import { ManageProjectsModalComponent } from "../add-project-modal/add-project-modal.component";
import { PATPromptModalComponent } from "../pat-prompt-modal/pat-prompt-modal.component";
import { ConfigStorageService } from "../../services/config-storage.service";
import { RepositoryColorService } from "../../services/repository-color.service";
import { PinnedAuthorsService } from "../../services/pinned-authors.service";

@Component({
  selector: "app-pull-requests",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PullRequestSummaryComponent,
    PullRequestCardComponent,
    LoadingComponent,
    ErrorMessageComponent,
    NoDataComponent,
    ManageProjectsModalComponent,
    PATPromptModalComponent,
  ],
  templateUrl: "./pull-requests.component.html",
  styleUrl: "./pull-requests.component.scss",
})
export class PullRequestsComponent implements OnInit, OnDestroy {
  pullRequests: PullRequest[] = [];
  filteredPullRequests: PullRequest[] = [];
  selectedRepositories: Set<string> = new Set();
  selectedAuthors: Set<string> = new Set();
  isLoading = false;
  error: string | null = null;

  // PR Suggestions
  prSuggestions: PullRequestSuggestion[] = [];

  // Draft filtering
  showDrafts = false;

  // Modal state
  isAddProjectModalOpen = false;
  isPATPromptModalOpen = false;

  // Project management
  currentProjects: ProjectConfig[] = [];
  patPromptMessage: string = "";

  // Pinned authors
  pinnedAuthors: Set<string> = new Set();

  // Multi-PR selection
  selectedPRs: PullRequest[] = [];

  private subscriptions = new Subscription();

  constructor(
    private azureDevOpsService: AzureDevOpsService,
    private configService: ConfigStorageService,
    private repositoryColorService: RepositoryColorService,
    private pinnedAuthorsService: PinnedAuthorsService
  ) {}

  ngOnInit() {
    // Subscribe to projects changes only - PAT is handled automatically by ConfigStorageService
    this.subscriptions.add(
      this.configService.projects$.subscribe((projects) => {
        this.currentProjects = projects;

        if (this.currentProjects.length > 0) {
          this.loadPullRequests();
        }
      })
    );

    // Subscribe to pinned authors changes
    this.subscriptions.add(
      this.pinnedAuthorsService.pinnedAuthors$.subscribe((pinnedAuthors) => {
        this.pinnedAuthors = pinnedAuthors;
      })
    );

    // Subscribe to selected PRs changes
    this.subscriptions.add(
      this.azureDevOpsService.selectedPRs$.subscribe((selectedPRs) => {
        this.selectedPRs = selectedPRs;
      })
    );

    // Handle authentication errors
    this.azureDevOpsService.authError$.subscribe((message) => {
      this.promptForPAT(message);
    });

    // Add visibility change listener to refresh PRs when page becomes active
    this.setupVisibilityChangeListener();

    // Check if we need to show modals
    if (this.currentProjects.length === 0) {
      this.openAddProjectModal();
      this.promptForPAT(
        "No Personal Access Token configured. Please provide a valid PAT to access Azure DevOps."
      );
    }
  }

  ngOnDestroy() {
    // Clean up subscriptions
    this.subscriptions.unsubscribe();

    // Clean up the visibility change listener
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange
      );
    }
  }

  private setupVisibilityChangeListener() {
    // Check if we're in a browser environment
    if (typeof document !== "undefined") {
      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange
      );
    }
  }

  private handleVisibilityChange = () => {
    // When the page becomes visible again, refresh the PRs
    if (
      !document.hidden &&
      this.currentProjects.length > 0 &&
      !this.isLoading
    ) {
      this.loadPullRequests();
    }
  };

  loadPullRequests() {
    this.isLoading = true;
    this.error = null;

    // Filter out hidden projects before making API call
    const visibleProjects = this.currentProjects.filter(
      (project) => !project.hidden
    );

    this.azureDevOpsService.getActivePullRequests(visibleProjects).subscribe({
      next: (response) => {
        this.pullRequests = response.value || [];

        // Check for pinned authors and auto-apply filters
        this.applyAutomaticPinnedAuthorFilters();

        this.applyFilters();
        this.isLoading = false;

        // Also check for PR suggestions (using visible projects only)
        this.checkForPullRequestSuggestions();
      },
      error: (error) => {
        console.error("Error loading pull requests:", error);
        this.error =
          "Failed to load pull requests. Please check your configuration and try again.";
        this.isLoading = false;
      },
    });
  }

  private checkForPullRequestSuggestions() {
    // Filter out hidden projects before making API call
    const visibleProjects = this.currentProjects.filter(
      (project) => !project.hidden
    );

    this.azureDevOpsService
      .getPullRequestSuggestions(visibleProjects)
      .subscribe({
        next: (suggestions) => {
          this.prSuggestions = suggestions;
          if (suggestions.length > 0) {
            // For each suggestion, log the branch that can create a PR
            suggestions.forEach((suggestion) => {
              const sourceBranch = suggestion.properties.sourceBranch.replace(
                "refs/heads/",
                ""
              );
              const targetBranch = suggestion.properties.targetBranch.replace(
                "refs/heads/",
                ""
              );
              const projectName =
                suggestion.properties.sourceRepository.project.name;
              const repoName = suggestion.properties.sourceRepository.name;
            });
          } else {
          }
        },
        error: (error) => {
          console.error("Error fetching PR suggestions:", error);
        },
      });
  }

  getRepositoryColor(repositoryName: string): string {
    return this.repositoryColorService.getRepositoryColor(repositoryName);
  }

  private applyAutomaticPinnedAuthorFilters(): void {
    // Get all unique authors from current PRs
    const currentAuthors = this.getUniqueAuthors();

    // Find pinned authors that have PRs in the current result
    const activePinnedAuthors = currentAuthors.filter((author) =>
      this.pinnedAuthors.has(author)
    );

    // Only apply automatic filtering if:
    // 1. There are pinned authors with active PRs
    // 2. No authors are currently selected (to avoid overriding user selections)
    if (activePinnedAuthors.length > 0 && this.selectedAuthors.size === 0) {
      // Automatically apply the filter for pinned authors
      activePinnedAuthors.forEach((author) => {
        this.selectedAuthors.add(author);
      });
    }
  }

  applyFilters(): void {
    let filtered = [...this.pullRequests];

    // Filter out drafts if showDrafts is false
    if (!this.showDrafts) {
      filtered = filtered.filter((pr) => !pr.isDraft);
    }

    // Apply repository filtering if any repositories are selected
    if (this.selectedRepositories.size > 0) {
      filtered = filtered.filter((pr) =>
        this.selectedRepositories.has(pr.repository.name)
      );
    }

    // Apply author filtering if any authors are selected
    if (this.selectedAuthors.size > 0) {
      filtered = filtered.filter((pr) =>
        this.selectedAuthors.has(pr.createdBy.displayName)
      );
    }

    this.filteredPullRequests = filtered;
  }

  toggleDraftVisibility(): void {
    this.showDrafts = !this.showDrafts;
    this.applyFilters();
  }

  getDraftCount(): number {
    return this.pullRequests.filter((pr) => pr.isDraft).length;
  }

  getRegularCount(): number {
    return this.pullRequests.filter((pr) => !pr.isDraft).length;
  }

  getProjectSummary(): ProjectSummary[] {
    const summary = new Map<string, number>();

    // Initialize all visible stored repositories with 0 count
    this.currentProjects
      .filter((project) => !project.hidden)
      .forEach((project) => {
        if (project.repository) {
          summary.set(project.repository, 0);
        }
      });

    // Count PRs by repository name
    this.pullRequests.forEach((pr) => {
      const repositoryName = pr.repository.name;
      if (repositoryName) {
        summary.set(repositoryName, (summary.get(repositoryName) || 0) + 1);
      }
    });

    return Array.from(summary.entries()).map(([project, count]) => ({
      project,
      count,
    }));
  }

  onRepositorySelectionChanged(repositoryName: string) {
    // Toggle the repository in the selected set
    if (this.selectedRepositories.has(repositoryName)) {
      this.selectedRepositories.delete(repositoryName);
    } else {
      this.selectedRepositories.add(repositoryName);
    }
    this.applyFilters();
  }

  onAuthorSelectionChanged(authorName: string) {
    // Toggle the author in the selected set
    if (this.selectedAuthors.has(authorName)) {
      this.selectedAuthors.delete(authorName);
    } else {
      this.selectedAuthors.add(authorName);
    }
    this.applyFilters();
  }

  getUniqueAuthors(): string[] {
    const authors = new Set<string>();
    this.pullRequests.forEach((pr) => {
      authors.add(pr.createdBy.displayName);
    });
    return Array.from(authors).sort();
  }

  openAddProjectModal() {
    this.isAddProjectModalOpen = true;
  }

  closeAddProjectModal() {
    this.isAddProjectModalOpen = false;
  }

  onProjectsUpdated(projects: ProjectConfig[]) {
    this.configService.updateProjects(projects);
    this.closeAddProjectModal();

    // Load pull requests for the new projects
    this.loadPullRequests();
  }

  promptForPAT(message: string) {
    this.patPromptMessage = message;
    this.isPATPromptModalOpen = true;
    this.isLoading = false;
  }

  closePATPromptModal() {
    this.isPATPromptModalOpen = false;
  }

  onPATUpdated(pat: string) {
    this.configService.updatePAT(pat);
    this.closePATPromptModal();
    this.loadPullRequests();
  }

  clearFilter() {
    this.selectedRepositories.clear();
    this.selectedAuthors.clear();
    this.applyFilters();
  }

  onProjectAdded(project: ProjectConfig) {
    this.currentProjects.push(project);
    this.onProjectsUpdated(this.currentProjects);
  }

  onProjectRemoved(projectName: string) {
    const index = this.currentProjects.findIndex((p) => p.name === projectName);
    if (index > -1) {
      this.currentProjects.splice(index, 1);
      this.onProjectsUpdated(this.currentProjects);
    }
  }

  onProjectsReordered(projects: ProjectConfig[]) {
    this.onProjectsUpdated(projects);
  }

  onAuthorPinToggled(author: string) {
    // This method is called when a user pins/unpins an author
    // The PinnedAuthorsService handles the actual logic
    // We don't need to do anything specific here as the service
    // will emit the changes and our subscription will handle it
  }

  clearSelectedPRs(): void {
    this.azureDevOpsService.clearSelectedPRs();
  }

  openPullRequest(pullRequest: PullRequest) {
    const project = pullRequest.projectName;
    const repo = pullRequest.repository.name;
    const prId = pullRequest.pullRequestId;

    const url = `${AZURE_DEVOPS_CONFIG.baseUrl}/${AZURE_DEVOPS_CONFIG.organization}/${project}/_git/${repo}/pullrequest/${prId}`;
    window.open(url, "_blank");
  }

  openMyPullRequests(repositoryName: string) {
    // First try to find the project name from the stored project configuration
    const projectConfig = this.currentProjects.find(
      (p) => p.repository === repositoryName
    );
    let projectName: string;

    if (projectConfig) {
      projectName = projectConfig.name;
    } else {
      // Fallback: try to find from existing pull requests
      const pullRequest = this.pullRequests.find(
        (pr) => pr.repository.name === repositoryName
      );
      if (pullRequest) {
        projectName = pullRequest.projectName || "";
      } else {
        console.error("Could not find project for repository:", repositoryName);
        return;
      }
    }

    const url = `${AZURE_DEVOPS_CONFIG.baseUrl}/${AZURE_DEVOPS_CONFIG.organization}/${projectName}/_git/${repositoryName}/pullrequests?_a=mine`;
    window.open(url, "_blank");
  }

  openTeamsForPR(pr: PullRequest): void {
    this.openTeamsForPRs([pr]);
  }

  openTeamsForMultiplePRs(): void {
    if (this.selectedPRs.length > 0) {
      this.openTeamsForPRs(this.selectedPRs);
      // Clear selection after posting
      this.azureDevOpsService.clearSelectedPRs();
    }
  }

  private openTeamsForPRs(prs: PullRequest[]): void {
    let message: string;

    if (prs.length === 1) {
      const pr = prs[0];
      // Create the PR URL using Azure DevOps config
      const prUrl = `${AZURE_DEVOPS_CONFIG.baseUrl}/${
        AZURE_DEVOPS_CONFIG.organization
      }/${encodeURIComponent(
        pr.projectName || "{{PROJECT}}"
      )}/_git/${encodeURIComponent(pr.repository.name)}/pullrequest/${
        pr.pullRequestId
      }`;

      // Create the PR message content
      message = `🆕 ${pr.title}
📁 ${pr.repository.name}
🔀 ${this.getBranchName(pr.sourceRefName)} → ${this.getBranchName(
        pr.targetRefName
      )}

🔗 ${prUrl}

Please review! 🙏`;
    } else {
      // Multi-PR message
      message = `🗂️🗂️ Multiple PRs for Review (${prs.length} PRs)

`;

      prs.forEach((pr, index) => {
        const prUrl = `${AZURE_DEVOPS_CONFIG.baseUrl}/${
          AZURE_DEVOPS_CONFIG.organization
        }/${encodeURIComponent(
          pr.projectName || "{{PROJECT}}"
        )}/_git/${encodeURIComponent(pr.repository.name)}/pullrequest/${
          pr.pullRequestId
        }`;

        const emojiNumber = index === 0 ? "1️⃣" : "2️⃣";
        message += `${emojiNumber} ${pr.title}
📁 ${pr.repository.name}
🔗 ${prUrl}

`;
      });

      message += `Please review! 🙏`;
    }

    // Copy message to clipboard with fallback
    this.copyToClipboard(message);

    // Teams channel info
    const baseChannelId =
      "19%3A4c6f2c2dd61e4ea9959d38c8749b0796%40thread.tacv2";
    const groupId = "10717b7b-9b3d-4281-9338-eb3302ede5e4";
    const tenantId = "c7d1b6e9-1447-457b-9223-ac25df4941bf";

    // Open Teams channel directly (most reliable approach)
    const teamsAppUrl = `msteams://teams.microsoft.com/l/channel/${baseChannelId}/PR%20-%20Reviews?groupId=${groupId}&tenantId=${tenantId}`;
    const webUrl = `https://teams.microsoft.com/l/channel/${baseChannelId}/PR%20-%20Reviews?groupId=${groupId}&tenantId=${tenantId}`;

    // Try opening Teams app first
    window.location.href = teamsAppUrl;

    // If the Teams app doesn't open within a short time, open web version
    setTimeout(() => {
      if (document.hasFocus()) {
        // Page still has focus, likely means Teams app didn't open
        window.open(webUrl, "_blank");
      }
    }, 1500);
  }

  getBranchName(refName: string): string {
    return refName.replace("refs/heads/", "");
  }

  copyToClipboard(text: string): void {
    if (navigator.clipboard && window.isSecureContext) {
      // Use the modern clipboard API if available
      navigator.clipboard.writeText(text).catch((err) => {
        console.error("Failed to copy to clipboard:", err);
        this.fallbackCopyToClipboard(text);
      });
    } else {
      // Fallback for older browsers or non-secure contexts
      this.fallbackCopyToClipboard(text);
    }
  }

  private fallbackCopyToClipboard(text: string): void {
    const textArea = document.createElement("textarea");
    textArea.value = text;

    // Make it invisible
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Fallback: Could not copy text to clipboard", err);
    }

    document.body.removeChild(textArea);
  }
}
