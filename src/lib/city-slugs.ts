// /city/[slug] hub pages. Closes the long-tail gap between state hubs
// (51 of them, broad) and per-job pages (9k+, narrow). Cities are where
// candidates actually search, "RN jobs Tampa", "physician jobs Houston",
// "nurse practitioner Boston" all funnel through city-level search.
//
// Why hand-curated instead of auto-generated from `public_jobs.city`?
//   1. City names in the DB are messy ("Tampa", "Tampa Bay", "Tampa, FL",
//      "TAMPA"). A naive distinct query produces hundreds of thin pages
//      and confuses the matrix-cell rule (≥5 active jobs to render).
//   2. We want hand-written editorial copy + top-employer breakouts
//      per metro, same pattern as state-slugs.ts.
//   3. Slug format `<city>-<state-abbr>` disambiguates Springfield-IL
//      vs Springfield-MO vs Springfield-MA at the URL level.
//
// To match jobs to a hub: case-insensitive substring against the city
// column, joined with the state filter. See `cityMatchPatterns` per hub
// (covers variants like "Tampa" / "Tampa Bay" / "South Tampa").

export interface CityHub {
  /** URL slug, pattern `<city-slug>-<state-abbr-lowercased>` (e.g. "tampa-fl") */
  slug: string
  /** Display name (e.g. "Tampa, FL") */
  name: string
  /** 2-letter state abbreviation */
  state: string
  /** Lowercase substrings that match this city in the DB. First entry is
   *  the canonical name; additional entries cover known variants. */
  cityMatchPatterns: string[]
  /** SEO meta description, 120-155 chars */
  metaDescription: string
  /** Page lede paragraph */
  shortDescription: string
  /** Major healthcare employers in this metro (for context blocks) */
  topEmployers: string[]
  /** Optional one-sentence editorial note */
  editorialNote?: string
}

