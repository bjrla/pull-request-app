import { Injectable } from "@angular/core";

export interface DependencyVersion {
  projectName: string;
  version: string;
  projectPath?: string;
}

export interface DependencyComparison {
  packageName: string;
  versions: DependencyVersion[];
}

export interface ProjectPackageJson {
  projectName: string;
  projectPath: string;
  dependencies?: { [key: string]: string };
  devDependencies?: { [key: string]: string };
}

@Injectable({
  providedIn: "root",
})
export class DependencyComparisonService {
  private projects: ProjectPackageJson[] = [];

  constructor() {
    this.loadProjectsFromStorage();
  }

  addProject(project: ProjectPackageJson): void {
    // Remove existing project with same path
    this.projects = this.projects.filter(
      (p) => p.projectPath !== project.projectPath
    );
    this.projects.push(project);
    this.saveProjectsToStorage();
  }

  removeProject(projectPath: string): void {
    this.projects = this.projects.filter((p) => p.projectPath !== projectPath);
    this.saveProjectsToStorage();
  }

  getProjects(): ProjectPackageJson[] {
    return this.projects;
  }

  getDependencyComparisons(): DependencyComparison[] {
    const dependencyMap = new Map<string, DependencyVersion[]>();

    // Collect all dependencies from all projects
    this.projects.forEach((project) => {
      const allDeps = {
        ...project.dependencies,
        ...project.devDependencies,
      };

      Object.entries(allDeps).forEach(([packageName, version]) => {
        if (!dependencyMap.has(packageName)) {
          dependencyMap.set(packageName, []);
        }

        dependencyMap.get(packageName)!.push({
          projectName: project.projectName,
          version: this.cleanVersion(version),
          projectPath: project.projectPath,
        });
      });
    });

    // Convert map to array and sort
    const comparisons: DependencyComparison[] = Array.from(
      dependencyMap.entries()
    )
      .map(([packageName, versions]) => ({
        packageName,
        versions: this.sortVersions(versions),
      }))
      .sort((a, b) => a.packageName.localeCompare(b.packageName));

    return comparisons;
  }

  getMultiVersionDependencies(): DependencyComparison[] {
    return this.getDependencyComparisons().filter((dep) => {
      // Get unique versions
      const uniqueVersions = new Set(dep.versions.map((v) => v.version));
      return uniqueVersions.size > 1;
    });
  }

  private cleanVersion(version: string): string {
    // Remove ^ ~ and other version prefixes
    return version.replace(/^[\^~>=<\s]+/, "");
  }

  private sortVersions(versions: DependencyVersion[]): DependencyVersion[] {
    return versions.sort((a, b) => {
      // Sort by version descending, then by project name
      const versionCompare = this.compareVersions(b.version, a.version);
      if (versionCompare !== 0) return versionCompare;
      return a.projectName.localeCompare(b.projectName);
    });
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split(".").map((p) => parseInt(p) || 0);
    const parts2 = v2.split(".").map((p) => parseInt(p) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      if (part1 !== part2) return part1 - part2;
    }
    return 0;
  }

  private saveProjectsToStorage(): void {
    localStorage.setItem("dependencyProjects", JSON.stringify(this.projects));
  }

  private loadProjectsFromStorage(): void {
    const stored = localStorage.getItem("dependencyProjects");
    if (stored) {
      try {
        this.projects = JSON.parse(stored);
      } catch (e) {
        console.error("Failed to load projects from storage:", e);
        this.projects = [];
      }
    }
  }

  async loadPackageJsonFromPath(
    projectName: string,
    packageJsonContent: string
  ): Promise<void> {
    try {
      const packageJson = JSON.parse(packageJsonContent);
      this.addProject({
        projectName,
        projectPath: projectName, // Using project name as path for now
        dependencies: packageJson.dependencies || {},
        devDependencies: packageJson.devDependencies || {},
      });
    } catch (e) {
      throw new Error("Invalid package.json format");
    }
  }
}
