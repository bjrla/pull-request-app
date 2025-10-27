import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class PinnedAuthorsService {
  private readonly PINNED_AUTHORS_STORAGE_KEY = "azure-devops-pinned-authors";

  // Reactive stream for pinned authors
  private _pinnedAuthors$ = new BehaviorSubject<Set<string>>(new Set());

  constructor() {
    this.initializeFromStorage();
  }

  // Observable for components to subscribe to
  get pinnedAuthors$(): Observable<Set<string>> {
    return this._pinnedAuthors$.asObservable();
  }

  // Getter for current value
  get currentPinnedAuthors(): Set<string> {
    return this._pinnedAuthors$.value;
  }

  // Initialize from localStorage
  private initializeFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.PINNED_AUTHORS_STORAGE_KEY);
      if (stored) {
        const pinnedAuthorsArray = JSON.parse(stored);
        this._pinnedAuthors$.next(new Set(pinnedAuthorsArray));
      }
    } catch (error) {
      console.error(
        "PinnedAuthorsService: Error loading pinned authors from storage:",
        error
      );
      this._pinnedAuthors$.next(new Set());
    }
  }

  // Save to localStorage
  private saveToStorage(): void {
    try {
      const pinnedAuthorsArray = Array.from(this.currentPinnedAuthors);
      localStorage.setItem(
        this.PINNED_AUTHORS_STORAGE_KEY,
        JSON.stringify(pinnedAuthorsArray)
      );
    } catch (error) {
      console.error(
        "PinnedAuthorsService: Error saving pinned authors to storage:",
        error
      );
    }
  }

  // Pin an author
  pinAuthor(authorName: string): void {
    const updatedPinnedAuthors = new Set(this.currentPinnedAuthors);
    updatedPinnedAuthors.add(authorName);
    this._pinnedAuthors$.next(updatedPinnedAuthors);
    this.saveToStorage();
  }

  // Unpin an author
  unpinAuthor(authorName: string): void {
    const updatedPinnedAuthors = new Set(this.currentPinnedAuthors);
    updatedPinnedAuthors.delete(authorName);
    this._pinnedAuthors$.next(updatedPinnedAuthors);
    this.saveToStorage();
  }

  // Toggle pin status of an author
  togglePin(authorName: string): void {
    if (this.isPinned(authorName)) {
      this.unpinAuthor(authorName);
    } else {
      this.pinAuthor(authorName);
    }
  }

  // Check if an author is pinned
  isPinned(authorName: string): boolean {
    return this.currentPinnedAuthors.has(authorName);
  }

  // Get all pinned authors as an array
  getPinnedAuthorsArray(): string[] {
    return Array.from(this.currentPinnedAuthors);
  }

  // Clear all pinned authors
  clearAll(): void {
    this._pinnedAuthors$.next(new Set());
    this.saveToStorage();
  }

  // Get authors that are both pinned and have active PRs
  getActivePinnedAuthors(allAuthors: string[]): string[] {
    return allAuthors.filter((author) => this.isPinned(author));
  }
}
