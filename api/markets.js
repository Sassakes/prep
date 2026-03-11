export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  var symbols = [
    'NQ=F', 'ES=F', 'RTY=F', 'YM=F',
    'GC=F', 'CL=F',
    'DX-Y.NYB', '^VIX', '^TNX',
    'EURUSD=X', 'GBPUSD=X', 'USDJPY=X'
  ];

  try {
    var url = 'https://query2.finance.yahoo.com/v6/finance/quote?symbols=' + symbols.join(',');
    var response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://finance.yahoo.com',
        'Referer': 'https://finance.yahoo.com/',
      }
    });

    if (!response.ok) {
      var url2 = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + symbols.join(','));
      response = await fetch(url2);
    }

    var data = await response.json();
    var results = [];
    if (data.quoteResponse) {
      results = data.quoteResponse.result || [];
    }

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
      };
    });

    return res.status(200).json({ quotes: quotes });
  } catch (err) {
    return res.status(500).json({ error: err.message, quotes: [] });
  }
}
