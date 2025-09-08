import { Component, Input } from "@angular/core";

@Component({
  selector: "app-no-data",
  standalone: true,
  template: `
    <div class="no-data">
      <p>{{ message }}</p>
    </div>
  `,
  styles: [
    `
      .no-data {
        text-align: center;
        padding: 2rem;
        color: #656d76;
        background-color: #f8f9fa;
        border-radius: 0.5rem;
        margin: 1rem 0;
      }

      p {
        margin: 0;
        font-size: 1rem;
      }
    `,
  ],
})
export class NoDataComponent {
  @Input() message: string = "No data available";
}
