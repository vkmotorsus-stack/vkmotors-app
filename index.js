const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

app.use(cors());
app.use(express.json());

const RAPIDAPI_KEY = "cb7458b87fmsh326015f8ac46e2ep1bbb50jsn6853c3189644";

app.get("/", (req, res) => {
  res.send("VK Motors API running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/analyze", async (req, res) => {
  try {
    const { make, model, year } = req.body;

    if (!make || !model || !year) {
      return res.status(400).json({
        error: "make, model, and year are required"
      });
    }

    const query = `${year} ${make} ${model} door handle`;

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
          max_search_results: 20
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

    res.json(data);

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
