import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { project } from "./config";
import { enabledServices } from "./apis";

// =============================================================================
// Service Accounts & IAM Roles
// =============================================================================

// Runtime Service Account (Cloud Run microservices identity)
export const runnerSa = new gcp.serviceaccount.Account(
  "sa-code-review-runner",
  {
    accountId: "sa-code-review-runner",
    displayName: "Code Review Agent Runtime Runner",
    description: "Used by Cloud Run microservices to access Firestore, Pub/Sub, and Secret Manager",
  },
  { dependsOn: enabledServices }
);

// Assign least-privilege IAM roles to runner service account
const runnerRoles = [
  "roles/datastore.user",
  "roles/pubsub.publisher",
  "roles/pubsub.subscriber",
  "roles/secretmanager.secretAccessor",
];

export const runnerRoleBindings = runnerRoles.map(
  (role) =>
    new gcp.projects.IAMMember(`runner-${role}`, {
      project: project,
      role: role,
      member: pulumi.interpolate`serviceAccount:${runnerSa.email}`,
    })
);

// Pub/Sub Push Invoker Service Account
export const pubsubInvokerSa = new gcp.serviceaccount.Account(
  "sa-pubsub-invoker",
  {
    accountId: "sa-pubsub-invoker",
    displayName: "Pub/Sub Push Subscription Invoker",
    description: "Used by Cloud Pub/Sub push subscriptions to invoke Cloud Run services",
  },
  { dependsOn: enabledServices }
);

export const pubsubInvokerBinding = new gcp.projects.IAMMember("pubsub-invoker-run", {
  project: project,
  role: "roles/run.invoker",
  member: pulumi.interpolate`serviceAccount:${pubsubInvokerSa.email}`,
});
