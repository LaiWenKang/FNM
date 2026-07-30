import { classify, noteFault, noteOk } from "@/lib/health";

// ═══ WHERE YOU ACTUALLY ARE, NOT WHERE THE TABLE SAYS ═════════════════════
//
// The area search covers forty-nine Singapore planning areas, which is the
// right answer to "which part of the island" and the wrong answer to the
// question people actually ask. Typing "Micron" — a real place where real
// people work and eat lunch every day — returned "No area called Micron. Try a
// nearby MRT or town name", which is the app telling somebody that where they
// are is not a valid place to be.
//
// No hardcoded table can fix that. Offices, campuses, business parks, malls,
// hospitals, schools and MRT exits are where lunch decisions get made, and
// there are tens of thousands of them. So when the local table has nothing,
// the question goes to the same Google Places text search the saved-post
// importer already uses.
//
// TABLE FIRST, ALWAYS. The local lookup is instant and free; this one costs a
// paid Places call. It runs only when the table comes up empty, only from
// three characters, and only after the typing stops — so the common case
// ("orchard", "bugis") never touches the network at all.
//
// DELIBERATELY NOT FILTERED TO FOOD, unlike the saved-post resolver. There the
// filter stops a caption resolving to a shopping mall; here the mall IS the
// answer, because that is where the person will be standing.

export interface Located {
  /** What to show, and what the plan bar will read afterwards. */
  label: string;
  /** Disambiguates two branches of the same name — which "Micron" is this. */
  address: string | null;
  lat: number;
  lng: number;
}

/* SINGAPORE AS A RECTANGLE, and the shape is not a style choice. Places Text
   Search accepts a circle ONLY for `locationBias`; `locationRestriction` takes
   a rectangle and rejects anything else. The first cut passed a circle here,
   which Google turned down — so every lookup came back empty while reporting
   itself configured, and the unit tests happily asserted the wrong shape
   because they were checking my own request rather than Google's answer. */
const SG_BOUNDS = {
  low: { latitude: 1.13, longitude: 103.6 },
  high: { latitude: 1.48, longitude: 104.1 },
};

export const geocodeConfigured = (): boolean => Boolean(process.env.GOOGLE_PLACES_API_KEY);

/**
 * Find real places matching free text. Returns [] on every failure path — the
 * caller already has the local table and a message to fall back to.
 */
export async function lookupPlaces(query: string, limit = 5): Promise<Located[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const q = query.trim();
  if (!key || q.length < 3) return [];

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: AbortSignal.timeout(4000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // The narrowest mask that answers the question. Every extra field here
        // moves the call into a pricier SKU for information nobody reads.
        "X-Goog-FieldMask": "places.displayName,places.location,places.formattedAddress",
      },
      body: JSON.stringify({
        textQuery: q.slice(0, 120),
        maxResultCount: Math.min(limit, 10),
        /* RESTRICT, not bias. Somewhere to eat lunch is somewhere you can walk
           or ride to before it gets cold; a same-named building in another
           country is never the answer, and offering one would be worse than
           offering nothing. */
        locationRestriction: { rectangle: SG_BOUNDS },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      noteFault("places", classify(body, res.status), `where-search ${res.status} ${body}`);
      return [];
    }

    const data = (await res.json()) as {
      places?: Array<{
        displayName?: { text: string };
        location?: { latitude: number; longitude: number };
        formattedAddress?: string;
      }>;
    };
    noteOk("places");

    const out: Located[] = [];
    for (const p of data.places ?? []) {
      if (!p.displayName?.text || !p.location) continue;
      out.push({
        label: p.displayName.text.slice(0, 40),
        // Singapore's postal suffix is noise in a 390px sheet; the road name
        // is the part that tells two branches apart.
        address: p.formattedAddress?.replace(/,?\s*Singapore\s*\d{6}$/i, "").slice(0, 60) || null,
        lat: p.location.latitude,
        lng: p.location.longitude,
      });
    }
    return out.slice(0, limit);
  } catch (e) {
    noteFault("places", classify(e), e instanceof Error ? e.message : String(e));
    return [];
  }
}
