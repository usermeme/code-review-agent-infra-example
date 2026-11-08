#!/usr/bin/env bash
# ==============================================================================
# One-time Setup for Google Cloud Workload Identity Federation (WIF)
# Enables secure, keyless authentication from GitHub Actions to Google Cloud.
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo -e "${RED}Error: GCP_PROJECT_ID is not set and no active gcloud project found.${NC}"
  echo "Usage: export GCP_PROJECT_ID=\"your-gcp-project-id\" && ./scripts/setup-wif.sh"
  exit 1
fi

GITHUB_REPO="${GITHUB_REPO:-usermeme/code-review-agent-infra-example}"
GITHUB_ORG="${GITHUB_REPO%%/*}"

POOL_NAME="github-actions-pool"
PROVIDER_NAME="github-provider"
DEPLOYER_SA="sa-pulumi-deployer"
DEPLOYER_SA_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo -e "${BLUE}========================================================================${NC}"
echo -e "${BLUE}Setting up Workload Identity Federation for GitHub Actions${NC}"
echo -e "Project:         ${GREEN}${PROJECT_ID}${NC}"
echo -e "Repository:      ${GREEN}${GITHUB_REPO}${NC}"
echo -e "${BLUE}========================================================================${NC}\n"

# 1. Enable required APIs
echo -e "${BLUE}1. Enabling required GCP IAM & STS APIs...${NC}"
gcloud services enable \
  iamcredentials.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  sts.googleapis.com \
  storage.googleapis.com \
  serviceusage.googleapis.com \
  --project="${PROJECT_ID}" --quiet

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
echo -e "${GREEN}✓ Project Number: ${PROJECT_NUMBER}${NC}"

# 2. Create Workload Identity Pool
echo -e "\n${BLUE}2. Creating Workload Identity Pool (${POOL_NAME})...${NC}"
if ! gcloud iam workload-identity-pools describe "${POOL_NAME}" --location="global" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${POOL_NAME}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --display-name="GitHub Actions Pool"
  echo -e "${GREEN}✓ Created pool ${POOL_NAME}${NC}"
else
  echo -e "${GREEN}✓ Pool ${POOL_NAME} already exists.${NC}"
fi

# 3. Create OIDC Provider
echo -e "\n${BLUE}3. Configuring GitHub OIDC Provider (${PROVIDER_NAME})...${NC}"
if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_NAME}" \
  --workload-identity-pool="${POOL_NAME}" --location="global" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_NAME}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_NAME}" \
    --display-name="GitHub Actions OIDC Provider" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository_owner == '${GITHUB_ORG}'"
  echo -e "${GREEN}✓ Created OIDC provider ${PROVIDER_NAME}${NC}"
else
  echo -e "${GREEN}✓ Provider ${PROVIDER_NAME} already exists.${NC}"
fi

# 4. Create Pulumi Deployer Service Account
echo -e "\n${BLUE}4. Creating Pulumi Deployer Service Account (${DEPLOYER_SA})...${NC}"
if ! gcloud iam service-accounts list --project="${PROJECT_ID}" --filter="email:${DEPLOYER_SA_EMAIL}" --format="value(email)" | grep -q "${DEPLOYER_SA_EMAIL}"; then
  gcloud iam service-accounts create "${DEPLOYER_SA}" \
    --project="${PROJECT_ID}" \
    --display-name="Pulumi GitOps Deployer" \
    --description="Used by GitHub Actions to deploy infrastructure via Workload Identity Federation"
  echo -e "${GREEN}✓ Created service account ${DEPLOYER_SA}${NC}"
else
  echo -e "${GREEN}✓ Service account ${DEPLOYER_SA} already exists.${NC}"
fi

# 5. Assign IAM roles to Pulumi Deployer
echo -e "\n${BLUE}5. Assigning IAM Roles to Deployer...${NC}"
ROLES=(
  "roles/editor"
  "roles/run.admin"
  "roles/resourcemanager.projectIamAdmin"
  "roles/secretmanager.admin"
  "roles/iam.serviceAccountUser"
  "roles/storage.admin"
  "roles/serviceusage.serviceUsageAdmin"
)

for ROLE in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOYER_SA_EMAIL}" \
    --role="${ROLE}" \
    --quiet >/dev/null
  echo -e "  - Assigned ${ROLE}"
done

# 6. Bind GitHub Actions repo to Service Account
echo -e "\n${BLUE}6. Binding GitHub repository to Service Account via WIF...${NC}"
gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}" \
  --quiet >/dev/null

gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/*" \
  --quiet >/dev/null

# 7. Create Pulumi State Storage Bucket
STATE_BUCKET="gs://${PROJECT_ID}-pulumi-state"
echo -e "\n${BLUE}7. Creating Pulumi State GCS Bucket (${STATE_BUCKET})...${NC}"
if ! gcloud storage buckets describe "${STATE_BUCKET}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "${STATE_BUCKET}" \
    --project="${PROJECT_ID}" \
    --location="us-central1" \
    --uniform-bucket-level-access
  gcloud storage buckets update "${STATE_BUCKET}" --versioning
  echo -e "${GREEN}✓ Created state bucket ${STATE_BUCKET}${NC}"
else
  echo -e "${GREEN}✓ State bucket ${STATE_BUCKET} already exists.${NC}"
fi

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"

echo -e "\n${GREEN}========================================================================${NC}"
echo -e "${GREEN}✓ Workload Identity Federation & State Bucket Configured!${NC}"
echo -e "${GREEN}========================================================================${NC}"
echo -e "\n${YELLOW}GitHub Actions Configuration Values:${NC}"
echo -e "Workload Identity Provider: ${GREEN}${WIF_PROVIDER}${NC}"
echo -e "Service Account Email:      ${GREEN}${DEPLOYER_SA_EMAIL}${NC}"
echo -e "\nSet these repository variables in GitHub Settings -> Secrets and variables -> Actions -> Variables:"
echo -e "  - GCP_WORKLOAD_IDENTITY_PROVIDER: ${WIF_PROVIDER}"
echo -e "  - GCP_SERVICE_ACCOUNT:            ${DEPLOYER_SA_EMAIL}"
echo -e "  - GCP_PROJECT_ID:                 ${PROJECT_ID}"
