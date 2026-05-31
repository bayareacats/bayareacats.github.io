#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const API_BASE_URL = process.env.SHELTERLUV_API_BASE_URL || 'https://new.shelterluv.com/api/v1';
const ANIMALS_PATH = process.env.SHELTERLUV_API_ANIMALS_PATH || 'animals';
const EXTRA_QUERY = process.env.SHELTERLUV_API_QUERY || '';
const API_KEY = process.env.SHELTERLUV_API_KEY;
const API_KEY_HEADER = process.env.SHELTERLUV_API_KEY_HEADER || 'X-API-Key';
const API_KEY_QUERY_PARAM = process.env.SHELTERLUV_API_KEY_QUERY_PARAM;
const OUTPUT_PATH = process.env.ADOPTION_COUNT_OUTPUT || '_data/impact.yml';
const FIXTURE_PATH = process.env.SHELTERLUV_FIXTURE;
const SPECIES_FILTER = (process.env.SHELTERLUV_SPECIES || 'Cat').toLowerCase();
const COUNT_OFFSET = Number.parseInt(process.env.SHELTERLUV_ADOPTION_COUNT_OFFSET || '0', 10);
const PAGE_LIMIT = Number.parseInt(process.env.SHELTERLUV_PAGE_LIMIT || '100', 10);
const MAX_SUMMARY_VALUES = Number.parseInt(process.env.SHELTERLUV_DEBUG_SUMMARY_LIMIT || '12', 10);

function getField(record, possibleNames) {
  for (const name of possibleNames) {
    if (record[name] !== undefined && record[name] !== null) {
      return record[name];
    }
  }

  const normalized = new Map(
    Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ''), value])
  );

  for (const name of possibleNames) {
    const value = normalized.get(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function isCat(record) {
  const species = String(getField(record, ['Species']) || '').toLowerCase();
  return !SPECIES_FILTER || species === SPECIES_FILTER;
}

function isAdoption(record) {
  const status = String(getField(record, ['Status']) || '').toLowerCase();
  const outcomeType = String(getField(record, ['Outcome type', 'Outcome Type', 'OutcomeType']) || '').toLowerCase();
  const outcomeSubtype = String(getField(record, ['Outcome subtype', 'Outcome Subtype', 'OutcomeSubtype']) || '').toLowerCase();

  return [status, outcomeType, outcomeSubtype].some((value) => value.includes('adopt'));
}

function extractAnimals(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  for (const key of ['animals', 'data', 'results']) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  throw new Error('Shelterluv response did not include an animals array.');
}

async function fetchJson(url) {
  const headers = { Accept: 'application/json' };
  if (API_KEY && !API_KEY_QUERY_PARAM) {
    headers[API_KEY_HEADER] = API_KEY;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Shelterluv request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchAllAnimals() {
  if (FIXTURE_PATH) {
    return extractAnimals(JSON.parse(await readFile(FIXTURE_PATH, 'utf8')));
  }

  if (!API_KEY) {
    throw new Error('Set SHELTERLUV_API_KEY before running this script.');
  }

  const animals = [];
  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const url = new URL(`${API_BASE_URL.replace(/\/$/, '')}/${ANIMALS_PATH.replace(/^\//, '')}`);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(PAGE_LIMIT));
    applyExtraQuery(url);
    if (API_KEY_QUERY_PARAM) {
      url.searchParams.set(API_KEY_QUERY_PARAM, API_KEY);
    }

    const batch = extractAnimals(await fetchJson(url));
    animals.push(...batch);

    if (batch.length < PAGE_LIMIT) {
      break;
    }
  }

  return animals;
}

function applyExtraQuery(url) {
  if (!EXTRA_QUERY) {
    return;
  }

  const params = new URLSearchParams(EXTRA_QUERY.replace(/^\?/, ''));
  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }
}

function summarizeValues(records, fieldNames) {
  const counts = new Map();
  for (const record of records) {
    const value = String(getField(record, fieldNames) || '(empty)');
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_SUMMARY_VALUES)
    .map(([value, count]) => `${value}: ${count}`)
    .join(', ');
}

function summarizeFields(records) {
  return [...new Set(records.flatMap((record) => Object.keys(record)))]
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
}

function adoptionCountError(records) {
  return [
    `No ${SPECIES_FILTER || 'animal'} adoptions were found in ${records.length} Shelterluv records.`,
    `Fields seen: ${summarizeFields(records) || '(none)'}`,
    `Species summary: ${summarizeValues(records, ['Species']) || '(none)'}`,
    `Status summary: ${summarizeValues(records, ['Status']) || '(none)'}`,
    `Outcome type summary: ${summarizeValues(records, ['Outcome type', 'Outcome Type', 'OutcomeType']) || '(none)'}`,
    `Outcome subtype summary: ${summarizeValues(records, ['Outcome subtype', 'Outcome Subtype', 'OutcomeSubtype']) || '(none)'}`,
    'If the response only contains available animals, ask Shelterluv which endpoint or query parameter exposes outcomed/adopted animals, then set SHELTERLUV_API_QUERY or SHELTERLUV_API_ANIMALS_PATH in GitHub repository variables.',
  ].join('\n');
}

function renderImpactData(adoptionCount) {
  return [
    `adoption_count: ${adoptionCount}`,
    `adoption_count_updated_at: "${new Date().toISOString()}"`,
    '',
  ].join('\n');
}

const animals = await fetchAllAnimals();
const adoptionCount = animals.filter((animal) => isCat(animal) && isAdoption(animal)).length + COUNT_OFFSET;

if (!Number.isFinite(adoptionCount)) {
  throw new Error(`Calculated adoption count is not a number: ${adoptionCount}`);
}

if (adoptionCount < 1) {
  throw new Error(adoptionCountError(animals));
}

await writeFile(OUTPUT_PATH, renderImpactData(adoptionCount));
console.log(`Updated ${OUTPUT_PATH} with ${adoptionCount} adoptions from ${animals.length} Shelterluv animals.`);
