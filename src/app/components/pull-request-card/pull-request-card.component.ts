import { Component, Input, Output, EventEmitter, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { PullRequest } from "../../azure-devops/azure-devops.service";
import { RepositoryColorService } from "../../services/repository-color.service";

export interface StatusInfo {
  label: string;
  class: string;
}

@Component({
  selector: "app-pull-request-card",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./pull-request-card.component.html",
  styleUrl: "./pull-request-card.component.scss",
})
export class PullRequestCardComponent implements OnInit {
  @Input() pullRequest!: PullRequest;
  @Input() allPullRequests: PullRequest[] = []; // For finding related PRs

  @Output() pullRequestClicked = new EventEmitter<PullRequest>();
  @Output() teamsRequested = new EventEmitter<PullRequest>();
  @Output() relatedPullRequestClicked = new EventEmitter<PullRequest>();

  constructor(private repositoryColorService: RepositoryColorService) {}

  ngOnInit() {
    // No longer need to assign colors manually - the service handles it
  }

  onPullRequestClick() {
    this.pullRequestClicked.emit(this.pullRequest);
  }

  onTeamsClick(event: Event) {
    event.stopPropagation();
    this.teamsRequested.emit(this.pullRequest);
  }

  onRelatedPullRequestClick(relatedPr: PullRequest, event: Event) {
    event.stopPropagation();
    this.relatedPullRequestClicked.emit(relatedPr);
  }

  formatDate(date: string): string {
    const dateObj = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - dateObj.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return "1 day ago";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return dateObj.toLocaleDateString();
    }
  }

  getRepositoryColor(repositoryName: string): string {
    return this.repositoryColorService.getRepositoryColor(repositoryName);
  }

  getRepositoryLightColor(repositoryName: string): string {
    const baseColor = this.getRepositoryColor(repositoryName);
    // Convert hex to RGB and create a lighter version
    const hex = baseColor.replace("#", "");
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Create a much lighter version (closer to white)
    const lightR = Math.round(r + (255 - r) * 0.85);
    const lightG = Math.round(g + (255 - g) * 0.85);
    const lightB = Math.round(b + (255 - b) * 0.85);

    return `rgb(${lightR}, ${lightG}, ${lightB})`;
  }

  getMergeStatus(pr: PullRequest): StatusInfo {
    if (!pr.mergeStatus) {
      return { label: "Unknown", class: "merge-unknown" };
    }

    switch (pr.mergeStatus.toLowerCase()) {
      case "succeeded":
        return { label: "Ready", class: "merge-ready" };
      case "conflicts":
        return { label: "Conflicts", class: "merge-conflicts" };
      case "queued":
        return { label: "Queued", class: "merge-queued" };
      case "rejectedbypolicy":
        return { label: "Blocked", class: "merge-blocked" };
      case "failure":
        return { label: "Failed", class: "merge-failed" };
      default:
        return { label: "Unknown", class: "merge-unknown" };
    }
  }

  getMergeDetails(pr: PullRequest): string {
    const status = this.getMergeStatus(pr);
    const buildInfo =
      pr.builds && pr.builds.length > 0
        ? `\nBuilds: ${pr.builds
            .map((b) => `${b.definition.name}: ${b.result || b.status}`)
            .join(", ")}`
        : "";

    return `Merge Status: ${status.label}${buildInfo}`;
  }

  getCommentStatus(pr: PullRequest): StatusInfo {
    const unresolved = pr.unresolvedCommentCount || 0;
    const total = pr.commentCount || 0;

    if (total === 0) {
      return { label: "None", class: "comments-none" };
    }

    if (unresolved === 0) {
      return { label: `${total} Resolved`, class: "comments-resolved" };
    }

    return { label: `${unresolved} Unresolved`, class: "comments-unresolved" };
  }

  getCommentDetails(pr: PullRequest): string {
    const total = pr.commentCount || 0;
    const unresolved = pr.unresolvedCommentCount || 0;
    const resolved = total - unresolved;

    if (total === 0) {
      return "No comments";
    }

    return `Total: ${total} comments\nResolved: ${resolved}\nUnresolved: ${unresolved}`;
  }

  getReviewStatus(pr: PullRequest): StatusInfo {
    if (!pr.reviewers || pr.reviewers.length === 0) {
      return { label: "No Reviewers", class: "review-none" };
    }

    const approved = pr.reviewers.filter((r: any) => r.vote === 10).length;
    const rejected = pr.reviewers.filter(
      (r: any) => r.vote === -10 || r.vote === -5
    ).length;
    const waiting = pr.reviewers.filter((r: any) => r.vote === 0).length;

    if (rejected > 0) {
      return { label: `${rejected} Rejected`, class: "review-rejected" };
    }

    if (approved === pr.reviewers.length) {
      return { label: `${approved} Approved`, class: "review-approved" };
    }

    if (approved > 0) {
      return {
        label: `${approved}/${pr.reviewers.length} Approved`,
        class: "review-partial",
      };
    }

    return { label: `${waiting} Waiting`, class: "review-waiting" };
  }

  getBranchName(refName: string): string {
    return refName.replace("refs/heads/", "");
  }

  cleanDescription(description: string): string {
    if (!description) return "";

    // Remove markdown image syntax: ![alt text](url) - handle multiline and truncated URLs
    let cleaned = description.replace(/!\[.*?\]\([^)]*\)/gs, "");

    // Remove HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, "");

    // Remove markdown links: [text](url)
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Remove excessive whitespace and newlines
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // Limit length
    if (cleaned.length > 200) {
      cleaned = cleaned.substring(0, 200) + "...";
    }

    return cleaned;
  }

  getRelatedPullRequests(pr: PullRequest): PullRequest[] {
    if (!this.allPullRequests || this.allPullRequests.length === 0) {
      return [];
    }

    const currentPr = pr;
    const candidates: Array<{ pr: PullRequest; score: number }> = [];

    this.allPullRequests.forEach((otherPr) => {
      if (otherPr.pullRequestId === currentPr.pullRequestId) {
        return; // Skip the same PR
      }

      let score = 0;

      // Same repository AND same author - very likely related
      if (
        currentPr.repository.name === otherPr.repository.name &&
        currentPr.createdBy.uniqueName === otherPr.createdBy.uniqueName
      ) {
        score += 50;
      }

      // Same repository but different author - possibly related feature branches
      else if (currentPr.repository.name === otherPr.repository.name) {
        score += 15;
      }

      // Same author across different repositories - possibly related work
      else if (
        currentPr.createdBy.uniqueName === otherPr.createdBy.uniqueName
      ) {
        score += 10;
      }

      // Check for very similar titles (more than just 2 common words)
      const currentWords = currentPr.title
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 3);
      const otherWords = otherPr.title
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 3);
      const commonWords = currentWords.filter((word) =>
        otherWords.includes(word)
      );

      if (commonWords.length >= 3 && currentWords.length >= 3) {
        score += 20;
      }

      // Only consider PRs with a high similarity score
      if (score >= 30) {
        candidates.push({ pr: otherPr, score });
      }
    });

    // Return only the most related PR (highest score), maximum of 1
    if (candidates.length === 0) {
      return [];
    }

    candidates.sort((a, b) => b.score - a.score);
    return [candidates[0].pr];
  }
}
