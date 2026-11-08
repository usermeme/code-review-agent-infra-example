import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { enabledServices } from "./apis";

// =============================================================================
// Secret Manager Secrets
// Secrets are managed directly in Google Cloud Secret Manager (Console or CLI).
// Pulumi provisions the containers with initial safe placeholders and ignoreChanges.
// =============================================================================

// 1. GitHub Personal Access Token (GITHUB_TOKEN)
// DEPRECATED: the adapter is GitHub App-only since app-repo #17 and no longer
// injects this secret. Kept temporarily as a rollback path for pre-#17 images;
// remove once the bot cutover is verified in production.
export const githubTokenSecret = new gcp.secretmanager.Secret(
  "github-token-secret",
  {
    secretId: "code-review-github-token",
    replication: { auto: {} },
  },
  { dependsOn: enabledServices }
);

export const githubTokenVersion = new gcp.secretmanager.SecretVersion(
  "github-token-version",
  {
    secret: githubTokenSecret.id,
    secretData: pulumi.secret("PLACEHOLDER_SET_IN_GCP_CONSOLE"),
  },
  { ignoreChanges: ["secretData"] }
);

// 2. GitHub Webhook Secret (GITHUB_WEBHOOK_SECRET)
export const githubWebhookSecret = new gcp.secretmanager.Secret(
  "github-webhook-secret",
  {
    secretId: "code-review-github-webhook-secret",
    replication: { auto: {} },
  },
  { dependsOn: enabledServices }
);

export const githubWebhookSecretVersion = new gcp.secretmanager.SecretVersion(
  "github-webhook-secret-version",
  {
    secret: githubWebhookSecret.id,
    secretData: pulumi.secret("PLACEHOLDER_SET_IN_GCP_CONSOLE"),
  },
  { ignoreChanges: ["secretData"] }
);

// 3. Google AI Studio Gemini API Key (GEMINI_API_KEY)
export const geminiKeySecret = new gcp.secretmanager.Secret(
  "gemini-api-key-secret",
  {
    secretId: "code-review-gemini-api-key",
    replication: { auto: {} },
  },
  { dependsOn: enabledServices }
);

export const geminiKeyVersion = new gcp.secretmanager.SecretVersion(
  "gemini-api-key-version",
  {
    secret: geminiKeySecret.id,
    secretData: pulumi.secret("PLACEHOLDER_SET_IN_GCP_CONSOLE"),
  },
  { ignoreChanges: ["secretData"] }
);

// 4. GitHub App Private Key (GITHUB_APP_PRIVATE_KEY)
// Used by the adapter for bot-identity auth (GitHub App mode). The PEM
// generated on the GitHub App settings page is added as a new version of
// this secret in the console/CLI; Pulumi only provisions the shell.
export const githubAppPrivateKeySecret = new gcp.secretmanager.Secret(
  "github-app-private-key-secret",
  {
    secretId: "code-review-github-app-private-key",
    replication: { auto: {} },
  },
  { dependsOn: enabledServices }
);

export const githubAppPrivateKeyVersion = new gcp.secretmanager.SecretVersion(
  "github-app-private-key-version",
  {
    secret: githubAppPrivateKeySecret.id,
    secretData: pulumi.secret("PLACEHOLDER_SET_IN_GCP_CONSOLE"),
  },
  { ignoreChanges: ["secretData"] }
);
