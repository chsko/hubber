/**
 * Address search from Kartverket's open API (HUB-28): free, no key, Norway
 * only. Called straight from the phone while typing a place.
 */
const SEARCH_URL = "https://ws.geonorge.no/adresser/v1/sok";

export type PickedPlace = { text: string; lat: number; lon: number; kommuneNr: string };

type Hit = {
  adressetekst?: string;
  poststed?: string;
  kommunenummer?: string;
  representasjonspunkt?: { lat?: number; lon?: number };
};

/** "OSLO" → "Oslo", "MO I RANA" → "Mo i Rana". */
function placeName(name: string): string {
  return name
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && w.length <= 2 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Up to `limit` addresses matching `query`, as "Lia skolevei 2, Oslo" with coordinates. */
export async function searchAddresses(
  query: string,
  signal: AbortSignal,
  limit = 5,
): Promise<PickedPlace[]> {
  const params = new URLSearchParams({
    sok: query,
    fuzzy: "true",
    treffPerSide: String(limit),
    utkoordsys: "4258",
  });
  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, { signal });
  if (!response.ok) return [];
  const { adresser } = (await response.json()) as { adresser?: Hit[] };
  return (adresser ?? []).flatMap((hit) => {
    const { lat, lon } = hit.representasjonspunkt ?? {};
    if (!hit.adressetekst || lat === undefined || lon === undefined || !hit.kommunenummer) {
      return [];
    }
    const town = hit.poststed ? `, ${placeName(hit.poststed)}` : "";
    return [{ text: `${hit.adressetekst}${town}`, lat, lon, kommuneNr: hit.kommunenummer }];
  });
}
