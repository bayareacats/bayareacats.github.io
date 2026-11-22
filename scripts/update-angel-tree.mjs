#!/usr/bin/env node

// Pulls adoptable cats from Shelterluv and writes the ornaments for the
// Wishlist Angel Tree page to _data/angel_tree.json.
//
//   SHELTERLUV_API_KEY=key_xxx node scripts/update-angel-tree.mjs
//
// Picks the longest residents: adoptable cats with a photo, earliest intake first.
// Optional: ANGEL_TREE_COUNT  how many cats to put on the tree (default 8)

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SHELTERLUV_API_BASE_URL = "https://www.shelterluv.com/api/v1";
const PAGE_SIZE = 100;
const OUTPUT_FILE = resolve("_data/angel_tree.json");
const COUNT = Number.parseInt(process.env.ANGEL_TREE_COUNT || "8", 10);

async function fetchShelterluvJson(path, query = {}) {
  const apiKey = process.env.SHELTERLUV_API_KEY;
  if (!apiKey) {
    throw new Error("SHELTERLUV_API_KEY is required to update the angel tree");
  }

  const url = new URL(`${SHELTERLUV_API_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, { headers: { "X-API-Key": apiKey } });
  if (!response.ok) {
    throw new Error(`Shelterluv ${path} request failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function listAdoptableAnimals() {
  const animals = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await fetchShelterluvJson("animals", {
      status_type: "publishable",
      limit: PAGE_SIZE,
      offset,
    });
    animals.push(...(response.animals || []));
    if (!response.has_more || animals.length >= (response.total_count ?? Infinity)) {
      break;
    }
  }
  return animals;
}

function pickPhoto(animal) {
  const candidates = [animal.CoverPhoto, ...(Array.isArray(animal.Photos) ? animal.Photos : [])];
  return candidates.find(
    (url) => typeof url === "string" && url.startsWith("http") && !/default/i.test(url),
  );
}

function intakeTime(animal) {
  const t = Number(animal.LastIntakeUnixTime);
  return Number.isFinite(t) && t > 0 ? t : null;
}

function toOrnament(animal) {
  const ageMonths = Number(animal.Age);
  return {
    id: String(animal["Internal-ID"] || animal.ID || ""),
    // Drop anything in parentheses, like the collar color in "Scooby (blue)".
    name: String(animal.Name || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim(),
    photo: pickPhoto(animal),
    age_months: Number.isFinite(ageMonths) ? ageMonths : null,
    intake: intakeTime(animal),
    sex: animal.Sex || null,
  };
}

async function main() {
  const animals = await listAdoptableAnimals();
  const cats = animals
    .filter((animal) => !animal.Type || /cat/i.test(animal.Type))
    .map(toOrnament)
    .filter((cat) => cat.name && cat.photo);

  const ornaments = cats
    .slice()
    .sort((a, b) => (a.intake ?? Infinity) - (b.intake ?? Infinity))
    .slice(0, COUNT);

  if (cats.length && cats.every((cat) => cat.intake === null)) {
    console.warn("Warning: no intake dates came back from Shelterluv, so cats are in Shelterluv's order.");
  }

  const output = {
    generatedAt: new Date().toISOString(),
    kittens: ornaments,
  };

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${ornaments.length} ornaments to ${OUTPUT_FILE} (${cats.length} adoptable cats with photos)`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
