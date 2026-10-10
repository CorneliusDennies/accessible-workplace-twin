import fs from 'fs';
import path from 'path';
import { catalog, livePrices, type CatalogProduct } from './catalog';

// Real product listings from Google Shopping (via SerpAPI). Raw results are cached
// on disk for a week, and the relevance filter runs on read, so tuning the filter
// never spends search quota; only a changed query triggers a new search.
const CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'product-cache.v2.json');
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LISTINGS = 6;

export interface Listing {
  title: string;
  store: string;
  price: number;
  price_text: string;
  link: string;
  thumbnail: string | null;
  rating: number | null;
  reviews: number | null;
  delivery: string | null;
}

export interface ProductListings {
  product_id: string;
  query: string;
  fetched_at: string;
  listings: Listing[]; // relevant matches only, cheapest first
}

// Raw (unfiltered) search results as cached.
interface RawSearch {
  query: string;
  fetched_at: string;
  results: Listing[];
}

type Cache = Record<string, RawSearch>;

function readCache(): Cache {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(cache: Cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

export const shoppingEnabled = () => Boolean(process.env.SERPAPI_KEY);

interface SerpShoppingItem {
  title?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  product_link?: string;
  link?: string;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
  delivery?: string;
}

async function searchGoogleShopping(product: CatalogProduct): Promise<RawSearch> {
  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: product.search.q,
    gl: 'us',
    hl: 'en',
    api_key: process.env.SERPAPI_KEY!,
  });
  // SerpAPI's Google Shopping takes ~35s per search.
  const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(75_000) });
  const body = (await res.json().catch(() => ({}))) as { shopping_results?: SerpShoppingItem[]; error?: string };
  if (!res.ok || body.error) throw new Error(`SerpAPI: ${body.error ?? res.status}`);

  const results = (body.shopping_results ?? [])
    .filter((r) => typeof r.extracted_price === 'number' && r.title && (r.product_link || r.link))
    .map(
      (r): Listing => ({
        title: r.title!,
        store: r.source ?? 'Unknown store',
        price: r.extracted_price!,
        price_text: r.price ?? `$${r.extracted_price}`,
        link: (r.product_link || r.link)!,
        thumbnail: r.thumbnail ?? null,
        rating: r.rating ?? null,
        reviews: r.reviews ?? null,
        delivery: r.delivery ?? null,
      }),
    );
  return { query: product.search.q, fetched_at: new Date().toISOString(), results };
}

/** Keep listings that are actually this product (not an accessory or lookalike), cheapest first, no duplicates. */
function relevant(product: CatalogProduct, raw: RawSearch): Listing[] {
  const { minPrice, any, none } = product.search;
  const seen = new Set<string>();
  return raw.results
    .filter((l) => {
      const title = l.title.toLowerCase();
      return l.price >= minPrice && any.some((w) => title.includes(w)) && !none.some((w) => title.includes(w));
    })
    .sort((a, b) => a.price - b.price)
    .filter((l) => {
      const key = `${l.store}|${l.title}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_LISTINGS);
}

let inFlight: Promise<unknown> | null = null;

/**
 * Real listings for the given catalog products (cached), and the cheapest price
 * of each pushed into the catalog so the agent and cost totals use real prices.
 * Returns null when no shopping API key is configured.
 */
export async function loadListings(
  productIds: string[] = catalog.map((p) => p.id),
  onProgress?: (text: string) => void,
): Promise<Record<string, ProductListings> | null> {
  if (!shoppingEnabled()) return null;
  if (inFlight) await inFlight.catch(() => {}); // let a running warm-up finish and reuse its cache
  const cache = readCache();
  const now = Date.now();
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const stale = productIds.filter((id) => {
    const entry = cache[id];
    return !entry || entry.query !== byId.get(id)!.search.q || now - Date.parse(entry.fetched_at) > TTL_MS;
  });

  if (stale.length) {
    onProgress?.(`Searching Google Shopping for ${stale.length} product${stale.length > 1 ? 's' : ''}`);
    const wave = Promise.allSettled(stale.map((id) => searchGoogleShopping(byId.get(id)!)));
    inFlight = wave;
    const results = await wave.finally(() => {
      inFlight = null;
    });
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') cache[stale[i]] = r.value;
      else console.error(`Product search failed for ${stale[i]}:`, r.reason);
    });
    writeCache(cache);
  }

  const out: Record<string, ProductListings> = {};
  for (const id of productIds) {
    const entry = cache[id];
    if (!entry) continue;
    const listings = relevant(byId.get(id)!, entry);
    out[id] = { product_id: id, query: entry.query, fetched_at: entry.fetched_at, listings };
    if (listings.length) livePrices.set(id, listings[0].price);
    else livePrices.delete(id);
  }
  return out;
}
