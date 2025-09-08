import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";
import {
  AZURE_DEVOPS_CONFIG,
  ProjectConfig,
} from "../azure-devops/azure-devops.config";
import { AzureDevOpsService } from "../azure-devops/azure-devops.service";

@Injectable({
  providedIn: "root",
})
export class ConfigStorageService {
  private readonly PROJECTS_STORAGE_KEY = "azure-devops-projects";
  private readonly PAT_STORAGE_KEY = "azure-devops-pat";

  // Reactive streams for projects and PAT
  private _projects$ = new BehaviorSubject<ProjectConfig[]>([]);
  private _pat$ = new BehaviorSubject<string>("");

  // Inject AzureDevOpsService to automatically update PAT
  private azureDevOpsService = inject(AzureDevOpsService);

  constructor() {
    this.initializeFromStorage();

    // Subscribe to PAT changes to automatically update the Azure DevOps service
    this._pat$.subscribe((pat) => {
      if (pat) {
        this.azureDevOpsService.updateCurrentPAT(pat);
      }
    });
  }

  // Observables for components to subscribe to
  get projects$(): Observable<ProjectConfig[]> {
    return this._projects$.asObservable();
  }

  get pat$(): Observable<string> {
    return this._pat$.asObservable();
  }

  // Getters for current values
  get currentProjects(): ProjectConfig[] {
    return this._projects$.value;
  }

  get currentPAT(): string {
    return this._pat$.value;
  }

  // Initialize from localStorage
  private initializeFromStorage(): void {
    this.loadProjectsFromStorage();
    this.loadPATFromStorage();
  }

  private loadProjectsFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.PROJECTS_STORAGE_KEY);
      if (stored) {
        const projects = JSON.parse(stored);
        this._projects$.next(projects);
      } else {
        this._projects$.next(AZURE_DEVOPS_CONFIG.projects);
      }
    } catch (error) {
      console.error(
        "ConfigStorageService: Error loading projects from storage:",
        error
      );
      this._projects$.next(AZURE_DEVOPS_CONFIG.projects);
    }
  }

  private loadPATFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.PAT_STORAGE_KEY);
      if (stored) {
        this._pat$.next(stored);
      } else {
        this._pat$.next(AZURE_DEVOPS_CONFIG.pat);
      }
    } catch (error) {
      console.error(
        "ConfigStorageService: Error loading PAT from storage:",
        error
      );
      this._pat$.next(AZURE_DEVOPS_CONFIG.pat);
    }
  }

  // Update methods
  updateProjects(projects: ProjectConfig[]): void {
    try {
      localStorage.setItem(this.PROJECTS_STORAGE_KEY, JSON.stringify(projects));
      this._projects$.next(projects);
    } catch (error) {
      console.error(
        "ConfigStorageService: Error saving projects to storage:",
        error
      );
    }
  }

  updatePAT(pat: string): void {
    try {
      localStorage.setItem(this.PAT_STORAGE_KEY, pat);
      this._pat$.next(pat);
    } catch (error) {
      console.error(
        "ConfigStorageService: Error saving PAT to storage:",
        error
      );
    }
  }

  // Individual project operations
  addProject(project: ProjectConfig): void {
    const currentProjects = [...this.currentProjects];
    currentProjects.push(project);
    this.updateProjects(currentProjects);
  }

  removeProject(projectName: string): void {
    const currentProjects = this.currentProjects.filter(
      (p) => p.name !== projectName
    );
    this.updateProjects(currentProjects);
  }

  reorderProjects(projects: ProjectConfig[]): void {
    this.updateProjects(projects);
  }

  // Check if configuration is valid
  isConfigured(): boolean {
    return this.currentProjects.length > 0 && this.currentPAT.length > 0;
  }

  hasProjects(): boolean {
    return this.currentProjects.length > 0;
  }

  hasPAT(): boolean {
    return this.currentPAT.length > 0;
  }
}
