import { Component, OnInit } from "@angular/core";
import {
  AzureDevOpsService,
  PullRequest,
} from "./azure-devops/azure-devops.service";
import {
  AZURE_DEVOPS_CONFIG,
  ProjectConfig,
} from "./azure-devops/azure-devops.config";
import { RouterOutlet } from "@angular/router";
import { CommonModule } from "@angular/common";

// Import the new components
import {
  PullRequestSummaryComponent,
  ProjectSummary,
} from "./components/pull-request-summary/pull-request-summary.component";
import { PullRequestCardComponent } from "./components/pull-request-card/pull-request-card.component";
import { LoadingComponent } from "./components/loading/loading.component";
import { ErrorMessageComponent } from "./components/error-message/error-message.component";
import { NoDataComponent } from "./components/no-data/no-data.component";
import { ManageProjectsModalComponent } from "./components/add-project-modal/add-project-modal.component";
import { PATPromptModalComponent } from "./components/pat-prompt-modal/pat-prompt-modal.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule,
    PullRequestSummaryComponent,
    PullRequestCardComponent,
    LoadingComponent,
    ErrorMessageComponent,
    NoDataComponent,
    ManageProjectsModalComponent,
    PATPromptModalComponent,
  ],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss",
})
export class AppComponent implements OnInit {
  pullRequests: PullRequest[] = [];
  filteredPullRequests: PullRequest[] = [];
  selectedRepositories: Set<string> = new Set();
  isLoading = false;
  error: string | null = null;

  // Modal state
  isAddProjectModalOpen = false;
  isPATPromptModalOpen = false;

  // Project management
  currentProjects: ProjectConfig[] = [];
  private readonly PROJECTS_STORAGE_KEY = "azure-devops-projects";
  private readonly PAT_STORAGE_KEY = "azure-devops-pat";

  // PAT management
  currentPAT: string = "";
  patPromptMessage: string = "";

  // Repository color mapping
  private repositoryColors = new Map<string, string>();
  private readonly colorPalette = [
    "#0078d4", // Azure Blue
    "#107c10", // Green
    "#d13438", // Red
    "#ca5010", // Orange
    "#8764b8", // Purple
    "#00bcf2", // Light Blue
    "#498205", // Dark Green
    "#e74856", // Bright Red
    "#ff8c00", // Dark Orange
    "#5c2d91", // Dark Purple
    "#038387", // Teal
    "#8e562e", // Brown
    "#744da9", // Medium Purple
    "#486991", // Steel Blue
    "#c239b3", // Magenta
    "#567c73", // Dark Teal
  ];

  constructor(private azureDevOpsService: AzureDevOpsService) {}

  ngOnInit() {
    this.loadProjectsFromStorage();
    this.loadPATFromStorage();

    // Subscribe to authentication errors from the service
    this.azureDevOpsService.authError$.subscribe((message) => {
      this.promptForPAT(message);
    });

    // Only load pull requests if PAT is available (loadPATFromStorage will prompt if needed)
    if (this.currentPAT && this.currentPAT.trim()) {
      this.loadActivePullRequests();
    }
  }

  // Project management methods
  private loadProjectsFromStorage() {
    try {
      const storedProjects = localStorage.getItem(this.PROJECTS_STORAGE_KEY);
      if (storedProjects) {
        const parsed = JSON.parse(storedProjects);
        // Validate the parsed projects
        if (Array.isArray(parsed)) {
          this.currentProjects = parsed.filter(
            (project) =>
              project &&
              typeof project.name === "string" &&
              project.name.trim() !== ""
          );
          console.log("Loaded projects from storage:", this.currentProjects);
        } else {
          throw new Error("Stored projects is not an array");
        }
      } else {
        // Initialize with default projects from config if no stored projects exist
        this.currentProjects = [...AZURE_DEVOPS_CONFIG.projects];
        this.saveProjectsToStorage();
        console.log("Initialized with default projects:", this.currentProjects);
      }
    } catch (error) {
      console.error("Error loading projects from storage:", error);
      // Fallback to config projects
      this.currentProjects = [...AZURE_DEVOPS_CONFIG.projects];
      console.log("Fallback to config projects:", this.currentProjects);
    }
  }

