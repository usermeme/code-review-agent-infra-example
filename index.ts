import * as pulumi from "@pulumi/pulumi";

// 1. Foundation: APIs, IAM, Database, Secrets, Pub/Sub Topics
import "./src/apis";
import { runnerSa, pubsubInvokerSa } from "./src/iam";
import { firestoreDatabaseId, processedDeliveriesTtl } from "./src/database";
import {
  prEventsDlqTopic,
  prEventsTopic,
  reviewResultsDlqTopic,
  reviewResultsTopic,
} from "./src/pubsub";

// 2. Services: Cloud Run 3-Service Hexagonal Architecture
import { ingressService } from "./src/services/ingress";
import { adapterService } from "./src/services/adapter";
import { coreService } from "./src/services/core";

// 3. Event Bus Push Subscriptions (Serverless Scale-to-Zero)
import {
  prEventsDlqSub,
  prEventsSub,
  reviewResultsDlqSub,
  reviewResultsSub,
} from "./src/subscriptions";

// =============================================================================
// Stack Exports
// =============================================================================

// The exact Webhook URL to configure in GitHub repository / organization
export const githubWebhookUrl = pulumi.interpolate`${ingressService.uri}/api/v1/webhooks`;

// Service URIs
export const ingressServiceUrl = ingressService.uri;
export const adapterServiceUrl = adapterService.uri;
export const coreServiceUrl = coreService.uri;

// Database ID
export { firestoreDatabaseId };

// Firestore TTL policy for Pub/Sub delivery-dedup records
export const processedDeliveriesTtlField = processedDeliveriesTtl.name;

// Pub/Sub Topics
export const pubsubTopics = {
  prEventsTopic: prEventsTopic.name,
  reviewResultsTopic: reviewResultsTopic.name,
  prEventsDlqTopic: prEventsDlqTopic.name,
  reviewResultsDlqTopic: reviewResultsDlqTopic.name,
};

// Pub/Sub Push Subscriptions
export const pubsubSubscriptions = {
  prEventsSub: prEventsSub.name,
  reviewResultsSub: reviewResultsSub.name,
  prEventsDlqSub: prEventsDlqSub.name,
  reviewResultsDlqSub: reviewResultsDlqSub.name,
};

// Service Accounts
export const serviceAccounts = {
  workloadRunnerSa: runnerSa.email,
  pubsubInvokerSa: pubsubInvokerSa.email,
};
