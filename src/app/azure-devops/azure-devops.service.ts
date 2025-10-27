import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders } from "@angular/common/http";
import {
  Observable,
  forkJoin,
  map,
  switchMap,
  catchError,
  of,
  Subject,
} from "rxjs";
import { AZURE_DEVOPS_CONFIG, ProjectConfig } from "./azure-devops.config";

export interface PullRequest {
  pullRequestId: number;
  title: string;
  description: string;
  status: string;
  createdBy: {
    displayName: string;
    uniqueName: string;
    _links?: {
      avatar?: {
        href: string;
      };
    };
  };
  creationDate: string;
  sourceRefName: string;
  targetRefName: string;
  repository: {
    name: string;
  };
  reviewers: any[];
  projectName?: string; // Add project name to identify which project the PR belongs to
  // Add comment/thread information
  threads?: PullRequestThread[];
  commentCount?: number;
  unresolvedCommentCount?: number;
  // Add merge and build information
  mergeStatus?: string; // 'succeeded', 'conflicts', 'queued', 'rejectedByPolicy', 'failure'
  isDraft?: boolean;
  builds?: BuildResult[];
  hasConflicts?: boolean;
  canMerge?: boolean;
}

export interface BuildResult {
  id: number;
  buildNumber: string;
  status: string; // 'completed', 'inProgress', 'postponed', 'notStarted', 'cancelling'
  result?: string; // 'succeeded', 'partiallySucceeded', 'failed', 'canceled'
  definition: {
    name: string;
    id: number;
  };
  startTime?: string;
  finishTime?: string;
  sourceBranch: string;
}

export interface PullRequestThread {
  id: number;
  status: string; // 'active', 'fixed', 'wontFix', 'closed', 'byDesign', 'pending'
  comments: PullRequestComment[];
  isDeleted: boolean;
  properties?: any;
}

export interface PullRequestComment {
  id: number;
  content: string;
  commentType: string; // 'text', 'codeChange', 'system'
  author: {
    displayName: string;
    uniqueName: string;
  };
  publishedDate: string;
  isDeleted: boolean;
}

export interface PullRequestResponse {
  value: PullRequest[];
  count: number;
}

export interface PullRequestSuggestion {
  type: string;
  properties: {
    sourceRepository: {
      id: string;
      name: string;
      url: string;
      project: {
        id: string;
        name: string;
        description: string;
        url: string;
        state: number;
        revision: number;
        visibility: number;
        lastUpdateTime: string;
      };
      size: number;
      remoteUrl: string;
      sshUrl: string;
      webUrl: string;
      isDisabled: boolean;
    };
    sourceBranch: string;
    targetRepositoryId: string;
    targetBranch: string;
    pushDate: string;
  };
}

export interface SuggestionsResponse {
  value?: PullRequestSuggestion[];
  count?: number;
}

@Injectable({
  providedIn: "root",
})
export class AzureDevOpsService {
  private config = AZURE_DEVOPS_CONFIG;
  private currentPAT: string = this.config.pat;

  // Authentication error handling
  private authErrorSubject = new Subject<string>();
  public authError$ = this.authErrorSubject.asObservable();

  constructor(private http: HttpClient) {}

  // Public method to update the current PAT
  updateCurrentPAT(pat: string): void {
    this.currentPAT = pat;
    console.log("AzureDevOpsService: PAT updated");
  }