  private saveProjectsToStorage() {
    try {
      localStorage.setItem(
        this.PROJECTS_STORAGE_KEY,
        JSON.stringify(this.currentProjects)
      );
    } catch (error) {
      console.error("Error saving projects to storage:", error);
    }
  }

  private loadPATFromStorage() {
    try {
      const storedPAT = localStorage.getItem(this.PAT_STORAGE_KEY);
      if (storedPAT && storedPAT.trim()) {
        this.currentPAT = storedPAT;
        console.log("Loaded PAT from storage");
      } else {
        // Initialize with default PAT from config if no stored PAT exists
        this.currentPAT = AZURE_DEVOPS_CONFIG.pat;
        if (this.currentPAT && this.currentPAT.trim()) {
          this.savePATToStorage();
          console.log("Initialized with default PAT");
        } else {
          // No PAT available, prompt user
          this.promptForPAT(
            "No Personal Access Token configured. Please provide your Azure DevOps PAT to fetch pull requests."
          );
        }
      }
    } catch (error) {
      console.error("Error loading PAT from storage:", error);
      // Fallback to config PAT
      this.currentPAT = AZURE_DEVOPS_CONFIG.pat;
      if (!this.currentPAT || !this.currentPAT.trim()) {
        this.promptForPAT(
          "Error loading PAT configuration. Please provide your Azure DevOps PAT."
        );
      }
      console.log("Fallback to config PAT");
    }
  }

  private savePATToStorage() {
    try {
      localStorage.setItem(this.PAT_STORAGE_KEY, this.currentPAT);
    } catch (error) {
      console.error("Error saving PAT to storage:", error);
    }
  }

  private getAllProjects(): ProjectConfig[] {
    return this.currentProjects;
  }

  loadActivePullRequests() {
    // Check if PAT is available before making the request
    if (!this.currentPAT || !this.currentPAT.trim()) {
      this.promptForPAT(
        "Personal Access Token is required to fetch pull requests."
      );
      return;
    }

    this.isLoading = true;
    this.error = null;

    this.azureDevOpsService
      .getActivePullRequests(this.currentProjects, this.currentPAT)
      .subscribe({
        next: (response) => {
          this.pullRequests = response.value || [];
          this.assignRepositoryColors();
          this.applyFilter();
          this.isLoading = false;
        },
        error: (error) => {
          console.error("Error fetching pull requests:", error);

          // Check if it's a 401 unauthorized error
          if (error.status === 401) {
            this.promptForPAT(
              "Authentication failed. Your Personal Access Token may be invalid or expired. Please provide a valid PAT."
            );
          } else {
            this.error =
              "Failed to fetch pull requests. Please check your Azure DevOps configuration.";
          }
          this.isLoading = false;
        },
      });
  }

  private assignRepositoryColors() {
    const repositories = [
      ...new Set(this.pullRequests.map((pr) => pr.repository.name)),
    ];
    repositories.forEach((repo, index) => {
      if (!this.repositoryColors.has(repo)) {
        const color = this.colorPalette[index % this.colorPalette.length];
        this.repositoryColors.set(repo, color);
      }
    });
  }

  applyFilter() {
    if (this.selectedRepositories.size > 0) {
      this.filteredPullRequests = this.pullRequests.filter((pr) =>
        this.selectedRepositories.has(pr.repository.name || "")
      );
    } else {
      this.filteredPullRequests = [...this.pullRequests];
    }
  }

  filterByRepository(project: string) {
    // Only allow filtering by repositories that have PRs
    const hasActivePRs = this.pullRequests.some(
      (pr) => pr.repository.name === project
    );
    if (!hasActivePRs) {
      return; // Don't allow selection of repositories with 0 PRs
    }

    if (this.selectedRepositories.has(project)) {
      // If repository is already selected, remove it
      this.selectedRepositories.delete(project);
    } else {
      // If repository is not selected, add it
      this.selectedRepositories.add(project);
    }
    this.applyFilter();
  }

  clearFilter() {
    this.selectedRepositories.clear();
    this.applyFilter();
  }

