export interface ProjectConfig {
  name: string;
  repository?: string; // Optional: if specified, only fetch PRs from this repository
}

export interface AzureDevOpsConfig {
  organization: string;
  projects: ProjectConfig[];
  pat: string;
  baseUrl: string;
}

// Configuration for your Azure DevOps setup
export const AZURE_DEVOPS_CONFIG: AzureDevOpsConfig = {
  // Your Azure DevOps organization
  organization: "Main",

  // Your projects with optional repository filtering
  projects: [
    // {
    //   name: "X5K8-Regular-Transfers",
    //   repository: "X5K8.RegularTransfers.WebApp",
    // },
    // {
    //   name: "X5K7-Outgoing-Payments",
    //   repository: "X5K7.OutgoingPayments.WebApp",
    // },
    // { name: "IB-SS - List of outgoing payments", repository: "IB-SS.GraphQL" },
  ],

  // Your custom Azure DevOps domain
  baseUrl: "https://azuredevops.danskenet.net",

  // Your Personal Access Token (will be loaded from localStorage)
  pat: "",
};

// Note: In a production environment, you should store sensitive information
// like PATs in environment variables or a secure configuration service,
// not in the source code.
