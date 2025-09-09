import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, BehaviorSubject, Subject } from "rxjs";

export interface EasyLogonRequest {
  userId?: string;
  password?: string;
}

export interface EasyLogonResponse {
  success: boolean;
  message: string;
  output?: string;
  error?: string;
  processId?: number;
}

export interface LogonStatus {
  isRunning: boolean;
  lastRun?: Date;
  lastSuccess?: boolean;
  message?: string;
}

export interface EasyLogonStreamMessage {
  type: "info" | "stdout" | "stderr" | "success" | "error" | "end";
  message: string;
  timestamp: string;
  exitCode?: number;
}

@Injectable({
  providedIn: "root",
})
export class EasyLogonService {
  private apiUrl = "http://localhost:4334/api";
  private logonStatus = new BehaviorSubject<LogonStatus>({ isRunning: false });
  private logonMessages = new Subject<EasyLogonStreamMessage>();

  constructor(private http: HttpClient) {}

  /**
   * Starts the District Easy Logon process with real-time streaming
   */
  startEasyLogonWithStream(
    credentials?: EasyLogonRequest
  ): Observable<EasyLogonStreamMessage> {
    const userId = credentials?.userId || "4A1137";
    const password = credentials?.password || "454545";

    this.updateStatus({
      isRunning: true,
      message: "Starting login process...",
    });

    return new Observable((observer) => {
      const url = `${this.apiUrl}/easy-logon/stream?userId=${encodeURIComponent(
        userId
      )}&password=${encodeURIComponent(password)}`;
      const eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const message: EasyLogonStreamMessage = JSON.parse(event.data);

          // Log to Angular console with styling
          this.logToConsole(message);

          // Update status based on message type
          if (message.type === "success") {
            this.updateStatus({
              isRunning: false,
              lastRun: new Date(),
              lastSuccess: true,
              message: message.message,
            });
          } else if (message.type === "error") {
            this.updateStatus({
              isRunning: false,
              lastRun: new Date(),
              lastSuccess: false,
              message: message.message,
            });
          } else if (message.type === "stdout") {
            this.updateStatus({
              isRunning: true,
              message: message.message,
            });
          }

          // Emit message to subscribers
          this.logonMessages.next(message);
          observer.next(message);

          // Complete the observable when the stream ends
          if (message.type === "end") {
            eventSource.close();
            observer.complete();
          }
        } catch (error) {
          console.error(
            "🔐 Easy Logon Service - Error parsing SSE message:",
            error
          );
        }
      };

      eventSource.onerror = (error) => {
        this.updateStatus({
          isRunning: false,
          lastRun: new Date(),
          lastSuccess: false,
          message: "Connection error occurred",
        });
        eventSource.close();
        observer.error(error);
      };

      // Return cleanup function
      return () => {
        eventSource.close();
        this.updateStatus({
          isRunning: false,
          message: "Process interrupted",
        });
      };
    });
  }

  /**
   * Remove ANSI color codes from a string
   */
  private stripAnsiCodes(text: string): string {
    return text.replace(/\u001b\[[0-9;]*m/g, "");
  }

  /**
   * Log Easy Logon messages to the browser console with styling
   */
  private logToConsole(message: EasyLogonStreamMessage): void {
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    const prefix = `🔐 Easy Logon [${timestamp}]`;

    // Clean the message from ANSI color codes
    const cleanMessage = this.stripAnsiCodes(message.message);

    // Only log specific important messages
    const importantKeywords = [
      "Reading User_Session Cookie",
      "Extending session",
      "Token:",
      "User session Cookie:",
      "Token copied to clipboard",
    ];

    const isImportant = importantKeywords.some((keyword) =>
      cleanMessage.includes(keyword)
    );

    if (isImportant) {
      switch (message.type) {
        case "stdout":
          console.log(
            `%c${prefix} ✅ ${cleanMessage}`,
            "color: #4CAF50; font-weight: bold"
          );
          break;
        case "success":
          console.log(
            `%c${prefix} 🎉 ${cleanMessage}`,
            "color: #4CAF50; font-weight: bold; font-size: 14px"
          );
          break;
        default:
          console.log(
            `%c${prefix} ${cleanMessage}`,
            "color: #4CAF50; font-weight: bold"
          );
      }
    }
  }

  /**
   * Check if the backend API is available
   */
  checkApiHealth(): Observable<any> {
    return this.http.get(`${this.apiUrl}/health`);
  }

  /**
   * Starts the District Easy Logon process (original method for backward compatibility)
   */
  startEasyLogon(
    credentials?: EasyLogonRequest
  ): Observable<EasyLogonResponse> {
    this.updateStatus({
      isRunning: true,
      message: "Starting login process...",
    });

    return new Observable((observer) => {
      this.http
        .post<EasyLogonResponse>(`${this.apiUrl}/easy-logon`, credentials || {})
        .subscribe({
          next: (response) => {
            // Check if response contains token information in the output
            if (
              response.output &&
              response.output.includes("Token copied to clipboard")
            ) {
              console.log("✅ Token successfully copied to clipboard!");
            }

            this.updateStatus({
              isRunning: false,
              lastRun: new Date(),
              lastSuccess: response.success,
              message: response.message,
            });
            observer.next(response);
            observer.complete();
          },
          error: (error) => {
            this.updateStatus({
              isRunning: false,
              lastRun: new Date(),
              lastSuccess: false,
              message: `Error: ${error.message}`,
            });
            observer.error(error);
          },
        });
    });
  }

  /**
   * Get real-time Easy Logon messages as an observable
   */
  getLogonMessages(): Observable<EasyLogonStreamMessage> {
    return this.logonMessages.asObservable();
  }

  /**
   * Get current logon status as observable
   */
  getLogonStatus(): Observable<LogonStatus> {
    return this.logonStatus.asObservable();
  }

  /**
   * Get current logon status as value
   */
  getCurrentStatus(): LogonStatus {
    return this.logonStatus.value;
  }

  /**
   * Stop any running Easy Logon process
   */
  stopEasyLogon(processId?: number): Observable<EasyLogonResponse> {
    console.log("🔐 Stopping Easy Logon process...", processId);

    this.updateStatus({
      isRunning: false,
      message: "Stopping process...",
    });

    return new Observable((observer) => {
      this.http
        .post<EasyLogonResponse>(`${this.apiUrl}/easy-logon/stop`, {
          processId,
        })
        .subscribe({
          next: (response) => {
            this.updateStatus({
              isRunning: false,
              lastRun: new Date(),
              lastSuccess: response.success,
              message: response.success
                ? "Process stopped"
                : "Failed to stop process",
            });
            observer.next(response);
            observer.complete();
          },
          error: (error) => {
            this.updateStatus({
              isRunning: false,
              lastRun: new Date(),
              lastSuccess: false,
              message: `Stop error: ${error.message}`,
            });
            observer.error(error);
          },
        });
    });
  }

  private updateStatus(status: Partial<LogonStatus>) {
    const currentStatus = this.logonStatus.value;
    this.logonStatus.next({ ...currentStatus, ...status });
  }
}
