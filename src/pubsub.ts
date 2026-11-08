import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { project } from "./config";
import { enabledServices } from "./apis";

// =============================================================================
// Cloud Pub/Sub Topics
// =============================================================================

// Ingress topic for Pull Request events from GitHub Ingress Service
export const prEventsTopic = new gcp.pubsub.Topic(
  "pr-events-topic",
  {
    name: "pr-events",
  },
  { dependsOn: enabledServices }
);

// Egress topic for completed review findings from Core Orchestrator
export const reviewResultsTopic = new gcp.pubsub.Topic(
  "review-results-topic",
  {
    name: "review-results",
  },
  { dependsOn: enabledServices }
);

// =============================================================================
// Dead-Letter Topics (one per subscription, per app provisioning docs)
// Poison messages are dead-lettered so they stop redelivering forever —
// each redelivery of a PR event costs real LLM spend.
// =============================================================================

export const prEventsDlqTopic = new gcp.pubsub.Topic(
  "pr-events-dlq-topic",
  {
    name: "pr-events-dlq",
  },
  { dependsOn: enabledServices }
);

export const reviewResultsDlqTopic = new gcp.pubsub.Topic(
  "review-results-dlq-topic",
  {
    name: "review-results-dlq",
  },
  { dependsOn: enabledServices }
);

// Dead-lettering publishes as the Pub/Sub service agent — it needs publisher
// rights on the DLQ topics or dead-lettering silently fails.
// Granted at the project level because the CI deployer SA lacks
// pubsub.topics.setIamPolicy for topic-scoped bindings.
const projectInfo = gcp.organizations.getProjectOutput({ projectId: project });

export const pubsubServiceAgentDlqPublisher = new gcp.projects.IAMMember(
  "pubsub-service-agent-dlq-publisher",
  {
    project: project,
    role: "roles/pubsub.publisher",
    member: pulumi.interpolate`serviceAccount:service-${projectInfo.number}@gcp-sa-pubsub.iam.gserviceaccount.com`,
  },
  { dependsOn: [prEventsDlqTopic, reviewResultsDlqTopic] }
);

// Dead-lettering also needs the Pub/Sub service agent to ack the failed
// message on the source subscription; without this binding
// maxDeliveryAttempts does not stop redelivery. Project-level for the same
// reason as the publisher binding above.
export const pubsubServiceAgentSubscriber = new gcp.projects.IAMMember(
  "pubsub-service-agent-subscriber",
  {
    project: project,
    role: "roles/pubsub.subscriber",
    member: pulumi.interpolate`serviceAccount:service-${projectInfo.number}@gcp-sa-pubsub.iam.gserviceaccount.com`,
  }
);
