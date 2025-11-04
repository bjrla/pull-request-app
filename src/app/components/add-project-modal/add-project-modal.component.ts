import {
  Component,
  Output,
  EventEmitter,
  Input,
  OnInit,
  OnChanges,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ProjectConfig } from "../../azure-devops/azure-devops.config";
import { ConfigStorageService } from "../../services/config-storage.service";

@Component({
  selector: "app-manage-projects-modal",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./add-project-modal.component.html",
  styleUrl: "./add-project-modal.component.scss",
})
export class ManageProjectsModalComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() currentProjects: ProjectConfig[] = [];
  @Output() closeModal = new EventEmitter<void>();
  @Output() projectAdded = new EventEmitter<ProjectConfig>();
  @Output() projectRemoved = new EventEmitter<string>();
  @Output() patUpdated = new EventEmitter<string>();
  @Output() projectsReordered = new EventEmitter<ProjectConfig[]>();

  projectName = "";
  currentPAT = "";
  betaFeaturesEnabled = false;

  constructor(private configService: ConfigStorageService) {}

  repositoryName = "";
  repositoryUrl = "";
  personalAccessToken = "";

  // Drag and drop properties
  draggedIndex: number = -1;
  dropIndicatorIndex: number = -1;

  onSubmit() {
    if (this.repositoryUrl.trim()) {
      const extractedProject = this.extractProjectFromUrl(
        this.repositoryUrl.trim()
      );
      if (extractedProject) {
        this.projectAdded.emit(extractedProject);
        this.resetForm();
        // Don't close modal automatically - let user add more projects if needed
      }
    }
  }

  private extractProjectFromUrl(url: string): ProjectConfig | null {
    try {
      // Expected format: https://azuredevops.danskenet.net/Main/X5K8-Regular-Transfers/_git/X5K8.RegularTransfers.WebApp
      // Pattern: https://[domain]/[org]/[project]/_git/[repo]
      const urlPattern = /https:\/\/[^\/]+\/[^\/]+\/([^\/]+)\/_git\/([^\/]+)/;
      const match = url.match(urlPattern);

      if (match && match[1] && match[2]) {
        const projectName = match[1];
        const repositoryName = match[2];

        return {
          name: projectName,
          repository: repositoryName,
        };
      } else {
        alert(
          "Invalid Azure DevOps repository URL format. Expected format:\nhttps://azuredevops.danskenet.net/Main/ProjectName/_git/RepositoryName"
        );
        return null;
      }
    } catch (error) {
      alert("Error parsing repository URL. Please check the format.");
      return null;
    }
  }

  onRemoveProject(projectName: string) {
    if (
      confirm(`Are you sure you want to remove the project "${projectName}"?`)
    ) {
      this.projectRemoved.emit(projectName);
    }
  }

  onToggleProjectVisibility(projectName: string) {
    const updatedProjects = this.currentProjects.map((project) => {
      if (project.name === projectName) {
        return { ...project, hidden: !project.hidden };
      }
      return project;
    });
    this.projectsReordered.emit(updatedProjects);
  }

  onUpdatePAT() {
    if (this.personalAccessToken.trim()) {
      // Update via ConfigStorageService instead of emitting event
      this.configService.updatePAT(this.personalAccessToken.trim());
    }
  }

  ngOnInit() {
    // Get current PAT value from service when component initializes
    this.currentPAT = this.configService.currentPAT;
    this.personalAccessToken = this.currentPAT;
    this.betaFeaturesEnabled = this.configService.currentBetaFeaturesEnabled;
  }

  ngOnChanges() {
    // Update PAT and beta features when modal opens
    if (this.isOpen) {
      this.currentPAT = this.configService.currentPAT;
      this.personalAccessToken = this.currentPAT;
      this.betaFeaturesEnabled = this.configService.currentBetaFeaturesEnabled;
    }
  }

  onCancel() {
    this.resetForm();
    this.closeModal.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }

  onToggleBetaFeatures() {
    this.betaFeaturesEnabled = !this.betaFeaturesEnabled;
    this.configService.updateBetaFeaturesEnabled(this.betaFeaturesEnabled);
  }

  private resetForm() {
    this.projectName = "";
    this.repositoryName = "";
    this.repositoryUrl = "";
    // Reset PAT to current value when canceling
    this.personalAccessToken = this.currentPAT;
    // Reset beta features to current value when canceling
    this.betaFeaturesEnabled = this.configService.currentBetaFeaturesEnabled;
  }

  // Drag and drop methods
  onDragStart(event: DragEvent, index: number) {
    this.draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/html", "");
    }
  }

  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    // Show drop indicator at the appropriate position
    if (this.draggedIndex !== -1 && this.draggedIndex !== index) {
      this.dropIndicatorIndex = index;
    }
  }

  onDragLeave(event: DragEvent) {
    // Only hide indicator if we're truly leaving the drop zone
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const isLeavingElement =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (isLeavingElement) {
      this.dropIndicatorIndex = -1;
    }
  }

  onDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();

    if (this.draggedIndex !== -1 && this.draggedIndex !== dropIndex) {
      const newProjects = [...this.currentProjects];
      const draggedProject = newProjects[this.draggedIndex];

      // Remove the dragged item
      newProjects.splice(this.draggedIndex, 1);

      // Insert at new position (adjust index if needed)
      const insertIndex =
        this.draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
      newProjects.splice(insertIndex, 0, draggedProject);

      // Emit the reordered projects
      this.projectsReordered.emit(newProjects);
    }

    this.draggedIndex = -1;
    this.dropIndicatorIndex = -1;
  }

  onDragEnd() {
    this.draggedIndex = -1;
    this.dropIndicatorIndex = -1;
  }
}
