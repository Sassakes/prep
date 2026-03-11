export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  var symbols = [
    'NQ=F', 'ES=F', 'RTY=F', 'YM=F',
    'GC=F', 'CL=F',
    'DX-Y.NYB', '^VIX', '^TNX',
    'EURUSD=X', 'GBPUSD=X', 'USDJPY=X'
  ].join(',');

  try {
    var url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + symbols;
    var response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Yahoo Finance error: ' + response.status });
    }

    var data = await response.json();
    var results = (data.quoteResponse && data.quoteResponse.result) || [];

    var quotes = results.map(function (q) {
      return {
        symbol: q.symbol || '',
        name: q.shortName || q.longName || q.symbol || '',
        price: q.regularMarketPrice || 0,
        change: q.regularMarketChange || 0,
        changePct: q.regularMarketChangePercent || 0,
        prevClose: q.regularMarketPreviousClose || 0,
        high: q.regularMarketDayHigh || 0,
        low: q.regularMarketDayLow || 0,
        volume: q.regularMarketVolume || 0,
        time: q.regularMarketTime || 0,
      };
    });

    return res.status(200).json({ quotes: quotes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
