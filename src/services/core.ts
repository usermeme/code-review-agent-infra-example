import * as gcp from "@pulumi/gcp";
import {
  project,
  region,
  imageRegistry,
  imageTag,
  triageModel,
  reviewerModel,
  verifierModel,
  deepReviewPaths,
  minInstances,
  maxInstances,
} from "../config";
import { runnerSa } from "../iam";
import { reviewResultsTopic } from "../pubsub";
import { adapterService } from "./adapter";
import { geminiKeySecret, geminiKeyVersion } from "../secrets";
import { enabledServices } from "../apis";

// =============================================================================
// Cloud Run: Core Orchestrator & AI Review Service
// Review orchestrator running three in-process ADK agents on Gemini
// (triage, reviewer, verifier), each on the model set in the stack config.
// Connects to Git Provider Adapter via GIT_ADAPTER_URL.
// =============================================================================
export const coreService = new gcp.cloudrunv2.Service(
  "code-review-core",
  {
    name: "code-review-core",
    location: region,
    ingress: "INGRESS_TRAFFIC_ALL",
    deletionProtection: false,
    template: {
      serviceAccount: runnerSa.email,
      timeout: "900s",
      scaling: {
        minInstanceCount: minInstances,
        maxInstanceCount: maxInstances,
      },
      containers: [
        {
          image: `${imageRegistry}/code-review-agent-core:${imageTag}`,
          resources: {
            limits: {
              cpu: "2",
              memory: "4Gi",
            },
            startupCpuBoost: true,
          },
          envs: [
            { name: "HOST", value: "0.0.0.0" },
            { name: "GIT_ADAPTER_URL", value: adapterService.uri },
            { name: "REVIEW_RESULTS_TOPIC", value: reviewResultsTopic.name },
            { name: "TRIAGE_MODEL", value: triageModel },
            { name: "REVIEWER_MODEL", value: reviewerModel },
            { name: "VERIFIER_MODEL", value: verifierModel },
            ...(deepReviewPaths ? [{ name: "DEEP_REVIEW_PATHS", value: deepReviewPaths }] : []),
            { name: "GOOGLE_CLOUD_PROJECT", value: project },
            {
              name: "GEMINI_API_KEY",
              valueSource: {
                secretKeyRef: {
                  secret: geminiKeySecret.secretId,
                  version: "latest",
                },
              },
            },
          ],
        },
      ],
    },
  },
  {
    dependsOn: [adapterService, reviewResultsTopic, geminiKeyVersion, ...enabledServices],
  }
);

// Public access for health checks (/healthz) and Pub/Sub push callbacks (/api/v1/pubsub/pr-events)
export const coreAllUsersBinding = new gcp.cloudrunv2.ServiceIamMember("core-all-users", {
  project: project,
  location: region,
  name: coreService.name,
  role: "roles/run.invoker",
  member: "allUsers",
});
