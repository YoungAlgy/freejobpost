// State hub pages — one per US state with the highest healthcare-job
// density. Mirrors the specialty-hub pattern: each page ranks for
// "[state] healthcare jobs" and similar long-tail queries.

export type StateHub = {
  slug: string
  abbr: string             // 2-letter state code (matches public_jobs.state)
  name: string             // full state name
  metaDescription: string  // 150-160 chars
  shortDescription: string // for the page lede
  // Major employers / metros to mention in the page body for local relevance
  majorMetros: string[]
  topEmployers: string[]
}

export const STATE_HUBS: StateHub[] = [
  {
    slug: 'florida',
    abbr: 'FL',
    name: 'Florida',
    metaDescription: 'Free Florida healthcare jobs from verified employers — Tampa, Miami, Jacksonville, Orlando, Naples. Physician, NP, PA, RN, CRNA, and allied roles.',
    shortDescription: "Florida healthcare openings spanning the state's top systems — Tampa Bay, Miami-Dade, Jacksonville, Orlando, and Southwest Florida (Naples / Fort Myers).",
    majorMetros: ['Tampa', 'Miami', 'Jacksonville', 'Orlando', 'Naples', 'Fort Myers', 'Tallahassee'],
    topEmployers: ['Tampa General', 'AdventHealth', 'NCH Healthcare System', 'Lee Health', 'Mayo Clinic Florida', 'Baptist Health South Florida', 'Memorial Healthcare System', 'University of Miami Health'],
  },
  {
    slug: 'texas',
    abbr: 'TX',
    name: 'Texas',
    metaDescription: 'Free Texas healthcare jobs — Dallas, Houston, Austin, San Antonio. Physician, NP, PA, RN, CRNA roles from Houston Methodist, MD Anderson, UT Southwestern, more.',
    shortDescription: 'Texas healthcare openings across DFW, Houston, Austin, San Antonio, and the Rio Grande Valley.',
    majorMetros: ['Houston', 'Dallas', 'Fort Worth', 'Austin', 'San Antonio', 'El Paso', 'McAllen'],
    topEmployers: ['Houston Methodist', 'MD Anderson', 'UT Southwestern', 'Baylor Scott & White', 'HCA Healthcare', 'Memorial Hermann', 'Texas Health Resources', 'Cook Children\'s'],
  },
  {
    slug: 'california',
    abbr: 'CA',
    name: 'California',
    metaDescription: 'Free California healthcare jobs — LA, SF, San Diego, Sacramento. Physician, NP, PA, RN, CRNA roles from UCSF, Cedars-Sinai, Stanford, Kaiser, more.',
    shortDescription: 'California healthcare openings across LA, the Bay Area, San Diego, Sacramento, and Central Valley.',
    majorMetros: ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'San Jose', 'Fresno', 'Long Beach'],
    topEmployers: ['UCSF Health', 'Cedars-Sinai', 'Stanford Health Care', 'Kaiser Permanente', 'UCLA Health', 'Sutter Health', 'Dignity Health', 'Scripps Health'],
  },
  {
    slug: 'new-york',
    abbr: 'NY',
    name: 'New York',
    metaDescription: 'Free New York healthcare jobs — NYC, Long Island, Westchester, Buffalo, Rochester. Physician, NP, PA, RN, CRNA roles from NYP, Mount Sinai, Northwell, more.',
    shortDescription: 'New York healthcare openings across NYC, Long Island, Hudson Valley, and upstate metros.',
    majorMetros: ['New York City', 'Buffalo', 'Rochester', 'Albany', 'Syracuse', 'Long Island', 'Westchester'],
    topEmployers: ['NewYork-Presbyterian', 'Mount Sinai Health System', 'Northwell Health', 'NYU Langone', 'Memorial Sloan Kettering', 'Hospital for Special Surgery', 'University of Rochester'],
  },
  {
    slug: 'illinois',
    abbr: 'IL',
    name: 'Illinois',
    metaDescription: 'Free Illinois healthcare jobs — Chicago, suburbs, Springfield. Physician, NP, PA, RN, CRNA roles from Northwestern, Rush, UChicago, Advocate, more.',
    shortDescription: 'Illinois healthcare openings across Chicagoland, the suburbs, and downstate.',
    majorMetros: ['Chicago', 'Aurora', 'Joliet', 'Naperville', 'Rockford', 'Springfield', 'Peoria'],
    topEmployers: ['Northwestern Medicine', 'Rush University Medical Center', 'UChicago Medicine', 'Advocate Aurora Health', 'NorthShore University HealthSystem', 'Loyola Medicine'],
  },
  {
    slug: 'pennsylvania',
    abbr: 'PA',
    name: 'Pennsylvania',
    metaDescription: 'Free Pennsylvania healthcare jobs — Philadelphia, Pittsburgh, Harrisburg. Physician, NP, PA, RN, CRNA roles from UPMC, Penn Medicine, Geisinger, more.',
    shortDescription: 'Pennsylvania healthcare openings across Philadelphia, Pittsburgh, Lehigh Valley, and central PA.',
    majorMetros: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Harrisburg', 'Erie', 'Reading', 'Scranton'],
    topEmployers: ['UPMC', 'Penn Medicine', 'Geisinger', 'Jefferson Health', 'Temple Health', 'Lehigh Valley Health Network', 'Children\'s Hospital of Philadelphia'],
  },
  {
    slug: 'ohio',
    abbr: 'OH',
    name: 'Ohio',
    metaDescription: 'Free Ohio healthcare jobs — Cleveland, Columbus, Cincinnati. Physician, NP, PA, RN, CRNA roles from Cleveland Clinic, OSU Wexner, Cincinnati Children\'s, more.',
    shortDescription: 'Ohio healthcare openings across Cleveland, Columbus, Cincinnati, Toledo, and Akron.',
    majorMetros: ['Cleveland', 'Columbus', 'Cincinnati', 'Toledo', 'Akron', 'Dayton', 'Youngstown'],
    topEmployers: ['Cleveland Clinic', 'OSU Wexner Medical Center', 'Cincinnati Children\'s', 'University Hospitals (UH Cleveland)', 'OhioHealth', 'Mount Carmel Health', 'Bon Secours Mercy Health'],
  },
  {
    slug: 'georgia',
    abbr: 'GA',
    name: 'Georgia',
    metaDescription: 'Free Georgia healthcare jobs — Atlanta, Savannah, Augusta. Physician, NP, PA, RN, CRNA roles from Emory, Piedmont, Northside, Wellstar, more.',
    shortDescription: 'Georgia healthcare openings across Atlanta metro, Savannah, Augusta, and Macon.',
    majorMetros: ['Atlanta', 'Savannah', 'Augusta', 'Macon', 'Columbus', 'Athens', 'Marietta'],
    topEmployers: ['Emory Healthcare', 'Piedmont Healthcare', 'Northside Hospital', 'Wellstar Health System', 'Children\'s Healthcare of Atlanta', 'Augusta University Health'],
  },
  {
    slug: 'north-carolina',
    abbr: 'NC',
    name: 'North Carolina',
    metaDescription: 'Free North Carolina healthcare jobs — Charlotte, Raleigh, Durham. Physician, NP, PA, RN, CRNA roles from Duke, UNC Health, Atrium, Novant, more.',
    shortDescription: 'North Carolina healthcare openings across the Triangle, Charlotte metro, and Triad.',
    majorMetros: ['Charlotte', 'Raleigh', 'Durham', 'Greensboro', 'Winston-Salem', 'Asheville', 'Wilmington'],
    topEmployers: ['Duke Health', 'UNC Health', 'Atrium Health', 'Novant Health', 'Wake Forest Baptist Health', 'Mission Health', 'Cone Health'],
  },
  {
    slug: 'massachusetts',
    abbr: 'MA',
    name: 'Massachusetts',
    metaDescription: 'Free Massachusetts healthcare jobs — Boston metro + statewide. Physician, NP, PA, RN, CRNA roles from MGH, BWH, Beth Israel, Boston Children\'s, more.',
    shortDescription: 'Massachusetts healthcare openings across Greater Boston, Worcester, and the South Coast.',
    majorMetros: ['Boston', 'Cambridge', 'Worcester', 'Springfield', 'Lowell', 'Quincy'],
    topEmployers: ['Massachusetts General Hospital', 'Brigham and Women\'s Hospital', 'Beth Israel Deaconess', 'Boston Children\'s Hospital', 'Tufts Medical Center', 'Dana-Farber Cancer Institute', 'UMass Memorial Health'],
  },
  {
    slug: 'michigan',
    abbr: 'MI',
    name: 'Michigan',
    metaDescription: 'Free Michigan healthcare jobs — Detroit, Grand Rapids, Ann Arbor. Physician, NP, PA, RN, CRNA roles from Henry Ford, Beaumont, U-M, Spectrum, more.',
    shortDescription: 'Michigan healthcare openings across metro Detroit, Grand Rapids, Ann Arbor, and Lansing.',
    majorMetros: ['Detroit', 'Grand Rapids', 'Ann Arbor', 'Lansing', 'Warren', 'Sterling Heights', 'Flint'],
    topEmployers: ['Henry Ford Health System', 'Beaumont Health', 'University of Michigan Health', 'Spectrum Health (Corewell)', 'Trinity Health Michigan', 'Sparrow Health'],
  },
]

export function getStateHub(slug: string): StateHub | undefined {
  return STATE_HUBS.find((s) => s.slug === slug)
}
