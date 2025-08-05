import { Component, Input } from "@angular/core";

@Component({
  selector: "app-error-message",
  standalone: true,
  template: `
    <div class="error-message">
      {{ message }}
    </div>
  `,
  styles: [
    `
      .error-message {
        background-color: #f8d7da;
        color: #721c24;
        padding: 1rem;
        border: 1px solid #f5c6cb;
        border-radius: 0.25rem;
        margin-bottom: 1rem;
      }
    `,
  ],
})
export class ErrorMessageComponent {
  @Input() message: string = "";
}
