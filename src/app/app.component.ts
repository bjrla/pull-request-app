import { Component, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterOutlet } from "@angular/router";
import { ManageProjectsModalComponent } from "./components/add-project-modal/add-project-modal.component";
import { ProjectConfig } from "./azure-devops/azure-devops.config";
import { ConfigStorageService } from "./services/config-storage.service";
import { Subscription } from "rxjs";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, RouterOutlet, ManageProjectsModalComponent],
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnDestroy {
  title = "pull-request-overview";

  // Project and PAT management
  isManageProjectsModalOpen = false;
  currentProjects: ProjectConfig[] = [];
  currentPAT: string = "";

  private subscriptions = new Subscription();

  constructor(
    private router: Router,
    private configStorageService: ConfigStorageService
  ) {
    // Subscribe to configuration changes
    this.subscriptions.add(
      this.configStorageService.projects$.subscribe((projects) => {
        this.currentProjects = projects;
      })
    );

    this.subscriptions.add(
      this.configStorageService.pat$.subscribe((pat) => {
        this.currentPAT = pat;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
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

  // Project management methods - now using ConfigStorageService
  onProjectsUpdated(projects: ProjectConfig[]): void {
    this.configStorageService.updateProjects(projects);
  }

  onProjectAdded(project: ProjectConfig): void {
    this.configStorageService.addProject(project);
  }

  onProjectRemoved(projectName: string): void {
    this.configStorageService.removeProject(projectName);
  }

  onPATUpdated(pat: string): void {
    this.configStorageService.updatePAT(pat);
  }
}
