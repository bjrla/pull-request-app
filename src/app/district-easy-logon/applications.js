exports.applications = [
  {
    appName: "paymentApp", // Name of application - Only used for error logging
    path: "../../IB-SS.PaymentApp/src/environments/environment.ts", // Path to environment file that contains the token to be replaced
    tokenProperty: "overrideToken", // Name of property - The value of this will be replaced with the new token
  },
  // {
  //   appName: "accounts client", // Name of application - Only used for error logging
  //   path: "../../StaticContent.Accounts/workspace/.env.development.local", // Path to file that contains the token to be replaced
  //   customReplacer: (token, fileContents) => `VITE_TOKEN=${token}`,
  // },
  {
    appName: "paymentDetails",
    path: "../../IB-SS.PaymentDetails/src/environments/environment.ts",
    tokenProperty: "overrideToken",
  },
  {
    appName: "regularTransfers",
    path: "../../X5K8.RegularTransfers.WebApp/src/environments/environment.ts",
    tokenProperty: "overrideToken",
  },
  {
    appName: "outPayRefresh",
    path: "../../X5K7.OutgoingPayments.WebApp/src/environments/environment.ts",
    tokenProperty: "overrideToken",
  },
];
