#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const API_BASE_URL = process.env.SHELTERLUV_API_BASE_URL || 'https://new.shelterluv.com/api/v1';
const API_KEY = process.env.SHELTERLUV_API_KEY;
const API_KEY_HEADER = process.env.SHELTERLUV_API_KEY_HEADER || 'X-API-Key';
const API_KEY_QUERY_PARAM = process.env.SHELTERLUV_API_KEY_QUERY_PARAM;
const OUTPUT_PATH = process.env.ADOPTION_COUNT_OUTPUT || '_data/impact.yml';
const FIXTURE_PATH = process.env.SHELTERLUV_FIXTURE;
const SPECIES_FILTER = (process.env.SHELTERLUV_SPECIES || 'Cat').toLowerCase();
const COUNT_OFFSET = Number.parseInt(process.env.SHELTERLUV_ADOPTION_COUNT_OFFSET || '0', 10);
const PAGE_LIMIT = Number.parseInt(process.env.SHELTERLUV_PAGE_LIMIT || '100', 10);

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
    const url = new URL(`${API_BASE_URL.replace(/\/$/, '')}/animals`);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(PAGE_LIMIT));
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

function renderImpactData(adoptionCount) {
  return [
    `adoption_count: ${adoptionCount}`,
    `adoption_count_updated_at: "${new Date().toISOString()}"`,
    '',
  ].join('\n');
}

const animals = await fetchAllAnimals();
const adoptionCount = animals.filter((animal) => isCat(animal) && isAdoption(animal)).length + COUNT_OFFSET;

if (!Number.isFinite(adoptionCount) || adoptionCount < 1) {
  throw new Error(`Calculated adoption count looks wrong: ${adoptionCount}`);
}

await writeFile(OUTPUT_PATH, renderImpactData(adoptionCount));
console.log(`Updated ${OUTPUT_PATH} with ${adoptionCount} adoptions from ${animals.length} Shelterluv animals.`);
