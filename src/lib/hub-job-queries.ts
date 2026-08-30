// Shared direct-employer job queries for the state, specialty, and city hubs.
// Page 1 and each continuation route use these functions so their filters and
// ordering cannot drift.

import { supabase, hourIso, assertFreshOrThrow } from '@/lib/supabase'
import {
  JOB_LIST_FIELDS,
  PUBLIC_EMPLOYER_JOB_SOURCE,
  type PublicJob,
} from '@/lib/public-jobs'
import { buildSpecialtyOrFilter } from '@/lib/specialty-filter'

export const HUB_JOB_LIMITS = {
  state: 300,
  specialty: 300,
  city: 200,
} as const

/** Case-insensitive substring match over any of a city hub's name patterns. */
export function cityOrFilter(patterns: readonly string[]): string {
  return patterns.map((pattern) => `city.ilike.%${pattern}%`).join(',')
}

export async function fetchStateHubJobs(stateAbbr: string): Promise<PublicJob[]> {
  const result = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
    .eq('status', 'active')
    .eq('state', stateAbbr)
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .order('created_at', { ascending: false })
    .limit(HUB_JOB_LIMITS.state)
  assertFreshOrThrow(result, 'fetchStateHubJobs')
  return (result.data ?? []) as PublicJob[]
}

export async function fetchSpecialtyHubJobs(
  matchPatterns: readonly string[],
): Promise<PublicJob[]> {
  const result = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
    .eq('status', 'active')
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or(buildSpecialtyOrFilter(matchPatterns))
    .order('created_at', { ascending: false })
    .limit(HUB_JOB_LIMITS.specialty)
  assertFreshOrThrow(result, 'fetchSpecialtyHubJobs')
  return (result.data ?? []) as PublicJob[]
}

export async function fetchCityHubJobs(
  cityMatchPatterns: readonly string[],
  stateAbbr: string,
): Promise<PublicJob[]> {
  const result = await supabase
    .from('public_jobs')
    .select(JOB_LIST_FIELDS)
    .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
    .eq('status', 'active')
    .eq('state', stateAbbr)
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or(cityOrFilter(cityMatchPatterns))
    .order('created_at', { ascending: false })
    .limit(HUB_JOB_LIMITS.city)
  assertFreshOrThrow(result, 'fetchCityHubJobs')
  return (result.data ?? []) as PublicJob[]
}

export async function fetchCityHubJobCount(
  cityMatchPatterns: readonly string[],
  stateAbbr: string,
): Promise<number> {
  const result = await supabase
    .from('public_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('source', PUBLIC_EMPLOYER_JOB_SOURCE)
    .eq('status', 'active')
    .eq('state', stateAbbr)
    .is('deleted_at', null)
    .gt('expires_at', hourIso())
    .or(cityOrFilter(cityMatchPatterns))
  assertFreshOrThrow(result, 'fetchCityHubJobCount')
  return result.count ?? 0
}
