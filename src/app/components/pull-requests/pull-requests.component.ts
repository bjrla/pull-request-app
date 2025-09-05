import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  AzureDevOpsService,
  PullRequest,
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

@Component({
  selector: "app-pull-requests",
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
  templateUrl: "./pull-requests.component.html",
  styleUrl: "./pull-requests.component.scss",
})
export class PullRequestsComponent implements OnInit {
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
    console.log("PullRequestsComponent initialized");
    this.loadProjectsFromStorage();
    this.loadPATFromStorage();

    // Handle authentication errors
    this.azureDevOpsService.authError$.subscribe((message) => {
      this.promptForPAT(message);
    });

    // Only load pull requests if we have projects and PAT configured
    if (this.currentProjects.length > 0 && this.currentPAT) {
      this.loadPullRequests();
    } else if (this.currentProjects.length === 0) {
      console.log("No projects configured, opening add project modal");
      this.openAddProjectModal();
    } else {
      console.log("No PAT configured, prompting for PAT");
      this.promptForPAT(
        "No Personal Access Token configured. Please provide a valid PAT to access Azure DevOps."
      );
    }
  }

  private loadProjectsFromStorage() {
    try {
      const stored = localStorage.getItem(this.PROJECTS_STORAGE_KEY);
      if (stored) {
        this.currentProjects = JSON.parse(stored);
        console.log("Loaded projects from storage:", this.currentProjects);
      } else {
        console.log("No projects found in storage, using default config");
        this.currentProjects = AZURE_DEVOPS_CONFIG.projects;
      }
    } catch (error) {
      console.error("Error loading projects from storage:", error);
      this.currentProjects = AZURE_DEVOPS_CONFIG.projects;
    }
  }

  private loadPATFromStorage() {
    try {
      const stored = localStorage.getItem(this.PAT_STORAGE_KEY);
      if (stored) {
        this.currentPAT = stored;
        console.log("Loaded PAT from storage");
      } else {
        console.log("No PAT found in storage, using default config");
        this.currentPAT = AZURE_DEVOPS_CONFIG.pat;
      }
    } catch (error) {
      console.error("Error loading PAT from storage:", error);
      this.currentPAT = AZURE_DEVOPS_CONFIG.pat;
    }
  }

  loadPullRequests() {
    this.isLoading = true;
    this.error = null;

    if (!this.currentPAT) {
      this.promptForPAT(
        "No Personal Access Token configured. Please provide a valid PAT to access Azure DevOps."
      );
      return;
    }

    this.azureDevOpsService
      .getActivePullRequests(this.currentProjects, this.currentPAT)
      .subscribe({
        next: (response) => {
          console.log("Pull requests loaded:", response);
          this.pullRequests = response.value || [];
          this.assignRepositoryColors();
          this.filteredPullRequests = [...this.pullRequests];
          this.isLoading = false;
        },
        error: (error) => {
          console.error("Error loading pull requests:", error);
          this.error =
            "Failed to load pull requests. Please check your configuration and try again.";
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
        this.repositoryColors.set(
          repo,
          this.colorPalette[index % this.colorPalette.length]
        );
      }
    });
  }

  getRepositoryColor(repositoryName: string): string {
    return this.repositoryColors.get(repositoryName) || "#0078d4";
  }

  getProjectSummary(): ProjectSummary[] {
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

  onRepositorySelectionChanged(repositoryName: string) {
    // Toggle the repository in the selected set
    if (this.selectedRepositories.has(repositoryName)) {
      this.selectedRepositories.delete(repositoryName);
    } else {
      this.selectedRepositories.add(repositoryName);
    }
    this.filterPullRequests();
  }

  private filterPullRequests() {
    if (this.selectedRepositories.size === 0) {
      this.filteredPullRequests = [...this.pullRequests];
    } else {
      this.filteredPullRequests = this.pullRequests.filter((pr) =>
        this.selectedRepositories.has(pr.repository.name)
      );
    }
  }

  openAddProjectModal() {
    this.isAddProjectModalOpen = true;
  }

  closeAddProjectModal() {
    this.isAddProjectModalOpen = false;
  }

  onProjectsUpdated(projects: ProjectConfig[]) {
    console.log("Projects updated:", projects);
    this.currentProjects = projects;
    localStorage.setItem(this.PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    this.closeAddProjectModal();

    if (this.currentPAT) {
      this.loadPullRequests();
    } else {
      this.promptForPAT(
        "Please provide a Personal Access Token to access the new projects."
      );
    }
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
    console.log("PAT updated");
    this.currentPAT = pat;
    localStorage.setItem(this.PAT_STORAGE_KEY, pat);
    this.closePATPromptModal();
    this.loadPullRequests();
  }

  clearFilter() {
    this.selectedRepositories.clear();
    this.filteredPullRequests = [...this.pullRequests];
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
