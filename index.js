const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'PUT_YOUR_KEY_HERE';
const RAPIDAPI_HOST = 'ebay-average-selling-price.p.rapidapi.com';
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/findCompletedItems`;

const PART_RULES = [
  { key: 'headlight', label: 'Headlight assembly', patterns: ['headlight', 'head lamp', 'headlamp', 'lamp assembly'] },
  { key: 'tail_light', label: 'Tail light assembly', patterns: ['tail light', 'taillight', 'rear lamp', 'tail lamp'] },
  { key: 'mirror', label: 'Side mirror', patterns: ['side mirror', 'door mirror', 'rear view mirror', 'wing mirror'] },
  { key: 'alternator', label: 'Alternator', patterns: ['alternator'] },
  { key: 'starter', label: 'Starter motor', patterns: ['starter', 'starter motor'] },
  { key: 'door_handle', label: 'Door handle (exterior)', patterns: ['door handle', 'exterior handle', 'outside door handle'] },
  { key: 'window_regulator', label: 'Power window regulator', patterns: ['window regulator', 'power window regulator'] },
  { key: 'abs_module', label: 'ABS module', patterns: ['abs module', 'abs pump', 'anti lock brake module'] },
  { key: 'climate_control', label: 'Climate control', patterns: ['climate control', 'heater control', 'a/c control', 'ac control', 'temperature control'] },
  { key: 'radio_display', label: 'Radio / display', patterns: ['radio', 'display', 'screen', 'navigation', 'nav screen'] },
  { key: 'fender', label: 'Fender', patterns: ['fender'] },
  { key: 'hood', label: 'Hood', patterns: ['hood'] },
  { key: 'bumper', label: 'Bumper', patterns: ['bumper'] },
  { key: 'grille', label: 'Grille', patterns: ['grille', 'grill'] },
  { key: 'wheel', label: 'Wheel / rim', patterns: ['wheel', 'rim'] },
  { key: 'seat', label: 'Seat', patterns: ['seat', 'driver seat', 'passenger seat'] },
  { key: 'airbag', label: 'Airbag', patterns: ['airbag', 'air bag'] },
  { key: 'ecu', label: 'ECU / module', patterns: ['ecu', 'ecm', 'pcm', 'tcm', 'control module'] }
];

const EXCLUDE_PATTERNS = [
  'manual',
  'owners manual',
  'owner manual',
  'repair kit',
  'hardware',
  'bolt',
  'screw',
  'clip',
  'trim clip',
  'key chain',
  'sticker',
  'decal',
  'floor mat',
  'floormat',
  'carpet mat',
  'for parts',
  'not working',
  'broken',
  'damaged',
  'aftermarket',
  'brand new',
  'open box',
  'remanufactured',
  'refurbished'
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

function isUsedListing(item) {
  const text = normalizeText([
    item.title,
    item.condition,
    item.subtitle,
    item.description
  ].filter(Boolean).join(' '));

  if (text.includes('used') || text.includes('pre-owned') || text.includes('pre owned')) {
    return true;
  }

  if (
    text.includes('new') ||
    text.includes('brand new') ||
    text.includes('open box') ||
    text.includes('remanufactured') ||
    text.includes('refurbished')
  ) {
    return false;
  }

  return true;
}

function isExcludedListing(item) {
  const text = normalizeText([
    item.title,
    item.condition,
    item.subtitle,
    item.description
  ].filter(Boolean).join(' '));

  return containsAny(text, EXCLUDE_PATTERNS);
}

function extractPrice(item) {
  const candidates = [
    item.price?.value,
    item.price,
    item.sellingStatus?.currentPrice?.value,
    item.sellingStatus?.currentPrice?.__value__,
    item.currentPrice?.value,
    item.currentPrice
  ];

  for (const candidate of candidates) {
    const num = Number(candidate);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }

  return null;
}

function categorizePart(item) {
  const text = normalizeText(item.title);

  for (const rule of PART_RULES) {
    if (containsAny(text, rule.patterns)) {
      return rule;
    }
  }

  return null;
}

function buildEbaySoldUrl({ year, make, model, partLabel }) {
  const q = encodeURIComponent(`${year} ${make} ${model} ${partLabel} used`);
  return `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`;
}

function buildPriority(score) {
  if (score >= 3000) return 'high';
  if (score >= 1500) return 'medium';
  if (score >= 700) return 'low';
  return 'skip';
}

function safeArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.itemSummaries)) return data.itemSummaries;
  return [];
}

async function fetchCompletedItems(payload) {
  const response = await fetch(RAPIDAPI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || `RapidAPI request failed with status ${response.status}`);
  }

  return data;
}

app.post('/search', async (req, res) => {
  try {
    const data = await fetchCompletedItems(req.body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/analyze', async (req, res) => {
  try {
    const {
      make,
      model,
      year,
      minPrice = 50,
      minSold = 5,
      usedOnly = true
    } = req.body || {};

    if (!make || !model || !year) {
      return res.status(400).json({
        error: 'make, model, and year are required'
      });
    }

    if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'PUT_YOUR_KEY_HERE') {
      return res.status(500).json({
        error: 'RapidAPI key is missing'
      });
    }

    const searchQuery = `${year} ${make} ${model} used`;

    const apiPayload = {
      keywords: searchQuery
    };

    const rawData = await fetchCompletedItems(apiPayload);
    const items = safeArray(rawData);

    const grouped = new Map();

    for (const item of items) {
      if (usedOnly && !isUsedListing(item)) continue;
      if (isExcludedListing(item)) continue;

      const partRule = categorizePart(item);
      if (!partRule) continue;

      const price = extractPrice(item);
      if (!price || price < Number(minPrice)) continue;

      if (!grouped.has(partRule.key)) {
        grouped.set(partRule.key, {
          partKey: partRule.key,
          partLabel: partRule.label,
          prices: [],
          soldCount: 0,
          sampleTitles: []
        });
      }

      const bucket = grouped.get(partRule.key);
      bucket.prices.push(price);
      bucket.soldCount += 1;

      if (bucket.sampleTitles.length < 3 && item.title) {
        bucket.sampleTitles.push(item.title);
      }
    }

    const results = Array.from(grouped.values())
      .map((bucket) => {
        const avgPrice = bucket.prices.reduce((a, b) => a + b, 0) / bucket.prices.length;
        const minSeenPrice = Math.min(...bucket.prices);
        const maxSeenPrice = Math.max(...bucket.prices);
        const potentialRevenue = avgPrice * bucket.soldCount;
        const priorityScore = avgPrice * bucket.soldCount;

        return {
          part: bucket.partLabel,
          avgPrice: Number(avgPrice.toFixed(2)),
          minSeenPrice: Number(minSeenPrice.toFixed(2)),
          maxSeenPrice: Number(maxSeenPrice.toFixed(2)),
          soldCount: bucket.soldCount,
          potentialRevenue: Number(potentialRevenue.toFixed(2)),
          priorityScore: Number(priorityScore.toFixed(2)),
          priority: buildPriority(priorityScore),
          ebaySoldUrl: buildEbaySoldUrl({
            year,
            make,
            model,
            partLabel: bucket.partLabel
          }),
          sampleTitles: bucket.sampleTitles
        };
      })
      .filter((item) => item.soldCount >= Number(minSold))
      .sort((a, b) => b.priorityScore - a.priorityScore);

    res.json({
      vehicle: `${year} ${make} ${model}`,
      filters: {
        minPrice: Number(minPrice),
        minSold: Number(minSold),
        usedOnly: Boolean(usedOnly)
      },
      totalRawItems: items.length,
      totalMatchedParts: results.length,
      results
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => {
  res.send('VK Motors API running');
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
