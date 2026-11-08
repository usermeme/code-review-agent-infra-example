import * as gcp from "@pulumi/gcp";
import {
  project,
  region,
  imageRegistry,
  imageTag,
  geminiModel,
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
// Provider-agnostic LLM review orchestrator powered by Gemini & in-process ADK agents.
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
            { name: "REVIEW_MODEL", value: geminiModel },
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