export const CITY_HUBS: CityHub[] = [
  {
    slug: 'tampa-fl',
    name: 'Tampa, FL',
    state: 'FL',
    cityMatchPatterns: ['tampa'],
    metaDescription:
      'Free Tampa Bay healthcare jobs, RN, NP, PA, physician, allied. Tampa General, AdventHealth, BayCare. No recruiter spam.',
    shortDescription:
      'Tampa Bay healthcare openings, physicians, NPs, PAs, RNs, therapists, and allied roles across Tampa General, AdventHealth, BayCare, and the smaller specialty groups.',
    topEmployers: ['Tampa General', 'AdventHealth Tampa', 'BayCare', 'Moffitt Cancer Center', 'James A. Haley VA'],
    editorialNote:
      'Tampa is one of the fastest-growing US healthcare labor markets, Moffitt + AdventHealth alone have driven 7% YoY clinical-hiring growth since 2024.',
  },
  {
    slug: 'miami-fl',
    name: 'Miami, FL',
    state: 'FL',
    cityMatchPatterns: ['miami'],
    metaDescription:
      'Free Miami healthcare jobs, RN, NP, PA, physician, allied. Jackson Health, Baptist Health, UM Health. No recruiter spam.',
    shortDescription:
      'Miami-Dade healthcare openings across Jackson Health, Baptist Health South Florida, University of Miami Health System, and Mount Sinai.',
    topEmployers: ['Jackson Health System', 'Baptist Health South Florida', 'University of Miami Health', 'Mount Sinai Medical Center'],
  },
  {
    slug: 'jacksonville-fl',
    name: 'Jacksonville, FL',
    state: 'FL',
    cityMatchPatterns: ['jacksonville'],
    metaDescription:
      'Free Jacksonville healthcare jobs, RN, NP, PA, physician, allied. Mayo Clinic, Baptist Health, Ascension St. Vincent.',
    shortDescription:
      'Jacksonville-area openings, Mayo Clinic Florida, Baptist Health Jacksonville, Ascension St. Vincent, and the Mayflower military-medicine network.',
    topEmployers: ['Mayo Clinic Florida', 'Baptist Health', 'Ascension St. Vincent', 'UF Health Jacksonville'],
  },
  {
    slug: 'orlando-fl',
    name: 'Orlando, FL',
    state: 'FL',
    cityMatchPatterns: ['orlando'],
    metaDescription:
      'Free Orlando healthcare jobs, RN, NP, PA, physician, allied. AdventHealth Orlando, Orlando Health, Nemours.',
    shortDescription:
      'Orlando-area healthcare openings, AdventHealth Orlando (largest hospital in FL by admissions), Orlando Health, Nemours, and the UCF College of Medicine network.',
    topEmployers: ['AdventHealth Orlando', 'Orlando Health', 'Nemours Children\'s Hospital', 'UCF College of Medicine'],
  },
  {
    slug: 'houston-tx',
    name: 'Houston, TX',
    state: 'TX',
    cityMatchPatterns: ['houston'],
    metaDescription:
      'Free Houston healthcare jobs, RN, NP, PA, physician, allied. Texas Medical Center anchors the largest US healthcare cluster.',
    shortDescription:
      'Houston healthcare jobs, the Texas Medical Center alone employs 120,000+. MD Anderson, Memorial Hermann, Methodist, Texas Children\'s, Baylor College of Medicine.',
    topEmployers: ['MD Anderson Cancer Center', 'Memorial Hermann Health System', 'Houston Methodist', 'Texas Children\'s Hospital', 'Baylor College of Medicine'],
  },
  {
    slug: 'dallas-tx',
    name: 'Dallas, TX',
    state: 'TX',
    cityMatchPatterns: ['dallas'],
    metaDescription:
      'Free Dallas healthcare jobs, RN, NP, PA, physician, allied. UT Southwestern, Baylor Scott & White, Texas Health Resources.',
    shortDescription:
      'Dallas-Fort Worth healthcare openings, UT Southwestern, Baylor Scott & White (largest non-profit health system in TX), Texas Health Resources, Children\'s Health.',
    topEmployers: ['UT Southwestern Medical Center', 'Baylor Scott & White Health', 'Texas Health Resources', 'Children\'s Health'],
  },
  {
    slug: 'austin-tx',
    name: 'Austin, TX',
    state: 'TX',
    cityMatchPatterns: ['austin'],
    metaDescription:
      'Free Austin healthcare jobs, RN, NP, PA, physician, allied. Ascension Seton, St. David\'s, Dell Medical School.',
    shortDescription:
      'Austin-area healthcare openings, Ascension Seton, St. David\'s HealthCare, Dell Medical School at UT Austin, and the rapidly-expanding South Austin metro.',
    topEmployers: ['Ascension Seton', 'St. David\'s HealthCare', 'Dell Medical School', 'Baylor Scott & White Health'],
  },
  {
    slug: 'san-antonio-tx',
    name: 'San Antonio, TX',
    state: 'TX',
    cityMatchPatterns: ['san antonio'],
    metaDescription:
      'Free San Antonio healthcare jobs, RN, NP, PA, physician, allied. Methodist, Baptist Health, UT Health San Antonio.',
    shortDescription:
      'San Antonio healthcare openings, Methodist Healthcare System, Baptist Health, UT Health San Antonio, and the largest military-medicine hub in the country (San Antonio Military Medical Center).',
    topEmployers: ['Methodist Healthcare System', 'Baptist Health System', 'UT Health San Antonio', 'San Antonio Military Medical Center'],
  },
  {
    slug: 'los-angeles-ca',
    name: 'Los Angeles, CA',
    state: 'CA',
    cityMatchPatterns: ['los angeles'],
    metaDescription:
      'Free Los Angeles healthcare jobs, RN, NP, PA, physician, allied. Cedars-Sinai, UCLA Health, Kaiser Permanente, Keck Medicine.',
    shortDescription:
      'Los Angeles healthcare openings, Cedars-Sinai, UCLA Health, Kaiser Permanente Southern California, Keck Medicine of USC, and the LADHS county-hospital system.',
    topEmployers: ['Cedars-Sinai', 'UCLA Health', 'Kaiser Permanente', 'Keck Medicine of USC', 'LA County Department of Health Services'],
  },
  {
    slug: 'san-francisco-ca',
    name: 'San Francisco, CA',
    state: 'CA',
    cityMatchPatterns: ['san francisco'],
    metaDescription:
      'Free San Francisco healthcare jobs, RN, NP, PA, physician, allied. UCSF, Sutter, Kaiser, Stanford Bay Area.',
    shortDescription:
      'San Francisco Bay Area healthcare openings, UCSF, Sutter Health, Kaiser Permanente Northern California, Stanford Health Care, and the dense biotech-adjacent clinical-research market.',
    topEmployers: ['UCSF Health', 'Sutter Health', 'Kaiser Permanente', 'Stanford Health Care', 'Dignity Health'],
  },
  {
    slug: 'san-diego-ca',
    name: 'San Diego, CA',
    state: 'CA',
    cityMatchPatterns: ['san diego'],
    metaDescription:
      'Free San Diego healthcare jobs, RN, NP, PA, physician, allied. Sharp, Scripps, UC San Diego Health, Kaiser.',
    shortDescription:
      'San Diego healthcare openings, Sharp HealthCare, Scripps Health, UC San Diego Health, Kaiser Permanente, and the Naval Medical Center San Diego.',
    topEmployers: ['Sharp HealthCare', 'Scripps Health', 'UC San Diego Health', 'Kaiser Permanente', 'Naval Medical Center San Diego'],
  },
  {
    slug: 'sacramento-ca',
    name: 'Sacramento, CA',
    state: 'CA',
    cityMatchPatterns: ['sacramento'],
    metaDescription:
      'Free Sacramento healthcare jobs, RN, NP, PA, physician, allied. UC Davis, Sutter, Kaiser, Dignity Health.',
    shortDescription:
      'Sacramento-area healthcare openings, UC Davis Health, Sutter Health Central Valley, Kaiser Permanente, and Dignity Health Mercy network.',
    topEmployers: ['UC Davis Health', 'Sutter Health', 'Kaiser Permanente', 'Dignity Health Mercy', 'Adventist Health'],
  },
  {
    slug: 'new-york-ny',
    name: 'New York, NY',
    state: 'NY',
    cityMatchPatterns: ['new york', 'manhattan', 'brooklyn', 'bronx', 'queens'],
    metaDescription:
      'Free New York City healthcare jobs, RN, NP, PA, physician, allied. NYU Langone, Mount Sinai, NewYork-Presbyterian, NYC Health + Hospitals.',
    shortDescription:
      'NYC healthcare openings across the five boroughs, NYU Langone, Mount Sinai, NewYork-Presbyterian, Northwell Health, Memorial Sloan Kettering, NYC Health + Hospitals (largest US public-hospital system).',
    topEmployers: ['NYU Langone Health', 'Mount Sinai Health System', 'NewYork-Presbyterian', 'Northwell Health', 'Memorial Sloan Kettering', 'NYC Health + Hospitals'],
  },
  {
    slug: 'chicago-il',
    name: 'Chicago, IL',
    state: 'IL',
    cityMatchPatterns: ['chicago'],
    metaDescription:
      'Free Chicago healthcare jobs, RN, NP, PA, physician, allied. Northwestern, Rush, UChicago Medicine, Advocate Aurora.',
    shortDescription:
      'Chicago-area healthcare openings, Northwestern Medicine, Rush University Medical Center, UChicago Medicine, Advocate Aurora Health, Loyola Medicine, Cook County Health.',
    topEmployers: ['Northwestern Medicine', 'Rush University Medical Center', 'UChicago Medicine', 'Advocate Aurora Health', 'Loyola Medicine'],
  },
  {
    slug: 'boston-ma',
    name: 'Boston, MA',
    state: 'MA',
    cityMatchPatterns: ['boston'],
    metaDescription:
      'Free Boston healthcare jobs, RN, NP, PA, physician, allied. Mass General Brigham, Beth Israel Lahey, Boston Medical Center.',
    shortDescription:
      'Boston healthcare openings, Mass General Brigham (largest non-profit in MA), Beth Israel Lahey Health, Boston Medical Center, Dana-Farber, Tufts Medicine, the Harvard teaching-hospital cluster.',
    topEmployers: ['Mass General Brigham', 'Beth Israel Lahey Health', 'Boston Medical Center', 'Dana-Farber Cancer Institute', 'Tufts Medicine'],
  },
  {
    slug: 'philadelphia-pa',
    name: 'Philadelphia, PA',
    state: 'PA',
    cityMatchPatterns: ['philadelphia'],
    metaDescription:
      'Free Philadelphia healthcare jobs, RN, NP, PA, physician, allied. Penn Medicine, Jefferson Health, CHOP, Temple.',
    shortDescription:
      'Philadelphia-area healthcare openings, Penn Medicine, Jefferson Health (largest in PA by acute beds), Children\'s Hospital of Philadelphia, Temple Health, Main Line Health.',
    topEmployers: ['Penn Medicine', 'Jefferson Health', 'Children\'s Hospital of Philadelphia', 'Temple Health', 'Main Line Health'],
  },
  {
    slug: 'pittsburgh-pa',
    name: 'Pittsburgh, PA',
    state: 'PA',
    cityMatchPatterns: ['pittsburgh'],
    metaDescription:
      'Free Pittsburgh healthcare jobs, RN, NP, PA, physician, allied. UPMC, Allegheny Health Network, VA Pittsburgh.',
    shortDescription:
      'Pittsburgh-area openings dominated by UPMC (largest non-government employer in PA), with Allegheny Health Network + VA Pittsburgh covering the rest.',
    topEmployers: ['UPMC', 'Allegheny Health Network', 'VA Pittsburgh Healthcare System'],
  },
  {
    slug: 'atlanta-ga',
    name: 'Atlanta, GA',
    state: 'GA',
    cityMatchPatterns: ['atlanta'],
    metaDescription:
      'Free Atlanta healthcare jobs, RN, NP, PA, physician, allied. Emory, Northside, Piedmont, WellStar.',
    shortDescription:
      'Atlanta-metro healthcare openings, Emory Healthcare, Northside Hospital, Piedmont Healthcare, WellStar Health System, Grady Health (Georgia\'s largest safety-net).',
    topEmployers: ['Emory Healthcare', 'Northside Hospital', 'Piedmont Healthcare', 'WellStar Health System', 'Grady Health System'],
  },
  {
    slug: 'charlotte-nc',
    name: 'Charlotte, NC',
    state: 'NC',
    cityMatchPatterns: ['charlotte'],
    metaDescription:
      'Free Charlotte healthcare jobs, RN, NP, PA, physician, allied. Atrium Health (Advocate), Novant Health.',
    shortDescription:
      'Charlotte-area healthcare openings, Atrium Health (now part of Advocate Health, the 3rd-largest non-profit US system), Novant Health, and the smaller specialty groups across the Piedmont.',
    topEmployers: ['Atrium Health', 'Novant Health', 'Advocate Health'],
  },
  {
    slug: 'nashville-tn',
    name: 'Nashville, TN',
    state: 'TN',
    cityMatchPatterns: ['nashville'],
    metaDescription:
      'Free Nashville healthcare jobs, RN, NP, PA, physician, allied. Vanderbilt, HCA, TriStar, Saint Thomas.',
    shortDescription:
      'Nashville healthcare openings, Vanderbilt University Medical Center, HCA Healthcare (corporate HQ here), TriStar Health, Ascension Saint Thomas.',
    topEmployers: ['Vanderbilt University Medical Center', 'HCA Healthcare', 'TriStar Health', 'Ascension Saint Thomas'],
    editorialNote:
      'Nashville is HCA Healthcare\'s corporate home and houses the country\'s largest concentration of hospital-management headquarters.',
  },
  {
    slug: 'phoenix-az',
    name: 'Phoenix, AZ',
    state: 'AZ',
    cityMatchPatterns: ['phoenix'],
    metaDescription:
      'Free Phoenix healthcare jobs, RN, NP, PA, physician, allied. Banner Health, HonorHealth, Mayo Clinic Arizona, Dignity Health.',
    shortDescription:
      'Phoenix-area healthcare openings, Banner Health (largest in AZ), HonorHealth, Mayo Clinic Arizona, Dignity Health, Phoenix Children\'s Hospital.',
    topEmployers: ['Banner Health', 'HonorHealth', 'Mayo Clinic Arizona', 'Dignity Health', 'Phoenix Children\'s Hospital'],
  },
  {
    slug: 'denver-co',
    name: 'Denver, CO',
    state: 'CO',
    cityMatchPatterns: ['denver'],
    metaDescription:
      'Free Denver healthcare jobs, RN, NP, PA, physician, allied. UCHealth, Centura, Kaiser Permanente, National Jewish Health.',
    shortDescription:
      'Denver-area healthcare openings, UCHealth (the academic flagship), Centura Health, Kaiser Permanente Colorado, SCL Health, National Jewish Health (respiratory specialty).',
    topEmployers: ['UCHealth', 'Centura Health', 'Kaiser Permanente Colorado', 'SCL Health', 'National Jewish Health'],
  },
  {
    slug: 'seattle-wa',
    name: 'Seattle, WA',
    state: 'WA',
    cityMatchPatterns: ['seattle'],
    metaDescription:
      'Free Seattle healthcare jobs, RN, NP, PA, physician, allied. UW Medicine, Virginia Mason, Swedish, Providence.',
    shortDescription:
      'Seattle-area healthcare openings, UW Medicine, Virginia Mason Franciscan Health, Swedish Medical Center (now Providence), Seattle Children\'s, Fred Hutchinson Cancer Center.',
    topEmployers: ['UW Medicine', 'Virginia Mason Franciscan Health', 'Providence Swedish', 'Seattle Children\'s', 'Fred Hutchinson Cancer Center'],
  },
  {
    slug: 'minneapolis-mn',
    name: 'Minneapolis, MN',
    state: 'MN',
    cityMatchPatterns: ['minneapolis', 'saint paul', 'st. paul', 'st paul'],
    metaDescription:
      'Free Minneapolis-Saint Paul healthcare jobs, RN, NP, PA, physician. Mayo, M Health Fairview, HealthPartners, Allina.',
    shortDescription:
      'Twin Cities healthcare openings, M Health Fairview, HealthPartners, Allina Health, Mayo Clinic outreach campuses, Children\'s Minnesota.',
    topEmployers: ['M Health Fairview', 'HealthPartners', 'Allina Health', 'Mayo Clinic', 'Children\'s Minnesota'],
  },
  {
    slug: 'indianapolis-in',
    name: 'Indianapolis, IN',
    state: 'IN',
    cityMatchPatterns: ['indianapolis'],
    metaDescription:
      'Free Indianapolis healthcare jobs, RN, NP, PA, physician, allied. IU Health, Ascension St. Vincent, Eskenazi, Community Health Network.',
    shortDescription:
      'Indianapolis-area healthcare openings, Indiana University Health (largest in IN), Ascension St. Vincent, Eskenazi Health, Community Health Network, Franciscan Health.',
    topEmployers: ['Indiana University Health', 'Ascension St. Vincent', 'Eskenazi Health', 'Community Health Network', 'Franciscan Health'],
  },
  {
    slug: 'cleveland-oh',
    name: 'Cleveland, OH',
    state: 'OH',
    cityMatchPatterns: ['cleveland'],
    metaDescription:
      'Free Cleveland healthcare jobs, RN, NP, PA, physician, allied. Cleveland Clinic, University Hospitals, MetroHealth.',
    shortDescription:
      'Cleveland-area healthcare openings, Cleveland Clinic main campus, University Hospitals (UH), MetroHealth (county safety-net), and the regional VA system.',
    topEmployers: ['Cleveland Clinic', 'University Hospitals', 'MetroHealth System', 'Louis Stokes Cleveland VA'],
    editorialNote:
      'Cleveland Clinic ranks #2 on the U.S. News Honor Roll and operates ~30 outpatient sites across NE Ohio, combined with UH the metro carries an unusually deep specialty bench for its population.',
  },
  {
    slug: 'columbus-oh',
    name: 'Columbus, OH',
    state: 'OH',
    cityMatchPatterns: ['columbus'],
    metaDescription:
      'Free Columbus healthcare jobs, RN, NP, PA, physician, allied. OhioHealth, Ohio State Wexner, Nationwide Children\'s, Mount Carmel.',
    shortDescription:
      'Columbus-area healthcare openings, OhioHealth, Ohio State Wexner Medical Center, Nationwide Children\'s, Mount Carmel Health.',
    topEmployers: ['OhioHealth', 'Ohio State Wexner Medical Center', 'Nationwide Children\'s Hospital', 'Mount Carmel Health System'],
  },
  {
    slug: 'cincinnati-oh',
    name: 'Cincinnati, OH',
    state: 'OH',
    cityMatchPatterns: ['cincinnati'],
    metaDescription:
      'Free Cincinnati healthcare jobs, RN, NP, PA, physician, allied. Cincinnati Children\'s, TriHealth, UC Health, Mercy Health.',
    shortDescription:
      'Cincinnati-area healthcare openings, Cincinnati Children\'s Hospital (top-ranked US pediatric center), TriHealth, UC Health, Mercy Health.',
    topEmployers: ['Cincinnati Children\'s Hospital', 'TriHealth', 'UC Health', 'Mercy Health'],
  },
  {
    slug: 'detroit-mi',
    name: 'Detroit, MI',
    state: 'MI',
    cityMatchPatterns: ['detroit'],
    metaDescription:
      'Free Detroit healthcare jobs, RN, NP, PA, physician, allied. Henry Ford, Beaumont, DMC, Ascension St. John.',
    shortDescription:
      'Detroit-area healthcare openings, Henry Ford Health, Corewell Health (formerly Beaumont), Detroit Medical Center (DMC), Ascension Michigan.',
    topEmployers: ['Henry Ford Health', 'Corewell Health', 'Detroit Medical Center', 'Ascension Michigan'],
  },
  {
    slug: 'st-louis-mo',
    name: 'St. Louis, MO',
    state: 'MO',
    cityMatchPatterns: ['st. louis', 'st louis', 'saint louis'],
    metaDescription:
      'Free St. Louis healthcare jobs, RN, NP, PA, physician, allied. BJC HealthCare, SSM Health, Mercy, St. Luke\'s.',
    shortDescription:
      'St. Louis-area healthcare openings, BJC HealthCare (Washington University academic system), SSM Health, Mercy, St. Luke\'s Hospital.',
    topEmployers: ['BJC HealthCare', 'SSM Health', 'Mercy', 'St. Luke\'s Hospital'],
  },
  {
    slug: 'kansas-city-mo',
    name: 'Kansas City, MO',
    state: 'MO',
    cityMatchPatterns: ['kansas city'],
    metaDescription:
      'Free Kansas City healthcare jobs, RN, NP, PA, physician, allied. Saint Luke\'s, HCA Midwest, University of Kansas Health, Children\'s Mercy.',
    shortDescription:
      'Kansas City metro healthcare openings (both MO + KS sides), Saint Luke\'s Health System, HCA Midwest Health, University of Kansas Health System, Children\'s Mercy.',
    topEmployers: ['Saint Luke\'s Health System', 'HCA Midwest Health', 'University of Kansas Health System', 'Children\'s Mercy'],
  },
  {
    slug: 'baltimore-md',
    name: 'Baltimore, MD',
    state: 'MD',
    cityMatchPatterns: ['baltimore'],
    metaDescription:
      'Free Baltimore healthcare jobs, RN, NP, PA, physician, allied. Johns Hopkins, University of Maryland Medical, MedStar, LifeBridge.',
    shortDescription:
      'Baltimore-area healthcare openings, Johns Hopkins (#1 US News Honor Roll most years), University of Maryland Medical System, MedStar Health, LifeBridge Health.',
    topEmployers: ['Johns Hopkins Medicine', 'University of Maryland Medical System', 'MedStar Health', 'LifeBridge Health'],
  },
]

export function getCityHub(slug: string): CityHub | undefined {
  return CITY_HUBS.find((c) => c.slug === slug)
}

/**
 * Find the CityHub whose match patterns hit a given city string + state.
 * Used by per-job pages to construct an internal link to the relevant
 * city hub when the job's city + state line up with a curated metro.
 * Returns undefined for cities NOT in the curated list (most US cities).
 */
export function findCityHub(
  city: string | null | undefined,
  state: string | null | undefined,
): CityHub | undefined {
  if (!city || !state) return undefined
  const cityLower = city.toLowerCase().trim()
  const stateUpper = state.toUpperCase().trim()
  return CITY_HUBS.find(
    (h) =>
      h.state === stateUpper &&
      h.cityMatchPatterns.some((p) => cityLower.includes(p)),
  )
}
