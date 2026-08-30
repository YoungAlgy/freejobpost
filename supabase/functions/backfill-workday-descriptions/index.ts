// Retired source kept at the former deployment path so an accidental redeploy
// cannot resume maintenance of imported Workday listings.
import { retiredFunctionResponse } from "../_shared/retired-function.ts";

Deno.serve(() => retiredFunctionResponse("backfill-workday-descriptions"));
