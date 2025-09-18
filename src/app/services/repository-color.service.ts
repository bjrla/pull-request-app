import { Injectable } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class RepositoryColorService {
  // Repository color mapping
  private repositoryColors = new Map<string, string>();
  private colorIndex = 0;
  private readonly colorPalette = [
    "#d13438", // Red
    "#107c10", // Green
    "#0078d4", // Azure Blue
    "#ca5010", // Orange
    "#8764b8", // Purple
    "#00bcf2", // Light Blue
    "#498205", // Dark Green
    "#e74856", // Bright Red
    "#ff8c00", // Dark Orange
    "#038387", // Teal
    "#744da9", // Medium Purple
    "#486991", // Steel Blue
    "#c239b3", // Magenta
    "#567c73", // Dark Teal
    "#f59e0b", // Yellow
    "#10b981", // Emerald
    "#3b82f6", // Blue
    "#ef4444", // Red variant
    "#8b5cf6", // Violet
    "#06b6d4", // Cyan
  ];

  getRepositoryColor(repositoryName: string): string {
    if (!this.repositoryColors.has(repositoryName)) {
      const color =
        this.colorPalette[this.colorIndex % this.colorPalette.length];
      this.repositoryColors.set(repositoryName, color);
      this.colorIndex++;
    }
    return this.repositoryColors.get(repositoryName) || this.colorPalette[0];
  }

  // Reset colors if needed (for testing or refresh)
  resetColors(): void {
    this.repositoryColors.clear();
    this.colorIndex = 0;
  }
}