  // Handle HTTP errors and emit authentication errors for all error responses
  private handleHttpError<T>(operation = "operation") {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed:`, error);

      // Emit error message for PAT prompt based on error status
      if (error.status === 401) {
        this.authErrorSubject.next(
          "Authentication failed. Your Personal Access Token may be invalid or expired. Please provide a valid PAT."
        );
      } else if (error.status === 403) {
        this.authErrorSubject.next(
          "Access forbidden. Your Personal Access Token may not have the required permissions. Please provide a valid PAT with proper scopes."
        );
      } else if (error.status === 0 || !error.status) {
        this.authErrorSubject.next(
          "Network error occurred. Please check your connection and Personal Access Token configuration."
        );
      } else {
        this.authErrorSubject.next(
          `Error occurred while fetching data (${error.status}). Please verify your Personal Access Token and configuration.`
        );
      }

      // Return empty result to prevent application crashes
      return of({} as T);
    };
  }

  getActivePullRequests(
    projects?: ProjectConfig[],
    personalAccessToken?: string
  ): Observable<PullRequestResponse> {
    // Use provided projects or fall back to config projects
    const projectsToUse = projects || this.config.projects;
    // Store the PAT for this request
    if (personalAccessToken) {
      this.currentPAT = personalAccessToken;
    }

    // Safety check - ensure we have projects to process
    if (!projectsToUse || projectsToUse.length === 0) {
      console.warn("No projects configured for pull request fetching");
      return of({ value: [], count: 0 });
    }

    // Get pull requests from all projects
    const requests = projectsToUse.map((projectConfig) => {
      // Safety check for project config
      if (!projectConfig || !projectConfig.name) {
        console.warn("Invalid project config:", projectConfig);
        return of({ value: [], count: 0 });
      }

      // Check if specific repository is configured
      if (projectConfig.repository) {
        return this.getActivePullRequestsByRepoWithThreads(
          projectConfig.name,
          projectConfig.repository
        );
      }
      // For projects without specific repository, get all PRs
      return this.getActivePullRequestsFromProjectWithThreads(
        projectConfig.name
      );
    });

    return forkJoin(requests).pipe(
      map((responses) => {
        // Combine all pull requests from different projects
        const allPullRequests: PullRequest[] = [];
        responses.forEach((response, index) => {
          // Safety checks
          if (index >= projectsToUse.length || !projectsToUse[index]) {
            console.warn(
              `Invalid project index ${index} or missing project config`
            );
            return;
          }

          const projectName = projectsToUse[index].name;
          if (!response || !response.value) {
            console.warn(
              `Invalid response for project ${projectName}:`,
              response
            );
            return;
          }

          response.value.forEach((pr) => {
            if (pr) {
              pr.projectName = projectName;
              allPullRequests.push(pr);
            }
          });
        });

        return {
          value: allPullRequests,
          count: allPullRequests.length,
        };
      }),
      catchError(
        this.handleHttpError<PullRequestResponse>("getActivePullRequests")
      )
    );
  }

  private getActivePullRequestsFromProject(
    project: string
  ): Observable<PullRequestResponse> {
    const url = `${this.config.baseUrl}/${this.config.organization}/${project}/_apis/git/pullrequests?searchCriteria.status=active&api-version=7.0`;

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
    });

    return this.http.get<PullRequestResponse>(url, { headers }).pipe(
      catchError((error) => {
        console.error(`Error fetching PRs from project ${project}:`, error);
        // Use the centralized error handler for 401 detection
        return this.handleHttpError<PullRequestResponse>(
          "getActivePullRequestsFromProject"
        )(error);
      })
    );
  }

  getActivePullRequestsByRepo(
    project: string,
    repositoryId: string
  ): Observable<PullRequestResponse> {
    const url = `${this.config.baseUrl}/${this.config.organization}/${project}/_apis/git/repositories/${repositoryId}/pullrequests?searchCriteria.status=active&api-version=7.0`;

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
    });

    return this.http.get<PullRequestResponse>(url, { headers }).pipe(
      catchError((error) => {
        console.error(
          `Error fetching PRs from repository ${repositoryId} in project ${project}:`,
          error
        );
        // Use the centralized error handler for 401 detection
        return this.handleHttpError<PullRequestResponse>(
          "getActivePullRequestsByRepo"
        )(error);
      })
    );
  }

  private getPullRequestThreads(
    project: string,
    repositoryId: string,
    pullRequestId: number
  ): Observable<{ value: PullRequestThread[] }> {
    const url = `${this.config.baseUrl}/${this.config.organization}/${project}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads?api-version=7.0`;

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
    });

    return this.http
      .get<{ value: PullRequestThread[] }>(url, { headers })
      .pipe(
        catchError(
          this.handleHttpError<{ value: PullRequestThread[] }>(
            "getPullRequestThreads"
          )
        )
      );
  }

  private getActivePullRequestsFromProjectWithThreads(
    project: string
  ): Observable<PullRequestResponse> {
    return this.getActivePullRequestsFromProject(project).pipe(
      switchMap((response) => {
        // Handle empty response
        if (!response.value || response.value.length === 0) {
          return of({
            value: [],
            count: 0,
          });
        }

        // Fetch threads for each PR
        const threadRequests = response.value.map((pr: PullRequest) => {
          // Fetch threads, builds, and detailed merge status for each PR
          const threadsReq = this.getPullRequestThreads(
            project,
            pr.repository.name,
            pr.pullRequestId
          );
          const buildsReq = this.getPullRequestBuildsFromTimeline(
            project,
            pr.repository.name,
            pr.pullRequestId
          ).pipe(
            catchError(() =>
              this.getPullRequestBuilds(
                project,
                pr.repository.name,
                pr.sourceRefName
              )
            )
          );
          const mergeStatusReq = this.getPullRequestMergeStatus(
            project,
            pr.repository.name,
            pr.pullRequestId
          );

          return forkJoin({
            threads: threadsReq,
            builds: buildsReq,
            mergeStatus: mergeStatusReq,
          }).pipe(
            map(({ threads, builds, mergeStatus }) => {
              return {
                ...pr,
                threads: threads.value,
                builds: builds.value,
                commentCount: threads.value.reduce(
                  (count, thread) =>
                    count +
                    thread.comments.filter(
                      (c) => !c.isDeleted && c.commentType !== "system"
                    ).length,
                  0
                ),
                unresolvedCommentCount: threads.value.filter(
                  (thread) => !thread.isDeleted && thread.status === "active"
                ).length,
                mergeStatus: mergeStatus.mergeStatus,
                isDraft: mergeStatus.isDraft,
                hasConflicts: mergeStatus.mergeStatus === "conflicts",
                canMerge: mergeStatus.mergeStatus === "succeeded",
              };
            }),
            catchError((error) => {
              console.error(
                `Error fetching data for PR ${pr.pullRequestId}:`,
                error
              );
              return of({
                ...pr,
                threads: [],
                builds: [],
                commentCount: 0,
                unresolvedCommentCount: 0,
                mergeStatus: "unknown",
                isDraft: false,
                hasConflicts: false,
                canMerge: false,
              });
            })
          );
        });

        return forkJoin(threadRequests).pipe(
          map((prsWithThreads) => ({
            value: prsWithThreads,
            count: prsWithThreads.length,
          }))
        );
      })
    );
  }

  private getActivePullRequestsByRepoWithThreads(
    project: string,
    repositoryId: string
  ): Observable<PullRequestResponse> {
    return this.getActivePullRequestsByRepo(project, repositoryId).pipe(
      switchMap((response) => {
        // Handle empty response
        if (!response.value || response.value.length === 0) {
          return of({
            value: [],
            count: 0,
          });
        }

        // Fetch threads, builds, and merge status for each PR
        const threadRequests = response.value.map((pr: PullRequest) => {
          // Fetch threads, builds, and detailed merge status for each PR
          const threadsReq = this.getPullRequestThreads(
            project,
            repositoryId,
            pr.pullRequestId
          );
          const buildsReq = this.getPullRequestBuildsFromTimeline(
            project,
            repositoryId,
            pr.pullRequestId
          ).pipe(
            catchError(() =>
              this.getPullRequestBuilds(project, repositoryId, pr.sourceRefName)
            )
          );
          const mergeStatusReq = this.getPullRequestMergeStatus(
            project,
            repositoryId,
            pr.pullRequestId
          );

          return forkJoin({
            threads: threadsReq,
            builds: buildsReq,
            mergeStatus: mergeStatusReq,
          }).pipe(
            map(({ threads, builds, mergeStatus }) => {
              return {
                ...pr,
                threads: threads.value,
                builds: builds.value,
                commentCount: threads.value.reduce(
                  (count, thread) =>
                    count +
                    thread.comments.filter(
                      (c) => !c.isDeleted && c.commentType !== "system"
                    ).length,
                  0
                ),
                unresolvedCommentCount: threads.value.filter(
                  (thread) => !thread.isDeleted && thread.status === "active"
                ).length,
                mergeStatus: mergeStatus.mergeStatus,
                isDraft: mergeStatus.isDraft,
                hasConflicts: mergeStatus.mergeStatus === "conflicts",
                canMerge: mergeStatus.mergeStatus === "succeeded",
              };
            }),
            catchError((error) => {
              console.error(
                `Error fetching data for PR ${pr.pullRequestId} (repo-specific):`,
                error
              );
              return of({
                ...pr,
                threads: [],
                builds: [],
                commentCount: 0,
                unresolvedCommentCount: 0,
                mergeStatus: "unknown",
                isDraft: false,
                hasConflicts: false,
                canMerge: false,
              });
            })
          );
        });

        return forkJoin(threadRequests).pipe(
          map((prsWithThreads) => ({
            value: prsWithThreads,
            count: prsWithThreads.length,
          }))
        );
      })
    );
  }

  // Method to fetch threads for a specific PR (can be called individually)
  getPullRequestThreadsForPR(
    project: string,
    repositoryId: string,
    pullRequestId: number
  ): Observable<PullRequestThread[]> {
    return this.getPullRequestThreads(
      project,
      repositoryId,
      pullRequestId
    ).pipe(map((response) => response.value));
  }

  private getPullRequestBuilds(
    project: string,
    repositoryId: string,
    sourceRefName: string
  ): Observable<{ value: BuildResult[] }> {
    // Get builds for the source branch
    const branchName = sourceRefName.replace("refs/heads/", "");

    // Try multiple API endpoints to get builds
    // First, try to get builds for the specific branch
    const buildsByBranchUrl = `${this.config.baseUrl}/${
      this.config.organization
    }/${project}/_apis/build/builds?branchName=${encodeURIComponent(
      sourceRefName
    )}&$top=10&api-version=7.0`;

    // Alternative: get builds by repository and filter
    const buildsByRepoUrl = `${this.config.baseUrl}/${this.config.organization}/${project}/_apis/build/builds?repositoryId=${repositoryId}&$top=20&api-version=7.0`;

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
    });

    // Try the branch-specific API first, fall back to repository builds if needed
    return this.http
      .get<{ value: BuildResult[] }>(buildsByBranchUrl, {
        headers,
      })
      .pipe(
        catchError((error) => {
          console.warn(
            `Failed to get builds by branch for ${branchName}:`,
            error
          );
          // Use centralized error handler for 401 detection
          return this.handleHttpError<{ value: BuildResult[] }>(
            "getPullRequestBuilds-branch"
          )(error);
        })
      );
  }

  // Alternative method to get PR-specific builds using the PR timeline
  private getPullRequestBuildsFromTimeline(
    project: string,
    repositoryId: string,
    pullRequestId: number
  ): Observable<{ value: BuildResult[] }> {
    const timelineUrl = `${this.config.baseUrl}/${this.config.organization}/${project}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/statuses?api-version=7.0`;

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
    });

    return this.http.get<{ value: any[] }>(timelineUrl, { headers }).pipe(
      map((response) => {
        // Extract build information from PR statuses
        const builds = response.value
          .filter(
            (status) =>
              status.context &&
              status.context.genre === "continuous-integration"
          )
          .map((status) => ({
            id: parseInt(status.id) || 0,
            buildNumber: status.context?.name || "Unknown",
            status: this.mapStatusToBuildStatus(status.state),
            result: this.mapStatusToBuildResult(status.state),
            definition: {
              name: status.context?.name || "Unknown Build",
              id: parseInt(status.id) || 0,
            },
            startTime: status.creationDate,
            finishTime: status.updatedDate,
            sourceBranch: "",
          }));

        return { value: builds };
      }),
      catchError((error) => {
        console.warn(
          `Failed to get PR builds from timeline for PR ${pullRequestId}:`,
          error
        );
        return this.handleHttpError<{ value: BuildResult[] }>(
          "getPullRequestBuildsFromTimeline"
        )(error);
      })
    );
  }

  private mapStatusToBuildStatus(state: string): string {
    switch (state?.toLowerCase()) {
      case "succeeded":
      case "failed":
      case "error":
        return "completed";
      case "pending":
        return "inProgress";
      case "notset":
        return "notStarted";
      default:
        return "notStarted";
    }
  }

  private mapStatusToBuildResult(state: string): string | undefined {
    switch (state?.toLowerCase()) {
      case "succeeded":
        return "succeeded";
      case "failed":
      case "error":
        return "failed";
      case "pending":
        return undefined;
      default:
        return undefined;
    }
  }

  private getPullRequestMergeStatus(
    project: string,
    repositoryId: string,
    pullRequestId: number
  ): Observable<any> {
    const url = `${this.config.baseUrl}/${this.config.organization}/${project}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}?api-version=7.0`;

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
    });

    return this.http
      .get<any>(url, { headers })
      .pipe(catchError(this.handleHttpError<any>("getPullRequestMergeStatus")));
  }

  // Method to fetch pipeline builds for a specific definition
  getPipelineBuilds(
    project: string,
    definitionId: number,
    count: number = 20,
    branchName?: string
  ): Observable<{ value: BuildResult[] }> {
    let url = `${this.config.baseUrl}/${this.config.organization}/${project}/_apis/build/builds?definitions=${definitionId}&$top=${count}&api-version=7.0`;

    // Add branch filter if specified
    if (branchName) {
      url += `&branchName=${encodeURIComponent(branchName)}`;
    }

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
    });

    return this.http
      .get<{ value: BuildResult[] }>(url, { headers })
      .pipe(
        catchError(
          this.handleHttpError<{ value: BuildResult[] }>("getPipelineBuilds")
        )
      );
  }

  // Method to fetch pipeline runs with stages for a specific definition
  getPipelineRuns(
    project: string,
    definitionId: number,
    count: number = 20
  ): Observable<{ value: any[] }> {
    const url = `${this.config.baseUrl}/${this.config.organization}/${project}/_apis/pipelines/${definitionId}/runs?$top=${count}&api-version=7.0`;

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
    });

    return this.http
      .get<{ value: any[] }>(url, { headers })
      .pipe(
        catchError(this.handleHttpError<{ value: any[] }>("getPipelineRuns"))
      );
  }

  // Method to fetch timeline for a specific build (to get stage information)
  getBuildTimeline(project: string, buildId: number): Observable<any> {
    const url = `${this.config.baseUrl}/${this.config.organization}/${project}/_apis/build/builds/${buildId}/timeline?api-version=7.0`;

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
    });

    return this.http
      .get<any>(url, { headers })
      .pipe(catchError(this.handleHttpError<any>("getBuildTimeline")));
  }

  // Method to get pull request suggestions (branches that can create PRs)
  getPullRequestSuggestions(
    projects?: ProjectConfig[],
    personalAccessToken?: string
  ): Observable<PullRequestSuggestion[]> {
    const projectsToUse = projects || this.config.projects;
    if (personalAccessToken) {
      this.currentPAT = personalAccessToken;
    }

    if (!projectsToUse || projectsToUse.length === 0) {
      console.warn("No projects configured for PR suggestions");
      return of([]);
    }

    const requests = projectsToUse.map((projectConfig) => {
      if (!projectConfig || !projectConfig.name) {
        console.warn("Invalid project config:", projectConfig);
        return of([]);
      }

      if (projectConfig.repository) {
        // First get the repository ID from the repository name
        return this.getRepositoryId(
          projectConfig.name,
          projectConfig.repository
        ).pipe(
          switchMap((repositoryId) => {
            if (repositoryId) {
              return this.getPullRequestSuggestionsForRepository(
                projectConfig.name,
                repositoryId
              );
            }
            return of([]);
          })
        );
      }
      // For projects without specific repository, skip for now
      return of([]);
    });

    return forkJoin(requests).pipe(
      map((responses) => {
        const allSuggestions: PullRequestSuggestion[] = [];
        responses.forEach((suggestions) => {
          allSuggestions.push(...suggestions);
        });
        return allSuggestions;
      }),
      catchError(
        this.handleHttpError<PullRequestSuggestion[]>(
          "getPullRequestSuggestions"
        )
      )
    );
  }

  private getRepositoryId(
    project: string,
    repositoryName: string
  ): Observable<string | null> {
    const url = `${this.config.baseUrl}/${this.config.organization}/${project}/_apis/git/repositories?api-version=7.0`;

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
    });

    return this.http.get<{ value: any[] }>(url, { headers }).pipe(
      map((response) => {
        const repo = response.value?.find((r) => r.name === repositoryName);
        return repo ? repo.id : null;
      }),
      catchError((error) => {
        console.error(
          `Error fetching repository ID for ${repositoryName} in project ${project}:`,
          error
        );
        return this.handleHttpError<string | null>("getRepositoryId")(error);
      })
    );
  }

  private getPullRequestSuggestionsForRepository(
    project: string,
    repositoryId: string
  ): Observable<PullRequestSuggestion[]> {
    const url = `${this.config.baseUrl}/${this.config.organization}/_apis/git/repositories/${repositoryId}/suggestions?api-version=5.0-preview.1`;

    const headers = new HttpHeaders({
      Authorization: `Basic ${btoa(":" + this.currentPAT)}`,
      "Content-Type": "application/json",
      Accept:
        "application/json;api-version=5.0-preview.1;excludeUrls=true;enumsAsNumbers=true;msDateFormat=true;noArrayWrap=true",
    });

    return this.http.get<PullRequestSuggestion[]>(url, { headers }).pipe(
      map((suggestions) => {
        // The response is directly an array of suggestions
        if (!suggestions || !Array.isArray(suggestions)) {
          return [];
        }

        return suggestions;
      }),
      catchError((error) => {
        console.error(
          `Error fetching PR suggestions from repository ${repositoryId} in project ${project}:`,
          error
        );
        return this.handleHttpError<PullRequestSuggestion[]>(
          "getPullRequestSuggestionsForRepository"
        )(error);
      })
    );
  }
}
