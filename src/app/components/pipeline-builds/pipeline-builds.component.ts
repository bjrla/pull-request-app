import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AzureDevOpsService } from "../../azure-devops/azure-devops.service";
import { ProjectConfig } from "../../azure-devops/azure-devops.config";
import { LoadingComponent } from "../loading/loading.component";
import { ErrorMessageComponent } from "../error-message/error-message.component";
import { NoDataComponent } from "../no-data/no-data.component";
import { ConfigStorageService } from "../../services/config-storage.service";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import { AZURE_DEVOPS_CONFIG } from "../../azure-devops/azure-devops.config";

@Component({
  selector: "app-pipeline-builds",
  standalone: true,
  imports: [
    CommonModule,
    LoadingComponent,
    ErrorMessageComponent,
    NoDataComponent,
  ],
  templateUrl: "./pipeline-builds.component.html",
  styleUrl: "./pipeline-builds.component.scss",
})
export class PipelineBuildsComponent implements OnInit {
  pipelineRuns: PipelineRun[] = [];
  isLoading = false;
  error: string | null = null;
  currentProjects: ProjectConfig[] = [];

  constructor(
    private azureDevOpsService: AzureDevOpsService,
    private configService: ConfigStorageService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.currentProjects = this.configService.currentProjects;

    if (this.currentProjects.length === 0) {
      this.error =
        "No projects configured. Please configure projects in the main application.";
      this.isLoading = false;
    } else {
      this.loadPipelineRuns();
    }

    this.azureDevOpsService.authError$.subscribe((message) => {
      this.error = message;
      this.isLoading = false;
    });
  }

  private get projectName(): string {
    return "X5K8-Regular-Transfers";
  }

  private get repositoryName(): string {
    return "X5K8-Regular-Transfers";
  }

  private get pipelineDefinitionId(): number {
    return 40500;
  }

  async loadPipelineRuns() {
    this.isLoading = true;
    this.error = null;

    try {
      const headers = new HttpHeaders({
        Authorization: `Basic ${btoa(":" + this.configService.currentPAT)}`,
        "Content-Type": "application/json",
      });

      // Get pipeline runs using the exact same URL structure that works in Azure DevOps
      const buildsUrl = `${AZURE_DEVOPS_CONFIG.baseUrl}/${AZURE_DEVOPS_CONFIG.organization}/${this.projectName}/_apis/build/builds?definitions=${this.pipelineDefinitionId}&branchFilter=563430%2C563430%2C563430%2C563430%2C563430%2C563430%2C563430%2C563430&$top=20&api-version=7.0`;

      console.log("Fetching pipeline runs with URL:", buildsUrl);

      const buildsResponse = await this.http
        .get<{ value: any[] }>(buildsUrl, { headers })
        .toPromise();

      if (!buildsResponse?.value || buildsResponse.value.length === 0) {
        this.error = "No pipeline runs found.";
        this.isLoading = false;
        return;
      }

      console.log(`Found ${buildsResponse.value.length} total pipeline runs`);

      // Filter to only show runs from master branch
      const masterBranchRuns = buildsResponse.value;
      // .filter(
      //   (build: any) =>
      //     build.sourceBranch === "refs/heads/master" ||
      //     build.sourceBranch === "master"
      // );

      console.log(`Found ${masterBranchRuns.length} runs on master branch`);

      // Convert builds to PipelineRun interface (simplified to avoid 404 errors)
      this.pipelineRuns = masterBranchRuns.map((build: any) => ({
        id: build.id,
        buildNumber: build.buildNumber,
        status: build.status,
        result: build.result,
        sourceBranch: build.sourceBranch,
        sourceVersion: build.sourceVersion,
        shortSourceVersion: build.sourceVersion?.substring(0, 8) || "",
        startTime: build.startTime,
        finishTime: build.finishTime,
        queueTime: build.queueTime,
        definition: build.definition,
        requestedFor: build.requestedFor,
        url: `${AZURE_DEVOPS_CONFIG.baseUrl}/${AZURE_DEVOPS_CONFIG.organization}/${this.projectName}/_build/results?buildId=${build.id}`,
        duration: this.calculateDuration(build.startTime, build.finishTime),
        commitMessage: build.sourceVersion
          ? `Commit ${build.sourceVersion.substring(0, 8)}`
          : "",
        stages: [], // Simplified to avoid API errors
      }));
      this.isLoading = false;
    } catch (error) {
      console.error("Error loading pipeline runs:", error);
      this.error =
        "Failed to load pipeline runs. Please check your configuration and try again.";
      this.isLoading = false;
    }
  }

  private calculateDuration(startTime: string, finishTime: string): string {
    if (!startTime || !finishTime) return "";

    const start = new Date(startTime);
    const finish = new Date(finishTime);
    const duration = Math.round(
      (finish.getTime() - start.getTime()) / 1000 / 60
    );
    return `${duration}m`;
  }

  formatDate(dateString: string): string {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString();
  }

  formatRelativeDate(dateString: string): string {
    if (!dateString) return "";

    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    );

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else if (diffInHours < 48) {
      return "Yesterday";
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  }

  getBranchName(sourceBranch: string): string {
    if (!sourceBranch) return "";
    return sourceBranch.replace("refs/heads/", "");
  }

  getStatusClass(run: PipelineRun): string {
    if (run.status === "completed") {
      return run.result === "succeeded" ? "succeeded" : "failed";
    }
    if (run.status === "inProgress") {
      return "in-progress";
    }
    return "not-started";
  }

  getStatusText(run: PipelineRun): string {
    if (run.status === "completed") {
      return run.result === "succeeded" ? "Succeeded" : "Failed";
    }
    if (run.status === "inProgress") {
      return "In Progress";
    }
    return "Not Started";
  }

  getPipelineUrl(run: PipelineRun): string {
    return run.url;
  }
}

export interface PipelineRun {
  id: number;
  buildNumber: string;
  status: string;
  result?: string;
  sourceBranch: string;
  sourceVersion: string;
  shortSourceVersion: string;
  startTime?: string;
  finishTime?: string;
  queueTime?: string;
  definition: {
    name: string;
    id: number;
  };
  requestedFor: {
    displayName: string;
    uniqueName: string;
  };
  url: string;
  duration: string;
  commitMessage?: string;
  stages?: PipelineStage[];
}

export interface PipelineStage {
  id: string;
  name: string;
  status: string;
  result?: string;
  startTime?: string;
  finishTime?: string;
  duration: string;
}
