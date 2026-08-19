import countries110m from "world-atlas/countries-110m.json";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

/**
 * Country names sourced from world-atlas's countries-110m topojson dataset
 * — the exact same file Stage 2's world map will render — computed once at
 * module load rather than hand-maintained, so the "Country" dropdown here
 * and the future map can never drift apart on naming.
 *
 * Deliberately dependency-light (just the topojson parse, nothing React or
 * server-specific) so this is safe to import from both a client component
 * (AddLeadForm) and a server route (the leads API).
 */

interface CountryProperties {
  name?: string;
}

const topology = countries110m as unknown as Topology;
const countriesObject = topology.objects.countries as GeometryCollection<CountryProperties>;
const countriesGeoJson = feature(topology, countriesObject);

/**
 * Friendly labels for the handful of Natural Earth 110m names that come
 * through abbreviated (a quirk of this low-resolution topojson file, the
 * same one Stage 2's map renders — not something to "fix" at the source).
 * Only the LABEL shown in the dropdown uses these; the stored `value` stays
 * the exact raw topojson name, so whatever a BD picks still matches Stage
 * 2's map geometry exactly.
 */
const DISPLAY_ALIASES: Record<string, string> = {
  "Bosnia and Herz.": "Bosnia and Herzegovina",
  "Central African Rep.": "Central African Republic",
  "Dem. Rep. Congo": "Democratic Republic of the Congo",
  "Dominican Rep.": "Dominican Republic",
  "Eq. Guinea": "Equatorial Guinea",
  "Falkland Is.": "Falkland Islands",
  "Fr. S. Antarctic Lands": "French Southern and Antarctic Lands",
  "N. Cyprus": "Northern Cyprus",
  "S. Sudan": "South Sudan",
  "Solomon Is.": "Solomon Islands",
  "W. Sahara": "Western Sahara",
};

// Antarctica stays in the raw topology for Stage 2's map to render — it's
// only excluded here, from the selectable/validated list, since no lead
// will ever be tagged with it.
const rawNames = countriesGeoJson.features
  .map((f) => f.properties?.name)
  .filter(
    (name): name is string => typeof name === "string" && name.length > 0 && name !== "Antarctica"
  );

/**
 * { value, label } pairs for the dropdown — value is always the raw
 * topojson name (what gets stored and validated against); label is the
 * friendly alias where one exists, otherwise identical to value. Sorted by
 * label, since that's what a BD actually reads in the dropdown.
 */
export const COUNTRY_OPTIONS: { value: string; label: string }[] = rawNames
  .map((name) => ({ value: name, label: DISPLAY_ALIASES[name] ?? name }))
  .sort((a, b) => a.label.localeCompare(b.label));

/** Raw topojson names only, derived from COUNTRY_OPTIONS — the single source of truth for server-side validation. */
export const COUNTRY_NAMES: string[] = COUNTRY_OPTIONS.map((o) => o.value);

/** Friendly display label for a raw topojson country name — same alias map the dropdown uses, so the map's tooltip reads the same way. */
export function countryDisplayLabel(rawName: string): string {
  return DISPLAY_ALIASES[rawName] ?? rawName;
}
