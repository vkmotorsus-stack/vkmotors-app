const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

app.use(cors());
app.use(express.json());

const RAPIDAPI_KEY = "cb7458b87fmsh326015f8ac46e2ep1bbb50jsn6853c3189644";

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/analyze", async (req, res) => {
  try {

    const { make, model, year, part } = req.body;

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

    res.json(data);

  } catch (e) {

    res.status(500).json({
      error: e.message
    });

  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("server started");
});
