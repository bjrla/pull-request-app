import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AzureDevOpsService } from "../../azure-devops/azure-devops.service";
import {
  AZURE_DEVOPS_CONFIG,
  ProjectConfig,
} from "../../azure-devops/azure-devops.config";
import { LoadingComponent } from "../loading/loading.component";
import { ErrorMessageComponent } from "../error-message/error-message.component";
import { NoDataComponent } from "../no-data/no-data.component";
import { ConfigStorageService } from "../../services/config-storage.service";
import { forkJoin, map, catchError, of } from "rxjs";

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
  builds: PipelineBuild[] = [];
  isLoading = false;
  error: string | null = null;
  currentProjects: ProjectConfig[] = [];

  constructor(
    private azureDevOpsService: AzureDevOpsService,
    private configService: ConfigStorageService
  ) {}

  ngOnInit() {
    // Get current projects and load pipeline builds if available
    this.currentProjects = this.configService.currentProjects;

    if (this.currentProjects.length === 0) {
      this.error =
        "No projects configured. Please configure projects in the main application.";
      this.isLoading = false;
    } else {
      // Load pipeline builds - PAT is handled automatically by ConfigStorageService
      this.loadPipelineBuilds();
    }

    // Subscribe to authentication errors
    this.azureDevOpsService.authError$.subscribe((message) => {
      this.error = message;
      this.isLoading = false;
    });
  }

  private get projectName(): string {
    return "IB-SS - List of outgoing payments";
  }

  loadPipelineBuilds() {
    // Check if we have the required configuration before starting
    if (this.currentProjects.length === 0) {
      this.error =
        "No projects configured. Please configure projects in the main application.";
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.error = null;

    // For now, use hardcoded pipeline configuration since the ProjectConfig
    // interface doesn't include pipeline information yet
    const projectName = "IB-SS - List of outgoing payments";
    const pipelineDefinitionId = 48011;

    // Use the actual Azure DevOps service to fetch pipeline builds for master branch only
    this.azureDevOpsService
      .getPipelineBuilds(
        projectName,
        pipelineDefinitionId,
        20,
        "refs/heads/master"
      )
      .subscribe({
        next: (response) => {
          // Check if response and response.value exist
          if (!response || !response.value || !Array.isArray(response.value)) {
            this.error = "Invalid response format from Azure DevOps API";
            this.isLoading = false;
            return;
          }

          // For each build, fetch the timeline to get real stage and job information
          const buildTimelines$ = response.value.map((build) =>
            this.azureDevOpsService
              .getBuildTimeline(this.projectName, build.id)
              .pipe(
                map((timeline) => {
                  return {
                    id: build.id,
                    buildNumber: build.buildNumber,
                    status: build.status,
                    result: build.result,
                    definition: build.definition,
                    startTime: build.startTime,
                    finishTime: build.finishTime,
                    sourceBranch: build.sourceBranch,
                    queueTime: build.startTime,
                    url: `${this.azureDevOpsService["config"].baseUrl}/${
                      this.azureDevOpsService["config"].organization
                    }/${encodeURIComponent(
                      this.projectName
                    )}/_build/results?buildId=${build.id}`,
                    stages: this.generateStagesFromTimeline(timeline, build),
                  };
                }),
                catchError((error) => {
                  // Fallback to estimated stages if timeline fails
                  return of({
                    id: build.id,
                    buildNumber: build.buildNumber,
                    status: build.status,
                    result: build.result,
                    definition: build.definition,
                    startTime: build.startTime,
                    finishTime: build.finishTime,
                    sourceBranch: build.sourceBranch,
                    queueTime: build.startTime,
                    url: `${this.azureDevOpsService["config"].baseUrl}/${
                      this.azureDevOpsService["config"].organization
                    }/${encodeURIComponent(
                      this.projectName
                    )}/_build/results?buildId=${build.id}`,
                    stages: this.generateStagesFromBuild(build),
                  });
                })
              )
          );

          // Wait for all timeline requests to complete
          if (buildTimelines$.length === 0) {
            this.builds = [];
            this.isLoading = false;
            return;
          }

          forkJoin(buildTimelines$).subscribe({
            next: (buildsWithTimelines) => {
              this.builds = buildsWithTimelines as PipelineBuild[];
              this.isLoading = false;
            },
            error: (error) => {
              console.error("Error loading build timelines:", error);
              // If timeline loading fails, use basic build data with estimated stages
              this.builds = response.value.map((build) => ({
                id: build.id,
                buildNumber: build.buildNumber,
                status: build.status,
                result: build.result,
                definition: build.definition,
                startTime: build.startTime,
                finishTime: build.finishTime,
                sourceBranch: build.sourceBranch,
                queueTime: build.startTime,
                url: `${this.azureDevOpsService["config"].baseUrl}/${
                  this.azureDevOpsService["config"].organization
                }/${encodeURIComponent(
                  this.projectName
                )}/_build/results?buildId=${build.id}`,
                stages: this.generateStagesFromBuild(build),
              }));
              this.isLoading = false;
            },
          });
        },
        error: (error) => {
          console.error("Error loading pipeline builds:", error);
          this.error =
            "Failed to load pipeline builds. Please check your Azure DevOps configuration and try again.";
          this.isLoading = false;
        },
      });
  }

  getAzureDevOpsUrl(): string {
    if (this.builds.length === 0) {
      return "#";
    }
    const projectName = encodeURIComponent(this.projectName);
    const definitionId = this.builds[0].definition.id;
    return `https://azuredevops.danskenet.net/Main/${projectName}/_build?definitionId=${definitionId}`;
  }

  private generateStagesFromBuild(build: any): PipelineStage[] {
    // Only return real data, no fake/estimated data
    console.log(
      "No timeline data available for build",
      build.id,
      "- not showing fake stages"
    );
    return [];
  }

  private generateStagesFromTimeline(
    timeline: any,
    build: any
  ): PipelineStage[] {
    // If timeline is not available or empty, fall back to estimated stages
    if (!timeline || !timeline.records || timeline.records.length === 0) {
      return this.generateStagesFromBuild(build);
    }

    const stages: PipelineStage[] = [];
    const stageRecords = timeline.records.filter(
      (record: any) => record.type === "Stage"
    );

    // Group jobs and tasks by their parent stage
    const jobsByStage: { [stageId: string]: any[] } = {};
    const tasksByJob: { [jobId: string]: any[] } = {};

    timeline.records.forEach((record: any) => {
      if (record.type === "Job" && record.parentId) {
        if (!jobsByStage[record.parentId]) {
          jobsByStage[record.parentId] = [];
        }
        jobsByStage[record.parentId].push(record);
      } else if (record.type === "Task" && record.parentId) {
        if (!tasksByJob[record.parentId]) {
          tasksByJob[record.parentId] = [];
        }
        tasksByJob[record.parentId].push(record);
      }
    });

    stageRecords.forEach((stageRecord: any, index: number) => {
      const jobs = jobsByStage[stageRecord.id] || [];

      const stageJobs: StageJob[] = jobs.map((job: any) => {
        const tasks = tasksByJob[job.id] || [];

        return {
          name: job.name || `Job ${job.order || jobs.indexOf(job) + 1}`,
          status: this.mapTimelineStatus(job.state),
          result: this.mapTimelineResult(job.result),
          startTime: job.startTime,
          finishTime: job.finishTime,
          // Add comprehensive job details
          details: {
            id: job.id,
            type: job.type,
            workerName: job.workerName,
            queueId: job.queueId,
            attempt: job.attempt,
            order: job.order,
            percentComplete: job.percentComplete,
            agentName: job.agentName,
            poolName: job.poolName,
            identifier: job.identifier,
            parentId: job.parentId,
            log: job.log,
            variables: job.variables,
            requestedFor: job.requestedFor,
            previousAttempts: job.previousAttempts || [],
            issues: job.issues || [],
            changeId: job.changeId,
            lastModified: job.lastModified,
            tasks: tasks.map((task) => ({
              name: task.name,
              status: this.mapTimelineStatus(task.state),
              result: this.mapTimelineResult(task.result),
              startTime: task.startTime,
              finishTime: task.finishTime,
              id: task.id,
              order: task.order,
              percentComplete: task.percentComplete,
              logId: task.log?.id,
              logUrl: task.log?.url,
              issues: task.issues || [],
              errorCount: task.errorCount || 0,
              warningCount: task.warningCount || 0,
              type: task.type,
              identifier: task.identifier,
              parentId: task.parentId,
              agentName: task.agentName,
              workerName: task.workerName,
              attempt: task.attempt,
              changeId: task.changeId,
              lastModified: task.lastModified,
              task: task.task,
              variables: task.variables,
              requestedFor: task.requestedFor,
              previousAttempts: task.previousAttempts || [],
            })),
          },
        };
      });

      // Calculate stage statistics
      const completedJobs = stageJobs.filter(
        (job) => job.status === "completed"
      ).length;
      const failedJobs = stageJobs.filter(
        (job) =>
          job.status === "failed" ||
          (job.status === "completed" && job.result === "failed")
      ).length;
      const skippedJobs = stageJobs.filter(
        (job) => job.status === "skipped"
      ).length;

      const stage: PipelineStage = {
        name: stageRecord.name || `Stage ${index + 1}`,
        status: this.mapTimelineStatus(stageRecord.state),
        result: this.mapTimelineResult(stageRecord.result),
        startTime: stageRecord.startTime,
        finishTime: stageRecord.finishTime,
        order: stageRecord.order || index + 1,
        jobs: stageJobs,
        totalJobs: stageJobs.length,
        completedJobs,
        failedJobs,
        skippedJobs,
        // Add comprehensive stage details
        details: {
          id: stageRecord.id,
          type: stageRecord.type,
          state: stageRecord.state,
          result: stageRecord.result,
          percentComplete: stageRecord.percentComplete,
          attempt: stageRecord.attempt,
          queueId: stageRecord.queueId,
          workerName: stageRecord.workerName,
          previousAttempts: stageRecord.previousAttempts || [],
          issues: stageRecord.issues || [],
          errorCount: stageRecord.errorCount || 0,
          warningCount: stageRecord.warningCount || 0,
          changeId: stageRecord.changeId,
          lastModified: stageRecord.lastModified,
          identifier: stageRecord.identifier,
          parentId: stageRecord.parentId,
          agentName: stageRecord.agentName,
          log: stageRecord.log,
          variables: stageRecord.variables,
          environment: stageRecord.environment,
          refName: stageRecord.refName,
          requestedFor: stageRecord.requestedFor,
        },
      };

      stages.push(stage);
    });

    // Sort stages by order
    stages.sort((a, b) => a.order - b.order);

    // If no stages found in timeline, fall back to estimated stages
    if (stages.length === 0) {
      return this.generateStagesFromBuild(build);
    }

    return stages;
  }

  private mapTimelineStatus(state: string): string {
    if (!state) return "notStarted";

    switch (state.toLowerCase()) {
      case "completed":
        return "completed";
      case "inprogress":
      case "running":
        return "inProgress";
      case "pending":
      case "notstarted":
        return "notStarted";
      case "skipped":
        return "skipped";
      default:
        return "notStarted";
    }
  }

  private mapTimelineResult(result: string): string | undefined {
    if (!result) return undefined;

    switch (result.toLowerCase()) {
      case "succeeded":
        return "succeeded";
      case "failed":
      case "partiallysucceeded":
        return "failed";
      case "canceled":
      case "cancelled":
        return "canceled";
      case "skipped":
        return "skipped";
      default:
        return result;
    }
  }

  getBuildStatusClass(build: PipelineBuild): string {
    if (build.status === "completed") {
      return build.result === "succeeded" ? "succeeded" : "failed";
    }
    return "in-progress";
  }

  getStatusClass(status: string, result?: string): string {
    if (status === "completed") {
      return result === "succeeded" ? "succeeded" : "failed";
    }
    if (status === "inProgress") {
      return "in-progress";
    }
    return "not-started";
  }

  getStatusText(status: string, result?: string): string {
    if (status === "completed") {
      return result === "succeeded" ? "Succeeded" : "Failed";
    }
    if (status === "inProgress") {
      return "In Progress";
    }
    return "Not Started";
  }

  getStageStatusClass(stage: PipelineStage): string {
    if (stage.status === "completed") {
      return stage.result === "succeeded" ? "succeeded" : "failed";
    }
    if (stage.status === "inProgress") {
      return "in-progress";
    }
    return "";
  }

  getStageStatusText(stage: PipelineStage): string {
    if (stage.status === "completed") {
      return stage.result === "succeeded" ? "✓" : "✗";
    }
    if (stage.status === "inProgress") {
      return "⏳";
    }
    return "-";
  }

  getStageStatusFromBuild(build: PipelineBuild): string {
    if (build.status === "completed") {
      return build.result === "succeeded" ? "✓" : "✗";
    }
    if (build.status === "inProgress") {
      return "⏳";
    }
    return "-";
  }

  getBranchName(sourceBranch: string): string {
    return sourceBranch.replace("refs/heads/", "");
  }

  formatBuildTime(build: PipelineBuild): string {
    if (build.status === "completed" && build.startTime && build.finishTime) {
      const start = new Date(build.startTime);
      const finish = new Date(build.finishTime);
      const duration = Math.round(
        (finish.getTime() - start.getTime()) / 1000 / 60
      );
      return `${duration}m`;
    }
    if (build.status === "inProgress" && build.startTime) {
      const start = new Date(build.startTime);
      const now = new Date();
      const duration = Math.round(
        (now.getTime() - start.getTime()) / 1000 / 60
      );
      return `${duration}m (running)`;
    }
    return "";
  }

  getStageTime(stage: PipelineStage): string {
    if (stage.startTime && stage.finishTime) {
      const start = new Date(stage.startTime);
      const finish = new Date(stage.finishTime);
      const duration = Math.round(
        (finish.getTime() - start.getTime()) / 1000 / 60
      );
      return `${duration}m`;
    }
    if (stage.status === "inProgress" && stage.startTime) {
      const start = new Date(stage.startTime);
      const now = new Date();
      const duration = Math.round(
        (now.getTime() - start.getTime()) / 1000 / 60
      );
      return `${duration}m`;
    }
    return "";
  }

  getDefaultStageClass(build: PipelineBuild, stageName: string): string {
    if (stageName === "CI") {
      if (build.status === "completed") {
        return build.result === "succeeded" ? "succeeded" : "failed";
      }
      if (build.status === "inProgress") {
        return "in-progress";
      }
    }
    return "not-started";
  }

  getJobStatusClass(job: StageJob): string {
    switch (job.status) {
      case "completed":
        return job.result === "succeeded" ? "job-succeeded" : "job-failed";
      case "failed":
        return "job-failed";
      case "skipped":
        return "job-skipped";
      case "inProgress":
        return "job-in-progress";
      default:
        return "job-pending";
    }
  }

  getJobIcon(job: StageJob): string {
    switch (job.status) {
      case "completed":
        return job.result === "succeeded" ? "✓" : "✗";
      case "failed":
        return "✗";
      case "skipped":
        return "⏭";
      case "inProgress":
        return "⏳";
      default:
        return "⏸";
    }
  }

  getJobStatusText(job: StageJob): string {
    switch (job.status) {
      case "completed":
        return job.result === "succeeded" ? "Completed" : "Failed";
      case "failed":
        return "Failed";
      case "skipped":
        return "Skipped";
      case "inProgress":
        return "In Progress";
      default:
        return "Pending";
    }
  }

  getTaskIcon(task: TaskInfo): string {
    switch (task.status) {
      case "completed":
        return task.result === "succeeded" ? "✓" : "✗";
      case "failed":
        return "✗";
      case "skipped":
        return "⏭";
      case "inProgress":
        return "⏳";
      default:
        return "⏸";
    }
  }

  // Navigation methods
  onStageClick(build: PipelineBuild, stage: PipelineStage) {
    const stageUrl = this.getStageUrl(build, stage);
    if (stageUrl) {
      window.open(stageUrl, "_blank");
    }
  }

  onJobClick(build: PipelineBuild, stage: PipelineStage, job: StageJob) {
    const jobUrl = this.getJobUrl(build, stage, job);
    if (jobUrl) {
      window.open(jobUrl, "_blank");
    }
  }

  private getStageUrl(build: PipelineBuild, stage: PipelineStage): string {
    const projectName = encodeURIComponent(this.projectName);
    const buildId = build.id;
    const stageId = stage.details?.id || stage.name;

    // Azure DevOps URL format for build stages
    return `${AZURE_DEVOPS_CONFIG.baseUrl}/${AZURE_DEVOPS_CONFIG.organization}/${projectName}/_build/results?buildId=${buildId}&view=logs&j=${stageId}`;
  }

  private getJobUrl(
    build: PipelineBuild,
    stage: PipelineStage,
    job: StageJob
  ): string {
    const projectName = encodeURIComponent(this.projectName);
    const buildId = build.id;
    const jobId = job.details?.id || job.name;

    // Azure DevOps URL format for build jobs
    return `${AZURE_DEVOPS_CONFIG.baseUrl}/${AZURE_DEVOPS_CONFIG.organization}/${projectName}/_build/results?buildId=${buildId}&view=logs&j=${jobId}`;
  }

  // Helper methods for template
  getObjectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  getObjectKeysLength(obj: any): number {
    return obj ? Object.keys(obj).length : 0;
  }

  // Get failed steps/tasks from a stage
  getFailedSteps(
    stage: PipelineStage
  ): { jobName: string; failedTasks: TaskInfo[] }[] {
    if (!stage.jobs || stage.jobs.length === 0) {
      return [];
    }

    const failedSteps: { jobName: string; failedTasks: TaskInfo[] }[] = [];

    stage.jobs.forEach((job) => {
      if (job.details?.tasks && job.details.tasks.length > 0) {
        const failedTasks = job.details.tasks.filter(
          (task) =>
            task.status === "failed" ||
            (task.status === "completed" && task.result === "failed")
        );

        if (failedTasks.length > 0) {
          failedSteps.push({
            jobName: job.name,
            failedTasks: failedTasks,
          });
        }
      }
      // If no tasks but job itself failed, consider the job as a failed step
      else if (
        job.status === "failed" ||
        (job.status === "completed" && job.result === "failed")
      ) {
        failedSteps.push({
          jobName: job.name,
          failedTasks: [],
        });
      }
    });

    return failedSteps;
  }

  // Check if stage has failed
  stageHasFailed(stage: PipelineStage): boolean {
    return (
      stage.status === "failed" ||
      (stage.status === "completed" && stage.result === "failed") ||
      stage.result === "failed"
    );
  }
}

