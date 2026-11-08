import * as gcp from "@pulumi/gcp";
import { project, region, imageRegistry, imageTag, minInstances, maxInstances } from "../config";
import { runnerSa } from "../iam";
import { prEventsTopic } from "../pubsub";
import { githubWebhookSecret, githubWebhookSecretVersion } from "../secrets";
import { enabledServices } from "../apis";

// =============================================================================
// Cloud Run: GitHub Ingress Service (Public Webhook Ingress)
// Receives GitHub webhooks, verifies HMAC signature, publishes to pr-events.
// Zero database access, zero GitHub tokens.
// =============================================================================
export const ingressService = new gcp.cloudrunv2.Service(
  "code-review-github-ingress",
  {
    name: "code-review-github-ingress",
    location: region,
    ingress: "INGRESS_TRAFFIC_ALL",
    deletionProtection: false,
    template: {
      serviceAccount: runnerSa.email,
      timeout: "60s",
      scaling: {
        minInstanceCount: minInstances,
        maxInstanceCount: maxInstances,
      },
      containers: [
        {
          image: `${imageRegistry}/code-review-agent-github-ingress:${imageTag}`,
          resources: {
            limits: {
              cpu: "1",
              memory: "512Mi",
            },
            startupCpuBoost: true,
          },
          envs: [
            { name: "HOST", value: "0.0.0.0" },
            { name: "PR_EVENTS_TOPIC", value: prEventsTopic.name },
            { name: "GOOGLE_CLOUD_PROJECT", value: project },
            {
              name: "GITHUB_WEBHOOK_SECRET",
              valueSource: {
                secretKeyRef: {
                  secret: githubWebhookSecret.secretId,
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
    dependsOn: [prEventsTopic, githubWebhookSecretVersion, ...enabledServices],
  }
);

// Public access for GitHub Webhook callbacks
export const ingressPublicBinding = new gcp.cloudrunv2.ServiceIamMember("ingress-public", {
  project: project,
  location: region,
  name: ingressService.name,
  role: "roles/run.invoker",
  member: "allUsers",
});
