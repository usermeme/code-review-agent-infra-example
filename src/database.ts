import * as gcp from "@pulumi/gcp";
import { project } from "./config";
import { enabledServices } from "./apis";

// =============================================================================
// Cloud Firestore Native Mode Database
// The database itself is managed independently (manually or via dedicated
// foundation infra); Firestore is schemaless so new application collections
// (baseline_locks, processed_deliveries, ...) require no
// migrations or reinstalls — only field-level policies are declared here.
// =============================================================================
export const firestoreDatabaseId = "(default)";

// TTL for the Pub/Sub delivery-dedup records (processed_deliveries): claims
// expire on their own so the collection does not grow without bound.
// NOTE: the provider only supports enabling TTL (default 7-day expiry); the
// app docs suggest 86400s — tighten via gcloud if a shorter retention is
// desired:
//   gcloud firestore fields update ttl --collection-group=processed_deliveries \
//     --field-path=startedAt --ttl-duration=86400s
export const processedDeliveriesTtl = new gcp.firestore.Field(
  "processed-deliveries-ttl",
  {
    project: project,
    database: firestoreDatabaseId,
    collection: "processed_deliveries",
    field: "startedAt",
    ttlConfig: {},
  },
  { dependsOn: enabledServices }
);
