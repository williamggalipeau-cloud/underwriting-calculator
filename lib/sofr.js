// Fetches CME 3-Month SOFR December futures from Yahoo Finance for each hold year.
// Ticker format: SR3Z{2-digit year}.CME  (Dec contract = annual proxy rate)
// Implied rate = 100 - price
export async function fetchSofrCurve(holdPeriodYears) {
  const currentYear = new Date().getFullYear();

  async function fetchContract(year) {
    const yy = String(year).slice(-2);
    const ticker = `SR3Z${yy}.CME`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const proxies = [
      url,
      `https://corsproxy.io/?${encodeURIComponent(url)}`,
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    ];
    for (const proxy of proxies) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(proxy, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) continue;
        let body = await res.json();
        // allorigins wraps payload in .contents
        if (body?.contents) body = JSON.parse(body.contents);
        const price = body?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price != null && price > 80) return +(100 - price).toFixed(4);
      } catch (_) {}
    }
    return null;
  }

  const results = await Promise.all(
    Array.from({ length: holdPeriodYears }, (_, i) => fetchContract(currentYear + i))
  );
  return results; // array of rates (null if unavailable)
}
