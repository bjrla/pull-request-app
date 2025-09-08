import { Component } from "@angular/core";

@Component({
  selector: "app-loading",
  standalone: true,
  template: `
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading pull requests...</p>
    </div>
  `,
  styles: [
    `
      .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        color: #656d76;
      }

      .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #0078d4;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
      }

      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      p {
        margin: 0;
        font-size: 1rem;
      }
    `,
  ],
})
export class LoadingComponent {}
