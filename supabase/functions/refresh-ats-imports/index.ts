// Retired source kept at the former deployment path so an accidental redeploy
// cannot restart ATS, federal, candidate-matching, or imported-job indexing work.
import { retiredFunctionResponse } from "../_shared/retired-function.ts";

Deno.serve(() => retiredFunctionResponse("refresh-ats-imports"));
