import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterOutlet } from "@angular/router";
import { ManageProjectsModalComponent } from "./components/add-project-modal/add-project-modal.component";
import {
  AZURE_DEVOPS_CONFIG,
  ProjectConfig,
} from "./azure-devops/azure-devops.config";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, ManageProjectsModalComponent],
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
})
export class AppComponent {
  title = "pull-request-overview";

  // Project and PAT management
  isManageProjectsModalOpen = false;
  currentProjects: ProjectConfig[] = [];
  currentPAT: string = "";

  private readonly PROJECTS_STORAGE_KEY = "azure-devops-projects";
  private readonly PAT_STORAGE_KEY = "azure-devops-pat";

  constructor(private router: Router) {
    this.loadProjectsFromStorage();
    this.loadPATFromStorage();
  }

  // Navigation methods
  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  isActiveRoute(route: string): boolean {
    return this.router.url === `/${route}`;
  }

  // Project management modal
  openManageProjectsModal(): void {
    this.isManageProjectsModalOpen = true;
  }

  closeManageProjectsModal(): void {
    this.isManageProjectsModalOpen = false;
  }

  // Project management methods
  onProjectsUpdated(projects: ProjectConfig[]): void {
    this.currentProjects = projects;
    this.saveProjectsToStorage();
  }

  onProjectAdded(project: ProjectConfig): void {
    this.currentProjects.push(project);
    this.saveProjectsToStorage();
  }

  onProjectRemoved(projectName: string): void {
    const index = this.currentProjects.findIndex((p) => p.name === projectName);
    if (index > -1) {
      this.currentProjects.splice(index, 1);
      this.saveProjectsToStorage();
    }
  }

  onPATUpdated(pat: string): void {
    this.currentPAT = pat;
    this.savePATToStorage();
  }

  private loadProjectsFromStorage() {
    try {
      const stored = localStorage.getItem(this.PROJECTS_STORAGE_KEY);
      if (stored) {
        this.currentProjects = JSON.parse(stored);
      } else {
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
      } else {
        this.currentPAT = AZURE_DEVOPS_CONFIG.pat;
      }
    } catch (error) {
      console.error("Error loading PAT from storage:", error);
      this.currentPAT = AZURE_DEVOPS_CONFIG.pat;
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

  private savePATToStorage() {
    try {
      localStorage.setItem(this.PAT_STORAGE_KEY, this.currentPAT);
    } catch (error) {
      console.error("Error saving PAT to storage:", error);
    }
  }
}
