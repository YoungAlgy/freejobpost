// Retired source kept at the former deployment path so an accidental redeploy
// cannot restart third-party aggregate-job ingestion.
import { retiredFunctionResponse } from "../_shared/retired-function.ts";

Deno.serve(() => retiredFunctionResponse("adzuna-ingest"));
