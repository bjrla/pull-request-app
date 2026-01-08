import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  DependencyComparisonService,
  DependencyComparison,
  ProjectPackageJson,
} from "../../services/dependency-comparison.service";
import * as XLSX from "xlsx";

interface TableRow {
  packageName: string;
  version: string;
  projects: string[];
  isFirstRow: boolean;
  rowspan: number;
  hasConflict: boolean;
}

@Component({
  selector: "app-dependency-comparison",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./dependency-comparison.component.html",
  styleUrls: ["./dependency-comparison.component.scss"],
})
export class DependencyComparisonComponent implements OnInit {
  dependencies: DependencyComparison[] = [];
  tableRows: TableRow[] = [];
  projects: ProjectPackageJson[] = [];
  showOnlyDifferences = true;
  searchTerm = "";
  sortDirection: "asc" | "desc" = "desc"; // Start with most conflicts first

  isAddingProject = false;
  newProjectName = "";
  newProjectPackageJson = "";
  addProjectError = "";

  private readonly colorPalette = [
    "#d13438",
    "#107c10",
    "#0078d4",
    "#ca5010",
    "#8764b8",
    "#00bcf2",
    "#498205",
    "#e74856",
    "#ff8c00",
    "#038387",
    "#744da9",
    "#486991",
    "#c239b3",
    "#567c73",
    "#f59e0b",
    "#10b981",
    "#3b82f6",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
  ];

  constructor(private dependencyService: DependencyComparisonService) {}

  ngOnInit(): void {
    this.loadDependencies();
  }

  loadDependencies(): void {
    this.projects = this.dependencyService.getProjects();

    if (this.showOnlyDifferences) {
      this.dependencies = this.dependencyService.getMultiVersionDependencies();
    } else {
      this.dependencies = this.dependencyService.getDependencyComparisons();
    }

    this.applySearch();
    this.applySorting();
    this.buildTableRows();
  }

  applySorting(): void {
    this.dependencies.sort((a, b) => {
      const aVersionCount = new Set(a.versions.map((v) => v.version)).size;
      const bVersionCount = new Set(b.versions.map((v) => v.version)).size;

      const diff = bVersionCount - aVersionCount;
      return this.sortDirection === "desc" ? diff : -diff;
    });
  }

  toggleSort(): void {
    this.sortDirection = this.sortDirection === "desc" ? "asc" : "desc";
    this.loadDependencies();
  }

  buildTableRows(): void {
    this.tableRows = [];

    this.dependencies.forEach((dep) => {
      const versions = this.getVersionsForPackage(dep);
      const hasConflict = this.hasMultipleVersions(dep);

      versions.forEach((version, index) => {
        this.tableRows.push({
          packageName: dep.packageName,
          version: version,
          projects: this.getProjectsForVersion(dep, version),
          isFirstRow: index === 0,
          rowspan: versions.length,
          hasConflict: hasConflict,
        });
      });
    });
  }

  toggleDifferenceFilter(): void {
    this.showOnlyDifferences = !this.showOnlyDifferences;
    this.loadDependencies();
  }

  applySearch(): void {
    if (!this.searchTerm.trim()) {
      return;
    }

    const search = this.searchTerm.toLowerCase();
    this.dependencies = this.dependencies.filter((dep) =>
      dep.packageName.toLowerCase().includes(search)
    );
  }

  onSearchChange(): void {
    this.loadDependencies();
  }

  openAddProjectModal(): void {
    this.isAddingProject = true;
    this.newProjectName = "";
    this.newProjectPackageJson = "";
    this.addProjectError = "";
  }

  closeAddProjectModal(): void {
    this.isAddingProject = false;
    this.newProjectName = "";
    this.newProjectPackageJson = "";
    this.addProjectError = "";
  }

  async addProject(): Promise<void> {
    this.addProjectError = "";

    if (!this.newProjectName.trim()) {
      this.addProjectError = "Project name is required";
      return;
    }

    if (!this.newProjectPackageJson.trim()) {
      this.addProjectError = "Package.json content is required";
      return;
    }

    try {
      await this.dependencyService.loadPackageJsonFromPath(
        this.newProjectName.trim(),
        this.newProjectPackageJson
      );
      this.closeAddProjectModal();
      this.loadDependencies();
    } catch (e: any) {
      this.addProjectError = e.message || "Failed to parse package.json";
    }
  }

  removeProject(projectPath: string): void {
    if (confirm("Are you sure you want to remove this project?")) {
      this.dependencyService.removeProject(projectPath);
      this.loadDependencies();
    }
  }

  getVersionsForPackage(dep: DependencyComparison): string[] {
    const uniqueVersions = new Set(dep.versions.map((v) => v.version));
    return Array.from(uniqueVersions).sort((a, b) => {
      // Simple version comparison
      const aParts = a.split(".").map((n) => parseInt(n) || 0);
      const bParts = b.split(".").map((n) => parseInt(n) || 0);

      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const diff = (bParts[i] || 0) - (aParts[i] || 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
  }

  getProjectsForVersion(dep: DependencyComparison, version: string): string[] {
    return dep.versions
      .filter((v) => v.version === version)
      .map((v) => v.projectName);
  }

  hasMultipleVersions(dep: DependencyComparison): boolean {
    const uniqueVersions = new Set(dep.versions.map((v) => v.version));
    return uniqueVersions.size > 1;
  }

  getProjectCount(): number {
    return this.projects.length;
  }

  getDependencyCount(): number {
    return this.dependencies.length;
  }

  getConflictCount(): number {
    return this.dependencies.filter((dep) => this.hasMultipleVersions(dep))
      .length;
  }

  getProjectColor(projectName: string): { background: string; color: string } {
    // Generate consistent index based on project name
    let hash = 0;
    for (let i = 0; i < projectName.length; i++) {
      hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % this.colorPalette.length;
    const baseColor = this.colorPalette[colorIndex];

    return {
      background: baseColor + "20", // 20 = 12.5% opacity in hex
      color: baseColor,
    };
  }

  exportToExcel(): void {
    if (this.dependencies.length === 0) {
      return;
    }

    // Prepare data for Excel
    const excelData: any[] = [];

    this.dependencies.forEach((dep) => {
      const versions = this.getVersionsForPackage(dep);
      versions.forEach((version, index) => {
        const projects = this.getProjectsForVersion(dep, version);
        excelData.push({
          Package: index === 0 ? dep.packageName : "",
          Version: version,
          Projects: projects.join(", "),
        });
      });
    });

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws["!cols"] = [
      { wch: 30 }, // Package column
      { wch: 15 }, // Version column
      { wch: 50 }, // Projects column
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dependencies");

    // Generate filename with current date
    const filename = `dependency-comparison-${
      new Date().toISOString().split("T")[0]
    }.xlsx`;

    // Save file
    XLSX.writeFile(wb, filename);
  }
}
