const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

app.get('/', (req, res) => {
  res.send('VK Motors API running');
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/analyze', async (req, res) => {
  try {

    const { query } = req.body;

    const response = await fetch(
      "https://ebay-average-selling-price.p.rapidapi.com/findCompletedItems",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-rapidapi-host": "ebay-average-selling-price.p.rapidapi.com",
          "x-rapidapi-key": RAPIDAPI_KEY,
        },
        body: JSON.stringify({
          keywords: query,
          siteId: "0",
          categoryId: "",
        }),
      }
    );

    const data = await response.json();

    res.json(data);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