  isRepositorySelected(repository: string): boolean {
    return this.selectedRepositories.has(repository);
  }

  hasActivePRs(project: string): boolean {
    return this.pullRequests.some((pr) => pr.repository.name === project);
  }

  getSelectedRepositoriesText(): string {
    if (this.selectedRepositories.size === 0) return "";
    return Array.from(this.selectedRepositories).join(", ");
  }

  getProjectSummary() {
    const summary = new Map<string, number>();

    // Initialize all stored repositories with 0 count
    this.currentProjects.forEach((project) => {
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

  cleanDescription(description: string): string {
    if (!description) return "";

    // Remove markdown image syntax: ![alt text](url) - handle multiline and truncated URLs
    let cleaned = description.replace(/!\[.*?\]\([^)]*\)/gs, "");

    // Remove any remaining markdown image syntax that might be incomplete
    cleaned = cleaned.replace(/!\[[^\]]*\]\([^)]*$/gm, "");

    // Remove any lines that start with ![
    cleaned = cleaned.replace(/^!\[.*$/gm, "");

    // Remove HTML img tags: <img src="..." />
    cleaned = cleaned.replace(/<img[^>]*>/g, "");

    // Remove standalone image URLs that might be in the text
    cleaned = cleaned.replace(
      /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|bmp|webp)/gi,
      ""
    );

    // Remove Azure DevOps attachment URLs (more comprehensive)
    cleaned = cleaned.replace(
      /https?:\/\/[^\s]*azuredevops[^\s]*\/_apis\/git\/[^\s]*/gi,
      ""
    );

    // Remove any remaining partial URLs that might be truncated
    cleaned = cleaned.replace(/https?:\/\/[^\s]*azuredevops[^\s]*$/gm, "");

    // Clean up extra whitespace and newlines
    cleaned = cleaned.replace(/\n\s*\n/g, "\n").trim();

    return cleaned;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  getBranchName(refName: string): string {
    return refName.replace("refs/heads/", "");
  }

  openPullRequest(pr: PullRequest): void {
    const url = this.generatePullRequestUrl(pr);
    window.open(url, "_blank");
  }

  generatePullRequestUrl(pr: PullRequest): string {
    // Generate the Azure DevOps PR URL
    // Format: https://azuredevops.danskenet.net/{organization}/{project}/_git/{repository}/pullrequest/{id}
    const baseUrl = AZURE_DEVOPS_CONFIG.baseUrl;
    const organization = AZURE_DEVOPS_CONFIG.organization;
    const projectName = pr.projectName || "Unknown";
    const repositoryName = pr.repository.name;
    const pullRequestId = pr.pullRequestId;

    return `${baseUrl}/${organization}/${encodeURIComponent(
      projectName
    )}/_git/${encodeURIComponent(repositoryName)}/pullrequest/${pullRequestId}`;
  }

  openMyPullRequests(repositoryName: string): void {
    const url = this.generateMyPullRequestsUrl(repositoryName);
    window.open(url, "_blank");
  }

  generateMyPullRequestsUrl(repositoryName: string): string {
    // Find the project for this repository
    const projectConfig = this.currentProjects.find(
      (p) => p.repository === repositoryName
    );

    if (!projectConfig) {
      console.error(`Project not found for repository: ${repositoryName}`);
      return "";
    }

    // Generate the Azure DevOps "My Pull Requests" URL
    // Format: https://azuredevops.danskenet.net/{organization}/{project}/_git/{repository}/pullrequests?_a=mine
    const baseUrl = AZURE_DEVOPS_CONFIG.baseUrl;
    const organization = AZURE_DEVOPS_CONFIG.organization;
    const projectName = projectConfig.name;

    return `${baseUrl}/${organization}/${encodeURIComponent(
      projectName
    )}/_git/${encodeURIComponent(repositoryName)}/pullrequests?_a=mine`;
  }

  openTeamsForPR(pr: PullRequest): void {
    // Create the PR URL using Azure DevOps config
    const prUrl = `${AZURE_DEVOPS_CONFIG.baseUrl}/${AZURE_DEVOPS_CONFIG.organization}/${pr.projectName}/_git/${pr.repository.name}/pullrequest/${pr.pullRequestId}`;

    // Create the PR message content
    const message = `🆕 ${pr.title}
📁 ${pr.repository.name}
🔀 ${this.getBranchName(pr.sourceRefName)} → ${this.getBranchName(
      pr.targetRefName
    )}

🔗 ${prUrl}

Please review! 🙏`;

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

  private showNotification(message: string): void {
    // Create a simple toast notification
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #0078d4;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 10000;
      font-family: 'Segoe UI', sans-serif;
      font-size: 14px;
    `;

    document.body.appendChild(notification);

    // Remove notification after 3 seconds
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  }

  // Repository color management
  private getColorForRepository(repositoryName: string): string {
    if (this.repositoryColors.has(repositoryName)) {
      return this.repositoryColors.get(repositoryName)!;
    }

    // Assign a new color from the palette if available, otherwise fallback to a default color
    const color =
      this.colorPalette[
        this.repositoryColors.size % this.colorPalette.length
      ] || "#000000";

    this.repositoryColors.set(repositoryName, color);
    return color;
  }

  getRepositoryColor(repositoryName: string): string {
    return this.repositoryColors.get(repositoryName) || this.colorPalette[0];
  }

  getRepositoryLightColor(repositoryName: string): string {
    const color = this.getRepositoryColor(repositoryName);
    // Convert hex to rgba with light opacity for backgrounds
    const hex = color.replace("#", "");
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, 0.1)`;
  }

  getRelatedPullRequests(currentPr: PullRequest): PullRequest[] {
    const related: Array<{ pr: PullRequest; score: number }> = [];

    for (const pr of this.filteredPullRequests) {
      if (pr.pullRequestId === currentPr.pullRequestId) continue;

      let score = 0;

      // // Check title similarity (highest weight)
      // const titleSimilarity = this.calculateTextSimilarity(
      //   currentPr.title,
      //   pr.title
      // );
      // score += titleSimilarity * 40;

      // Check description similarity
      const descSimilarity = this.calculateTextSimilarity(
        this.cleanDescription(currentPr.description),
        this.cleanDescription(pr.description)
      );
      score += descSimilarity * 20;

      // Check if same author (medium weight)
      if (currentPr.createdBy.uniqueName === pr.createdBy.uniqueName) {
        score += 15;
      }

      // Check source branch similarity
      const sourceBranchSimilarity = this.calculateTextSimilarity(
        this.getBranchName(currentPr.sourceRefName),
        this.getBranchName(pr.sourceRefName)
      );
      score += sourceBranchSimilarity * 10;

      // Check target branch similarity
      const targetBranchSimilarity = this.calculateTextSimilarity(
        this.getBranchName(currentPr.targetRefName),
        this.getBranchName(pr.targetRefName)
      );
      score += targetBranchSimilarity * 10;

      // Check repository similarity (lower weight since we can filter by repo)
      if (currentPr.repository.name === pr.repository.name) {
        score += 5;
      }

      // Only consider PRs with a meaningful similarity score
      if (score > 25) {
        related.push({ pr, score });
      }
    }

    // Sort by score (highest first) and return top 3
    return related
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.pr);
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const words1 = this.extractKeywords(text1.toLowerCase());
    const words2 = this.extractKeywords(text2.toLowerCase());

    if (words1.length === 0 || words2.length === 0) return 0;

    const intersection = words1.filter((word) => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];

    return intersection.length / union.length;
  }

  private extractKeywords(text: string): string[] {
    // Remove common words and extract meaningful keywords
    const commonWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "from",
      "up",
      "about",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "is",
      "was",
      "are",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "can",
      "this",
      "that",
      "these",
      "those",
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
      "me",
      "him",
      "her",
      "us",
      "them",
    ]);

    return text
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !commonWords.has(word))
      .slice(0, 10); // Limit to first 10 keywords for performance
  }

  getCommentStatus(pr: PullRequest): {
    label: string;
    class: string;
  } {
    if (!pr.threads || pr.threads.length === 0) {
      return { label: "No comments", class: "comments-none" };
    }

    const unresolvedThreads = pr.threads.filter(
      (thread) =>
        !thread.isDeleted &&
        thread.status === "active" &&
        thread.comments.some(
          (comment) => !comment.isDeleted && comment.commentType !== "system"
        )
    );

    const totalThreads = pr.threads.filter(
      (thread) =>
        !thread.isDeleted &&
        thread.comments.some(
          (comment) => !comment.isDeleted && comment.commentType !== "system"
        )
    );

    if (unresolvedThreads.length === 0 && totalThreads.length > 0) {
      return { label: "All resolved", class: "comments-resolved" };
    }

    if (unresolvedThreads.length > 0) {
      const count = unresolvedThreads.length;
      return {
        label: `${count} unresolved`,
        class: "comments-unresolved",
      };
    }

    return { label: "No comments", class: "comments-none" };
  }

  getCommentDetails(pr: PullRequest): string {
    if (!pr.threads || pr.threads.length === 0) {
      return "No discussion threads";
    }

    const activeThreads = pr.threads.filter(
      (thread) =>
        !thread.isDeleted &&
        thread.comments.some(
          (comment) => !comment.isDeleted && comment.commentType !== "system"
        )
    );

    const unresolvedThreads = activeThreads.filter(
      (thread) => thread.status === "active"
    );
    const resolvedThreads = activeThreads.filter(
      (thread) => thread.status !== "active"
    );

    const parts = [];
    if (activeThreads.length > 0) {
      parts.push(
        `${activeThreads.length} total discussion${
          activeThreads.length !== 1 ? "s" : ""
        }`
      );
    }
    if (unresolvedThreads.length > 0) {
      parts.push(`${unresolvedThreads.length} unresolved`);
    }
    if (resolvedThreads.length > 0) {
      parts.push(`${resolvedThreads.length} resolved`);
    }

    return parts.length > 0 ? parts.join(", ") : "No discussion threads";
  }

  getMergeStatus(pr: PullRequest): {
    label: string;
    class: string;
  } {
    if (pr.hasConflicts) {
      return {
        label: "Has conflicts",
        class: "merge-conflicts",
      };
    }

    if (pr.canMerge) {
      return {
        label: "Ready to merge",
        class: "merge-ready",
      };
    }

    switch (pr.mergeStatus) {
      case "succeeded":
        return {
          label: "Ready to merge",
          class: "merge-ready",
        };
      case "conflicts":
        return {
          label: "Has conflicts",
          class: "merge-conflicts",
        };
      case "queued":
        return {
          label: "Merge queued",
          class: "merge-queued",
        };
      case "rejectedByPolicy":
        return {
          label: "Blocked by policy",
          class: "merge-blocked",
        };
      case "failure":
        return {
          label: "Merge failed",
          class: "merge-failed",
        };
      default:
        return {
          label: "Status unknown",
          class: "merge-unknown",
        };
    }
  }

  getMergeDetails(pr: PullRequest): string {
    const details = [];

    if (pr.isDraft) {
      details.push("Draft PR");
    }

    if (pr.hasConflicts) {
      details.push("Merge conflicts detected");
    } else if (pr.canMerge) {
      details.push("No conflicts detected");
    }

    if (pr.mergeStatus) {
      details.push(`Merge status: ${pr.mergeStatus}`);
    }

    return details.length > 0
      ? details.join(", ")
      : "No merge status information";
  }

  getReviewStatus(pr: PullRequest): {
    label: string;
    class: string;
  } {
    if (!pr.reviewers || pr.reviewers.length === 0) {
      return {
        label: "No reviewers",
        class: "review-none",
      };
    }

    const approvedCount = pr.reviewers.filter((r) => r.vote > 0).length;
    const rejectedCount = pr.reviewers.filter((r) => r.vote < 0).length;
    const requiredApprovals = 2;

    if (rejectedCount > 0) {
      return {
        label: `${rejectedCount} rejected`,
        class: "review-rejected",
      };
    }

    if (approvedCount >= requiredApprovals) {
      return {
        label: `${approvedCount}/2 approved`,
        class: "review-approved",
      };
    }

    if (approvedCount > 0) {
      return {
        label: `${approvedCount}/2 approved`,
        class: "review-partial",
      };
    }

    return {
      label: "0/2 approved",
      class: "review-waiting",
    };
  }

  private copyToClipboard(text: string): void {
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          this.showNotification(
            "PR message copied to clipboard! Paste it in Teams."
          );
        })
        .catch((err) => {
          console.error("Clipboard API failed:", err);
          this.fallbackCopyToClipboard(text);
        });
    } else {
      // Fallback for older browsers or non-secure contexts
      this.fallbackCopyToClipboard(text);
    }
  }

  private fallbackCopyToClipboard(text: string): void {
    // Create a temporary textarea element
    const textArea = document.createElement("textarea");
    textArea.value = text;

    // Make it invisible but still accessible
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    textArea.style.opacity = "0";

    document.body.appendChild(textArea);

    try {
      // Select and copy the text
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");

      if (successful) {
        this.showNotification(
          "PR message copied to clipboard! Paste it in Teams."
        );
      } else {
        this.showNotification(
          "Could not copy to clipboard. Message will be logged to console."
        );
        console.log("PR Message to copy:", text);
      }
    } catch (err) {
      console.error("Fallback copy failed:", err);
      this.showNotification(
        "Could not copy to clipboard. Message will be logged to console."
      );
      console.log("PR Message to copy:", text);
    } finally {
      // Clean up
      document.body.removeChild(textArea);
    }
  }

  // Modal methods
  openAddProjectModal() {
    this.isAddProjectModalOpen = true;
  }

  closeAddProjectModal() {
    this.isAddProjectModalOpen = false;
  }

  onProjectAdded(newProject: ProjectConfig) {
    // Validate the new project
    if (!newProject || !newProject.name || !newProject.name.trim()) {
      console.error("Invalid project data:", newProject);
      this.showNotification("Error: Invalid project data");
      return;
    }

    // Check for duplicates
    const exists = this.currentProjects.some(
      (p) =>
        p.name === newProject.name ||
        (p.repository &&
          newProject.repository &&
          p.repository === newProject.repository)
    );

    if (exists) {
      this.showNotification(
        "Error: Project with this name or repository already exists"
      );
      return;
    }

    // Add the project to the current projects list
    this.currentProjects.push(newProject);

    // Save to localStorage
    this.saveProjectsToStorage();

    console.log("New project added:", newProject);
    console.log("Current projects:", this.currentProjects);
    this.showNotification(`Project "${newProject.name}" added successfully!`);

    // Refresh the pull requests to include the new project
    this.loadActivePullRequests();
  }

  removeProject(projectName: string) {
    const index = this.currentProjects.findIndex((p) => p.name === projectName);
    if (index > -1) {
      this.currentProjects.splice(index, 1);
      this.saveProjectsToStorage();
      this.showNotification(`Project "${projectName}" removed successfully!`);
      this.loadActivePullRequests();
    }
  }

  reorderProjects(reorderedProjects: ProjectConfig[]) {
    this.currentProjects = reorderedProjects;
    this.saveProjectsToStorage();
    this.showNotification("Projects reordered successfully!");
    // No need to reload pull requests as the order change doesn't affect the data
  }

  onPATUpdated(newPAT: string) {
    if (!newPAT || !newPAT.trim()) {
      this.showNotification("Error: Personal Access Token cannot be empty");
      return;
    }

    this.currentPAT = newPAT.trim();
    this.savePATToStorage();
    this.showNotification("Personal Access Token updated successfully!");

    // Refresh pull requests with the new PAT
    this.loadActivePullRequests();
  }

  // PAT prompt modal methods
  promptForPAT(message: string) {
    this.patPromptMessage = message;
    this.isPATPromptModalOpen = true;
  }

  closePATPromptModal() {
    this.isPATPromptModalOpen = false;
    this.patPromptMessage = "";
  }

  onPATProvided(newPAT: string) {
    if (!newPAT || !newPAT.trim()) {
      this.showNotification("Error: Personal Access Token cannot be empty");
      return;
    }

    this.currentPAT = newPAT.trim();
    this.savePATToStorage();
    this.closePATPromptModal();
    this.showNotification("Personal Access Token configured successfully!");

    // Refresh pull requests with the new PAT
    this.loadActivePullRequests();
  }
}
