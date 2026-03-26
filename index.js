const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

app.use(cors());
app.use(express.json());

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "PUT_YOUR_KEY_HERE";

app.get("/", (req, res) => {
  res.send("VK Motors API running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMedian(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function isUsedCondition(conditionText) {
  const text = normalizeText(conditionText);

  if (text.includes("used") || text.includes("pre-owned") || text.includes("pre owned")) {
    return true;
  }

  if (
    text.includes("new") ||
    text.includes("brand new") ||
    text.includes("remanufactured") ||
    text.includes("refurbished") ||
    text.includes("open box")
  ) {
    return false;
  }

  return false;
}

function isRelevantVehicle(title, make, model, year) {
  const text = normalizeText(title);
  const makeText = normalizeText(make);
  const modelText = normalizeText(model);
  const yearText = String(year);

  if (!text.includes(makeText)) return false;
  if (!text.includes(modelText)) return false;
  if (!text.includes(yearText)) return false;

  return true;
}

function isExcludedTitle(title) {
  const text = normalizeText(title);

  const excludedWords = [
    "brand new",
    "new",
    "remanufactured",
    "refurbished",
    "open box",
    "for parts",
    "not working",
    "repair kit",
    "hardware",
    "manual",
    "owners manual",
    "owner manual",
    "screw cover",
    "trim cover",
    "roof handle",
    "grab handle",
    "sticker",
    "decal",
    "key chain",
    "corolla",
    "yaris",
    "rav4",
    "prius",
    "highlander",
    "avalon",
    "lexus"
  ];

  return hasAny(text, excludedWords);
}

function extractPrice(item) {
  const raw = item.sale_price ?? item.price ?? item.sold_price ?? 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

app.post("/analyze", async (req, res) => {
  try {
    const {
      make,
      model,
      year,
      part = "door handle",
      usedOnly = true,
      minPrice = 0
    } = req.body;

    if (!make || !model || !year) {
      return res.status(400).json({
        error: "make, model, and year are required"
      });
    }

    if (!RAPIDAPI_KEY || RAPIDAPI_KEY === "PUT_YOUR_KEY_HERE") {
      return res.status(500).json({
        error: "RAPIDAPI_KEY is missing"
      });
    }

    const query = `${year} ${make} ${model} ${part}`;

    const response = await fetch(
      "https://ebay-average-selling-price.p.rapidapi.com/findCompletedItems",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rapidapi-host": "ebay-average-selling-price.p.rapidapi.com",
          "x-rapidapi-key": RAPIDAPI_KEY
        },
        body: JSON.stringify({
          keywords: query,
          max_search_results: 60
        })
      }
    );

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({
        error: "RapidAPI did not return JSON",
        raw: text
      });
    }

    const products = Array.isArray(data.products) ? data.products : [];

    const filteredProducts = products.filter((item) => {
      const title = item.title || "";
      const condition = item.condition || "";
      const price = extractPrice(item);

      if (!isRelevantVehicle(title, make, model, year)) return false;
      if (isExcludedTitle(title)) return false;
      if (usedOnly && !isUsedCondition(condition)) return false;
      if (price < Number(minPrice)) return false;

      return true;
    });

    const prices = filteredProducts
      .map(extractPrice)
      .filter((p) => Number.isFinite(p) && p > 0);

    const averagePrice = prices.length
      ? Number((prices.reduce((sum, p) => sum + p, 0) / prices.length).toFixed(2))
      : 0;

    const medianPrice = prices.length
      ? Number(getMedian(prices).toFixed(2))
      : 0;

    const minFoundPrice = prices.length ? Math.min(...prices) : 0;
    const maxFoundPrice = prices.length ? Math.max(...prices) : 0;

    res.json({
      success: true,
      search: {
        make,
        model,
        year,
        part,
        query
      },
      filters: {
        usedOnly,
        minPrice: Number(minPrice)
      },
      stats: {
        rawResults: products.length,
        filteredResults: filteredProducts.length,
        averagePrice,
        medianPrice,
        minPrice: minFoundPrice,
        maxPrice: maxFoundPrice
      },
      products: filteredProducts
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
