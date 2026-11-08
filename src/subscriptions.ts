import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import {
  prEventsDlqTopic,
  prEventsTopic,
  reviewResultsDlqTopic,
  reviewResultsTopic,
} from "./pubsub";
import { pubsubInvokerSa } from "./iam";
import { coreService } from "./services/core";
import { adapterService } from "./services/adapter";

// =============================================================================
// Cloud Pub/Sub Push Subscriptions
// Dispatches incoming events directly to Cloud Run HTTP endpoints, enabling
// true serverless scale-to-zero wake-up with zero idle compute costs.
// =============================================================================

// 1. Push subscription for Pull Request events -> Wakes up Core Orchestrator
export const prEventsSub = new gcp.pubsub.Subscription("pr-events-sub", {
  name: "pr-events-sub",
  topic: prEventsTopic.name,
  ackDeadlineSeconds: 600, // 10 minutes for comprehensive AI code reviews
  pushConfig: {
    pushEndpoint: pulumi.interpolate`${coreService.uri}/api/v1/pubsub/pr-events`,
    oidcToken: {
      serviceAccountEmail: pubsubInvokerSa.email,
    },
  },
  deadLetterPolicy: {
    deadLetterTopic: prEventsDlqTopic.id,
    // Pub/Sub enforces a minimum of 5 delivery attempts; poison messages
    // (each redelivery of a review costs real LLM spend) are dead-lettered
    // after that.
    maxDeliveryAttempts: 5,
  },
  retryPolicy: {
    minimumBackoff: "30s",
    maximumBackoff: "600s",
  },
});

// 2. Push subscription for Review Results -> Wakes up GitHub Adapter
export const reviewResultsSub = new gcp.pubsub.Subscription("review-results-sub", {
  name: "review-results-sub",
  topic: reviewResultsTopic.name,
  ackDeadlineSeconds: 60,
  pushConfig: {
    pushEndpoint: pulumi.interpolate`${adapterService.uri}/api/v1/pubsub/review-results`,
    oidcToken: {
      serviceAccountEmail: pubsubInvokerSa.email,
    },
  },
  deadLetterPolicy: {
    deadLetterTopic: reviewResultsDlqTopic.id,
    maxDeliveryAttempts: 5,
  },
  retryPolicy: {
    minimumBackoff: "30s",
    maximumBackoff: "600s",
  },
});

// =============================================================================
// Dead-Letter Pull Subscriptions
// A topic with no subscription drops what it receives: give each DLQ a pull
// subscription so dead-lettered events are kept (7 days) for inspection/replay.
// =============================================================================

export const prEventsDlqSub = new gcp.pubsub.Subscription("pr-events-dlq-sub", {
  name: "pr-events-dlq-sub",
  topic: prEventsDlqTopic.name,
  messageRetentionDuration: "604800s", // 7 days
});

export const reviewResultsDlqSub = new gcp.pubsub.Subscription("review-results-dlq-sub", {
  name: "review-results-dlq-sub",
  topic: reviewResultsDlqTopic.name,
  messageRetentionDuration: "604800s", // 7 days
});
