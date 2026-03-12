export const config = { runtime: "edge" };

async function fetchHeadlines(feedUrl) {
  try {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 4000);

    var response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return [];
    }

    var text = await response.text();
    var titles = [];
    var regex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi;
    var match;

    while ((match = regex.exec(text)) !== null) {
      var title = match[1].replace(/<[^>]*>/g, "").trim();
      if (title.length > 10 && titles.length < 10) {
        titles.push(title);
      }
    }

    return titles;
  } catch (e) {
    return [];
  }
}

export default async function handler(request) {
  // CORS
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Only POST
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "POST only" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check API key
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Parse request body
    var body = await request.json();
    var systemPrompt = body.system || "";
    var userContent = "";
    if (body.messages && body.messages.length > 0) {
      userContent = body.messages[0].content || "";
    }

    // Fetch RSS headlines in parallel (fail silently)
    var feedUrls = [
      "https://feeds.marketwatch.com/marketwatch/topstories/",
      "https://feeds.marketwatch.com/marketwatch/marketpulse/",
      "https://www.investing.com/rss/news.rss",
    ];

    var feedResults = await Promise.allSettled(
      feedUrls.map(function (url) {
        return fetchHeadlines(url);
      })
    );

    var allHeadlines = [];
    for (var i = 0; i < feedResults.length; i++) {
      if (feedResults[i].status === "fulfilled") {
        var titles = feedResults[i].value;
        for (var j = 0; j < titles.length; j++) {
          allHeadlines.push(titles[j]);
        }
      }
    }

    // Append headlines to user message if any were found
    if (allHeadlines.length > 0) {
      userContent =
        userContent +
        "\n\nTitres financiers récupérés en temps réel:\n- " +
        allHeadlines.slice(0, 20).join("\n- ");
    }

    // Build messages array
    var messages = [{ role: "user", content: userContent }];

    // Call Claude (NO web search = fast 3-5s)
    var controller2 = new AbortController();
    var timer2 = setTimeout(function () {
      controller2.abort();
    }, 20000);

    var apiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller2.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: messages,
      }),
    });

    clearTimeout(timer2);

    var apiData = await apiResponse.json();

    return new Response(JSON.stringify(apiData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    var errorMsg = "Unknown error";
    if (err && err.name === "AbortError") {
      errorMsg = "Timeout 20s";
    } else if (err && err.message) {
      errorMsg = err.message;
    }

    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