export interface PipelineBuild {
  id: number;
  buildNumber: string;
  status: string;
  result?: string;
  definition: {
    name: string;
    id: number;
  };
  startTime?: string;
  finishTime?: string;
  sourceBranch: string;
  stages?: PipelineStage[];
  queueTime?: string;
  url?: string;
}

export interface PipelineStage {
  name: string;
  status: string;
  result?: string;
  startTime?: string;
  finishTime?: string;
  order: number;
  jobs?: StageJob[];
  totalJobs?: number;
  completedJobs?: number;
  failedJobs?: number;
  skippedJobs?: number;
  details?: {
    id?: string;
    type?: string;
    state?: string;
    result?: string;
    percentComplete?: number;
    attempt?: number;
    queueId?: number;
    workerName?: string;
    previousAttempts?: any[];
    issues?: any[];
    errorCount?: number;
    warningCount?: number;
    changeId?: string;
    lastModified?: string;
    identifier?: string;
    parentId?: string;
    agentName?: string;
    log?: {
      id?: number;
      url?: string;
    };
    variables?: { [key: string]: any };
    environment?: {
      name?: string;
      id?: number;
    };
    refName?: string;
    requestedFor?: {
      displayName?: string;
      uniqueName?: string;
    };
  };
}

export interface StageJob {
  name: string;
  status: string; // 'completed', 'failed', 'skipped', 'inProgress'
  result?: string;
  startTime?: string;
  finishTime?: string;
  details?: {
    id?: string;
    type?: string;
    workerName?: string;
    queueId?: number;
    attempt?: number;
    order?: number;
    percentComplete?: number;
    tasks?: TaskInfo[];
    agentName?: string;
    poolName?: string;
    identifier?: string;
    parentId?: string;
    log?: {
      id?: number;
      url?: string;
    };
    variables?: { [key: string]: any };
    requestedFor?: {
      displayName?: string;
      uniqueName?: string;
    };
    previousAttempts?: any[];
    issues?: any[];
    changeId?: string;
    lastModified?: string;
  };
}

export interface TaskInfo {
  name: string;
  status: string;
  result?: string;
  startTime?: string;
  finishTime?: string;
  id?: string;
  order?: number;
  percentComplete?: number;
  logId?: string;
  logUrl?: string;
  issues?: any[];
  errorCount?: number;
  warningCount?: number;
  type?: string;
  identifier?: string;
  parentId?: string;
  agentName?: string;
  workerName?: string;
  attempt?: number;
  changeId?: string;
  lastModified?: string;
  task?: {
    id?: string;
    name?: string;
    version?: string;
  };
  variables?: { [key: string]: any };
  requestedFor?: {
    displayName?: string;
    uniqueName?: string;
  };
  previousAttempts?: any[];
}
