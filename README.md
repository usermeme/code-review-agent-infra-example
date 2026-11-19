# Code Review Agent - GitOps Cloud Infrastructure 🏗️

This repository is a **pure GitOps infrastructure repository** managing the Google Cloud Platform (GCP) resources for the multi-agent [Code Review Agent](https://github.com/usermeme/code-review-agent) using **Pulumi (TypeScript)** and **pnpm**.

---

## 🏛️ Architecture & GitOps Flow

This repository manages cloud infrastructure strictly through **Infrastructure as Code (IaC)**. No manual bash scripts or imperative local commands are needed.

```mermaid
flowchart TD
    subgraph GitOps["GitOps Workflow (GitHub)"]
        Dev["Engineer opens PR"] -->|1. PR Opened| CI_Preview["GitHub Actions: pulumi preview\n(Comments diff on PR)"]
        Review["Review & Approve"] -->|2. Merge to main| CI_Up["GitHub Actions: pulumi up\n(Applies changes to GCP)"]
    end

    subgraph Security["Zero-Key Authentication"]
        WIF["Workload Identity Federation (WIF)\nShort-lived OIDC Tokens"]
    end

    subgraph GCP["Google Cloud Platform (<your-gcp-project-id>)"]
        subgraph Compute["Cloud Run (Serverless)"]
            Ingress["github-ingress (Public Webhooks)"]
            Adapter["github-adapter (GitHub API & Comments)"]
            Core["core (AI Review Orchestrator)"]
        end

        subgraph EventBus["Cloud Pub/Sub (Push Subscriptions)"]
            T1["pr-events (Topic & Push Sub -> Core)"]
            T2["review-results (Topic & Push Sub -> Adapter)"]
        end

        subgraph Storage["State & Secrets"]
            FS[("Cloud Firestore\nNative Mode")]
            SM["Secret Manager\n(Auto-provisioned Secret Containers)"]
            AI[("Google AI Studio\nGemini API")]
        end
    end

    CI_Preview -->|Authenticate via OIDC| WIF
    CI_Up -->|Authenticate via OIDC| WIF
    WIF -->|Temporary Credentials| Compute
    WIF -->|Temporary Credentials| EventBus
    WIF -->|Temporary Credentials| Storage
```

---

## 🔒 Modern GitOps Principles Applied

1. **No Static Keys**: Zero `.json` service account keys. Authentication uses **Google Cloud Workload Identity Federation (WIF)** via cryptographic OIDC tokens minted per workflow run.
2. **Declarative Everything**: All Cloud Run services, Pub/Sub topics/subscriptions, Firestore databases, and IAM bindings are declared in Pulumi.
3. **The "Empty Secret" Pattern**:
   - When you need a new secret, declare it in Pulumi.
   - When your PR merges to `main`, Pulumi creates the secret container in **Google Secret Manager** (with a safe placeholder version).
   - Anyone with GCP access can then populate the sensitive value directly in Secret Manager or via GitHub Secrets.
4. **Clean Separation of Concerns**:
   - **Application Repo**: Compiles code and publishes container images.
   - **This Infra Repo**: Defines cloud topology, routing, security policies, and consumes image tags.

---

## 🚀 Step-by-Step Setup Guide

### Step 1: One-Time Bootstrap (Workload Identity Federation)

Run the one-time helper script to configure Workload Identity Federation in your GCP project. This allows GitHub Actions to talk to GCP without static keys. It needs `gcloud` and `pulumi`:

```bash
export GCP_PROJECT_ID="your-gcp-project-id"
export GITHUB_REPO="usermeme/code-review-agent-infra-example"
pnpm run setup:wif
```

The script (idempotent, safe to re-run) creates:

- a WIF pool and GitHub OIDC provider, trusting only your GitHub organization;
- the deployer `sa-pulumi-deployer`, impersonable **only from `GITHUB_REPO`**, with just the roles
  the stack needs (Cloud Run, Pub/Sub, Firestore indexes, Secret Manager, service accounts,
  project IAM, Service Usage);
- the private, versioned state bucket `gs://<your-gcp-project-id>-pulumi-state` (the deployer may
  read and write only this bucket);
- the secret `pulumi-config-passphrase` with a random passphrase that encrypts the secrets in the
  state (never printed; CI reads it from Secret Manager);
- the `prod` stack. **Commit the `encryptionsalt`** it adds to `Pulumi.prod.yaml`.

It prints two values:

- `GCP_WORKLOAD_IDENTITY_PROVIDER` (e.g., `projects/123456/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider`)
- `GCP_SERVICE_ACCOUNT` (e.g., `sa-pulumi-deployer@your-gcp-project-id.iam.gserviceaccount.com`)

> [!IMPORTANT]
> **Upgrading a deployment made with an older version of this script?** Older versions bound the
> whole pool to the deployer (any repository of your organization could act as it) and used an
> empty Pulumi passphrase. Re-run the script, then:
>
> - remove the pool-wide binding:
>   `gcloud iam service-accounts remove-iam-policy-binding sa-pulumi-deployer@<project>.iam.gserviceaccount.com --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/github-actions-pool/*"`
> - remove the old broad roles: `roles/editor` and `roles/storage.admin` on the project;
> - re-encrypt the state with the new passphrase: `pulumi stack export --show-secrets` with
>   `PULUMI_CONFIG_PASSPHRASE=""`, set `secrets_providers` to the new salt, then `pulumi stack import`
>   with the new passphrase, and commit the new `encryptionsalt`.

---

### Step 2: Configure GitHub Repository

Go to your repository settings: **Settings** → **Secrets and variables** → **Actions**:

#### 1. Repository Variables (Non-sensitive)

Click **Variables** tab → **New repository variable**:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: _(From Step 1 output)_
- `GCP_SERVICE_ACCOUNT`: _(From Step 1 output)_
- `GCP_PROJECT_ID`: `your-gcp-project-id`

Until all three variables are set, CI runs lint and build only and skips the Pulumi job with a notice, so a fresh fork stays green.

_(All other settings like project, region, image registry, and the agent models are declared in `Pulumi.prod.yaml`, see [Agent Models](#agent-models))_

#### Agent Models

The core service runs three Gemini agents, and the stack config picks the model for each one:

| Config key        | Core env var        | Required | Role                                                                                         |
| ----------------- | ------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `triageModel`     | `TRIAGE_MODEL`      | Yes      | Cheap text model: routes each PR to skip, light or deep review, and drops duplicate findings |
| `reviewerModel`   | `REVIEWER_MODEL`    | Yes      | Reads the diff with repo tools and proposes findings                                         |
| `verifierModel`   | `VERIFIER_MODEL`    | Yes      | Confirms or drops the proposed findings before they are posted                               |
| `deepReviewPaths` | `DEEP_REVIEW_PATHS` | No       | Comma-separated globs that always get a deep review. Unset keeps core's built-in list        |

To change a model, edit `Pulumi.prod.yaml` and open a PR; the preview shows the new core revision.

#### 2. Repository Secrets (Sensitive)

🎉 **NONE NEEDED! (Zero Secrets)**

- Pulumi state is saved in your own private Google Cloud Storage bucket (`gs://<your-gcp-project-id>-pulumi-state`). You do **not** need to register at app.pulumi.com or create a `PULUMI_ACCESS_TOKEN`.
- All runtime secrets live directly in **Google Cloud Secret Manager**:
  - `code-review-github-token` (`GITHUB_TOKEN`): GitHub Personal Access Token.
  - `code-review-github-webhook-secret` (`GITHUB_WEBHOOK_SECRET`): GitHub Webhook HMAC secret.
  - `code-review-gemini-api-key` (`GEMINI_API_KEY`): Google AI Studio API key.

> [!TIP]
> **100% Secretless GitHub CI/CD**: Your GitHub Repository Secrets tab can remain completely empty! GitHub Actions authenticates keylessly via Workload Identity Federation (WIF).

---

### Step 3: Trigger Deployment via Git

You are done! All future infrastructure changes happen strictly via Git:

```bash
git add .
git commit -m "feat: setup pure GitOps with Workload Identity Federation"
git push origin main
```

1. Merging to `main` triggers `.github/workflows/pulumi.yml`.
2. Pulumi provisions:
   - Required GCP APIs
   - Cloud Firestore Database
   - Cloud Pub/Sub topics & push subscriptions (`pr-events`, `review-results`)
   - Secret Manager secrets
   - 3 Cloud Run microservices (`code-review-github-ingress`, `code-review-github-adapter`, `code-review-core`)
3. Pulumi outputs your **`githubWebhookUrl`**.

---

### Step 4: Configure GitHub Organization Webhook

Once deployed, set up the webhook in your GitHub Organization:

1. Go to **Organization Settings** → **Webhooks** → **Add webhook**.
2. **Payload URL**: `https://<YOUR_INGRESS_URL>/api/v1/webhooks` (from Pulumi output `githubWebhookUrl`).
3. **Content type**: `application/json`.
4. **Secret**: Value of `GITHUB_WEBHOOK_SECRET` (configured in Secret Manager `code-review-github-webhook-secret`).
5. **Events**: Select **Pull requests** and **Issue comments**.

---

## 🔍 Testing & Verification

Verify webhook health and HMAC signature verification:

```bash
./scripts/test-webhook.sh https://<GATEWAY_URL> "your-webhook-secret"
```

---

## 💻 Local Development (Optional)

If you wish to test Pulumi locally on your machine:

```bash
# Build TypeScript
pnpm run build

# Preview changes locally
pnpm run pulumi:preview

# Deploy from local machine
pnpm run pulumi:up
```
