import * as gcp from "@pulumi/gcp";
import { project } from "./config";

// =============================================================================
// Enable Required Google Cloud APIs
// =============================================================================
export const requiredApis = [
  "run.googleapis.com",
  "pubsub.googleapis.com",
  "firestore.googleapis.com",
  "secretmanager.googleapis.com",
  "generativelanguage.googleapis.com",
  "apikeys.googleapis.com",
  "artifactregistry.googleapis.com",
  "iam.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "storage.googleapis.com",
  "compute.googleapis.com",
];

export const enabledServices: gcp.projects.Service[] = requiredApis.map(
  (api) =>
    new gcp.projects.Service(`enable-${api}`, {
      project: project,
      service: api,
      disableOnDestroy: false,
    })
);
