import { Routes } from "@angular/router";
import { PullRequestsComponent } from "./components/pull-requests/pull-requests.component";
import { PipelineBuildsComponent } from "./components/pipeline-builds/pipeline-builds.component";
import { FeedbackComponent } from "./components/feedback/feedback.component";

export const routes: Routes = [
  { path: "", redirectTo: "/pull-requests", pathMatch: "full" },
  { path: "pull-requests", component: PullRequestsComponent },
  { path: "pipelines", component: PipelineBuildsComponent },
  { path: "feedback", component: FeedbackComponent },
];
