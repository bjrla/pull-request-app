import { Component, Output, EventEmitter, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-pat-prompt-modal",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./pat-prompt-modal.component.html",
  styleUrl: "./pat-prompt-modal.component.scss",
})
export class PATPromptModalComponent {
  @Input() isOpen = false;
  @Input() message = "";
  @Output() closeModal = new EventEmitter<void>();
  @Output() patProvided = new EventEmitter<string>();

  personalAccessToken = "";

  onSubmit() {
    if (this.personalAccessToken.trim()) {
      this.patProvided.emit(this.personalAccessToken.trim());
      this.resetForm();
    }
  }

  onCancel() {
    this.resetForm();
    this.closeModal.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }

  private resetForm() {
    this.personalAccessToken = "";
  }
}
