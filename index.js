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
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsedItem(item) {
  const condition = normalizeText(item.condition);
  const title = normalizeText(item.title);

  if (
    condition.includes("used") ||
    condition.includes("pre-owned") ||
    condition.includes("pre owned")
  ) {
    return true;
  }

  if (
    condition.includes("new") ||
    condition.includes("brand new") ||
    condition.includes("refurbished") ||
    condition.includes("remanufactured") ||
    condition.includes("open box")
  ) {
    return false;
  }

  if (
    title.includes("used") ||
    title.includes("oem used")
  ) {
    return true;
  }

  return false;
}

app.post("/analyze", async (req, res) => {
  try {
    const { make, model, year, part } = req.body;

    if (!make || !model || !year || !part) {
      return res.status(400).json({
        error: "make, model, year, and part are required"
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

    const data = await response.json();

    const products = Array.isArray(data.products) ? data.products : [];
    const usedProducts = products.filter(isUsedItem);

    res.json({
      ...data,
      total_products_before_filter: products.length,
      total_products_after_used_filter: usedProducts.length,
      products: usedProducts
    });

  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("server started on port " + PORT);
});
