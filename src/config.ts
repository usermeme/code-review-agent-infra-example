import * as pulumi from "@pulumi/pulumi";

// =============================================================================
// Stack Configuration & Inputs (Strictly required from Pulumi.<stack>.yaml)
// Zero fallbacks: all values must be declared in the stack config file.
// =============================================================================
const gcpConfig = new pulumi.Config("gcp");
const config = new pulumi.Config();

// Google Cloud Project & Region
export const project = gcpConfig.require("project");
export const region = gcpConfig.require("region");

// Gemini model per agent role. Core has no provider switch: each role runs on
// the Gemini model infra picks here.
// - triage: cheap text model; routes PRs (skip/light/deep) and dedups findings
// - reviewer: reads the diff and proposes findings
// - verifier: confirms or drops the reviewer's findings before they are posted
export const triageModel = config.require("triageModel");
export const reviewerModel = config.require("reviewerModel");
export const verifierModel = config.require("verifierModel");

// Optional: comma-separated globs that always get a deep review. The one
// exception to "zero fallbacks": unset keeps core's built-in list (auth,
// security, migrations, SQL, workflows, Dockerfiles, Terraform).
export const deepReviewPaths = config.get("deepReviewPaths");

// Which jobs core runs. Set one to false to run only the other, e.g. only the
// comment judge (checks resolved review threads) to keep costs low.
export const codeReviewEnabled = config.requireBoolean("codeReviewEnabled");
export const commentJudgeEnabled = config.requireBoolean("commentJudgeEnabled");

// Container Configuration
export const imageRegistry = config.require("imageRegistry");
export const imageTag = config.require("imageTag");

// Cloud Run Scaling Parameters
export const minInstances = config.requireNumber("minInstances");
export const maxInstances = config.requireNumber("maxInstances");

// GitHub App ID for the adapter's bot-identity auth. Required since app-repo
// #17 made GitHub App the adapter's only auth mode (PAT support removed).
export const githubAppId = config.require("githubAppId");
