import * as gcp from "@pulumi/gcp";
import {
  project,
  region,
  imageRegistry,
  imageTag,
  minInstances,
  maxInstances,
  githubAppId,
} from "../config";
import { runnerSa } from "../iam";
import { githubAppPrivateKeySecret, githubAppPrivateKeyVersion } from "../secrets";
import { enabledServices } from "../apis";

// =============================================================================
// Cloud Run: GitHub Adapter Service (Git Provider Adapter)
// Authenticates as a GitHub App (bot identity): mints short-lived
// per-installation tokens from GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY.
// Exposes synchronous REST endpoints for code retrieval and receives
// Pub/Sub push /review-results to post comments as <app-name>[bot].
// NOTE: since app-repo #17 the adapter image is GitHub App-only — the
// legacy GITHUB_TOKEN (PAT) mode was removed upstream.
// =============================================================================
export const adapterService = new gcp.cloudrunv2.Service(
  "code-review-github-adapter",
  {
    name: "code-review-github-adapter",
    location: region,
    ingress: "INGRESS_TRAFFIC_ALL",
    deletionProtection: false,
    template: {
      serviceAccount: runnerSa.email,
      timeout: "300s",
      scaling: {
        minInstanceCount: minInstances,
        maxInstanceCount: maxInstances,
      },
      containers: [
        {
          image: `${imageRegistry}/code-review-agent-github-adapter:${imageTag}`,
          resources: {
            limits: {
              cpu: "1",
              memory: "1Gi",
            },
            startupCpuBoost: true,
          },
          envs: [
            { name: "HOST", value: "0.0.0.0" },
            { name: "GOOGLE_CLOUD_PROJECT", value: project },
            { name: "GITHUB_APP_ID", value: githubAppId },
            {
              name: "GITHUB_APP_PRIVATE_KEY",
              valueSource: {
                secretKeyRef: {
                  secret: githubAppPrivateKeySecret.secretId,
                  version: "latest",
                },
              },
            },
            // Bump this value to roll a fresh revision after rotating the
            // private key in Secret Manager (new instances resolve "latest"
            // at startup; a template change is what forces them to exist).
            { name: "KEY_ROTATION", value: "2" },
          ],
        },
      ],
    },
  },
  {
    dependsOn: [githubAppPrivateKeyVersion, ...enabledServices],
  }
);

// Public access for internal Core HTTP queries and Pub/Sub push callbacks
export const adapterPublicBinding = new gcp.cloudrunv2.ServiceIamMember("adapter-public", {
  project: project,
  location: region,
  name: adapterService.name,
  role: "roles/run.invoker",
  member: "allUsers",
});
