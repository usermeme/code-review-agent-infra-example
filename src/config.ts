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

// Container & Model Configuration
export const geminiModel = config.require("geminiModel");
export const imageRegistry = config.require("imageRegistry");
export const imageTag = config.require("imageTag");

// Cloud Run Scaling Parameters
export const minInstances = config.requireNumber("minInstances");
export const maxInstances = config.requireNumber("maxInstances");

// GitHub App ID for the adapter's bot-identity auth. Required since app-repo
// #17 made GitHub App the adapter's only auth mode (PAT support removed).
export const githubAppId = config.require("githubAppId");
