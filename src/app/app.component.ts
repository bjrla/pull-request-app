import { Component, OnDestroy, OnInit, ChangeDetectorRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterOutlet } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { ManageProjectsModalComponent } from "./components/add-project-modal/add-project-modal.component";
import { ProjectConfig } from "./azure-devops/azure-devops.config";
import { ConfigStorageService } from "./services/config-storage.service";
import { EasyLogonService } from "./district-easy-logon/easy-logon.service";
import { Subscription } from "rxjs";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    FormsModule,
    ManageProjectsModalComponent,
  ],
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit, OnDestroy {
  title = "pull-request-overview";

  // Project and PAT management
  isManageProjectsModalOpen = false;
  currentProjects: ProjectConfig[] = [];
  currentPAT: string = "";
  betaFeaturesEnabled: boolean = false;

  // Easy Logon state
  isLogonRunning = false;
  latestLogonMessage: string = "";
  logonMessageType: "info" | "stdout" | "stderr" | "success" | "error" | "end" =
    "info";
  private _userId: string = "4A1137";
  private _copyToClipboard: boolean = true;

  get userId(): string {
    return this._userId;
  }

  set userId(value: string) {
    this._userId = value;
    localStorage.setItem("easyLogonUserId", value);
  }

  get copyToClipboard(): boolean {
    return this._copyToClipboard;
  }

  set copyToClipboard(value: boolean) {
    this._copyToClipboard = value;
    localStorage.setItem("easyLogonCopyToClipboard", JSON.stringify(value));
  }

  private subscriptions = new Subscription();
  private easyLogonSubscription: Subscription | null = null;

  constructor(
    private router: Router,
    private configStorageService: ConfigStorageService,
    private easyLogonService: EasyLogonService,
    private cdr: ChangeDetectorRef
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

    this.subscriptions.add(
      this.configStorageService.betaFeaturesEnabled$.subscribe((enabled) => {
        this.betaFeaturesEnabled = enabled;
      })
    );

    // Subscribe to Easy Logon status changes
    this.subscriptions.add(
      this.easyLogonService.getLogonStatus().subscribe((status) => {
        this.isLogonRunning = status.isRunning;
        // Don't update message here if we're using the stream subscription
        if (
          !this.isLogonRunning &&
          status.message &&
          !this.latestLogonMessage
        ) {
          this.latestLogonMessage = status.message;
        }
      })
    );
  }

  ngOnInit(): void {
    // Load userId from localStorage
    const storedUserId = localStorage.getItem("easyLogonUserId");
    if (storedUserId) {
      this._userId = storedUserId;
    }

    // Load copyToClipboard setting from localStorage
    const storedCopyToClipboard = localStorage.getItem(
      "easyLogonCopyToClipboard"
    );
    if (storedCopyToClipboard !== null) {
      this._copyToClipboard = JSON.parse(storedCopyToClipboard);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.easyLogonSubscription) {
      this.easyLogonSubscription.unsubscribe();
    }
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

  // Helper method to remove ANSI color codes
  private stripAnsiCodes(text: string): string {
    return text.replace(/\u001b\[[0-9;]*m/g, "");
  }

  // Helper method to format message with timestamp
  private formatMessageWithTimestamp(
    message: string,
    timestamp?: string
  ): string {
    const time = timestamp
      ? new Date(timestamp).toLocaleTimeString()
      : new Date().toLocaleTimeString();
    return `[${time}] ${message}`;
  }

  // Easy Logon method with real-time streaming
  startEasyLogon(): void {
    if (this.isLogonRunning) {
      return;
    }

    // Set initial state immediately to test UI
    this.latestLogonMessage = this.formatMessageWithTimestamp(
      "Initializing Easy Logon..."
    );
    this.logonMessageType = "info";

    // Cancel any existing subscription before starting a new one
    if (this.easyLogonSubscription) {
      this.easyLogonSubscription.unsubscribe();
      this.easyLogonSubscription = null;
    }

    this.easyLogonSubscription = this.easyLogonService
      .startEasyLogonWithStream({
        userId: this.userId,
        copyToClipboard: this.copyToClipboard,
      })
      .subscribe({
        next: (message) => {
          // Update the UI with the latest message (cleaned of ANSI codes and with timestamp)
          const cleanMessage = this.stripAnsiCodes(message.message);
          this.latestLogonMessage = this.formatMessageWithTimestamp(
            cleanMessage,
            message.timestamp
          );
          this.logonMessageType = message.type;

          // Manually trigger change detection
          this.cdr.detectChanges();

          if (message.type === "success" && message.message.includes("Token")) {
            console.log(
              "🎉 TOKEN SUCCESSFULLY RECEIVED AND COPIED TO CLIPBOARD!"
            );
          }
        },
        complete: () => {
          this.latestLogonMessage = this.formatMessageWithTimestamp(
            "Easy Logon completed"
          );
          this.logonMessageType = "success";
          this.easyLogonSubscription = null;
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.latestLogonMessage = this.formatMessageWithTimestamp(
            `Error: ${error.message || "Unknown error occurred"}`
          );
          this.logonMessageType = "error";
          this.easyLogonSubscription = null;
          this.cdr.detectChanges();
        },
      });
  }

  // Stop Easy Logon process
  stopEasyLogon(): void {
    if (!this.isLogonRunning) {
      return;
    }

    // Cancel the streaming subscription first
    if (this.easyLogonSubscription) {
      this.easyLogonSubscription.unsubscribe();
      this.easyLogonSubscription = null;
    }

    this.latestLogonMessage = this.formatMessageWithTimestamp(
      "Stopping Easy Logon..."
    );
    this.logonMessageType = "info";

    this.easyLogonService.stopEasyLogon().subscribe({
      next: (response) => {
        this.latestLogonMessage = this.formatMessageWithTimestamp(
          response.message || "Easy Logon stopped"
        );
        this.logonMessageType = response.success ? "success" : "error";
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.latestLogonMessage = this.formatMessageWithTimestamp(
          `Stop error: ${error.message || "Unknown error occurred"}`
        );
        this.logonMessageType = "error";
        this.cdr.detectChanges();
      },
    });
  }

  // Clear the displayed logon message
  clearLogonMessage(): void {
    this.latestLogonMessage = "";
  }
}
