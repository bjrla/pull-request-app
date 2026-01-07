exports.applications = [
  {
    appName: "paymentApp", // Name of application - Only used for error logging
    path: "../../../../../Work/IB-SS.PaymentApp/src/environments/environment.ts", // Path to environment file that contains the token to be replaced
    tokenProperty: "overrideToken", // Name of property - The value of this will be replaced with the new token
  },
  // {
  //   appName: "accounts client", // Name of application - Only used for error logging
  //   path: "../../StaticContent.Accounts/workspace/.env.development.local", // Path to file that contains the token to be replaced
  //   customReplacer: (token, fileContents) => `VITE_TOKEN=${token}`,
  // },
  {
    appName: "paymentDetails",
    path: "../../../../../Work/IB-SS.PaymentDetails/src/environments/environment.ts",
    tokenProperty: "overrideToken",
  },
  {
    appName: "regularTransfers",
    path: "../../../../../Work/X5K8.RegularTransfers.WebApp/src/environments/environment.ts",
    tokenProperty: "overrideToken",
  },
  {
    appName: "outPayRefresh",
    path: "../../../../../Work/X5K7.OutgoingPayments.WebApp/src/environments/environment.ts",
    tokenProperty: "overrideToken",
  },
  {
    appName: "graphQLClient",
    path: "../../../../../Work/IB-SS.GraphQL/bruno/environments/LOCAL.bru",
    tokenProperty: "authorization",
    customReplacer: (token, fileContents) =>
      fileContents.replace(
        /authorization: Bearer .*/,
        `authorization: Bearer ${token}`
      ),
  },
];
