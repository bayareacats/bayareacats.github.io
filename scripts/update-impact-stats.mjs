#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const BASE_ID = "appklgrXgkT9hR2Ts";
const INTERFACE_ID = "pbd0Wf6B070Uofn2i";
const PAGE_ID = "pag1nZ5rVYwBnnREh";
const OUTPUT_FILE = resolve("_data/impact_stats.json");
const MAX_PAGE_SIZE = 1000;
const requestedPageSize = Number.parseInt(
  process.env.AIRTABLE_STATS_PAGE_SIZE || String(MAX_PAGE_SIZE),
  10,
);
const PAGE_SIZE = Number.isInteger(requestedPageSize)
  ? Math.min(requestedPageSize, MAX_PAGE_SIZE)
  : MAX_PAGE_SIZE;
const CAT_TABLE_ID = "tblQ2W7X4SLNfERIP";
const YEAR_FIELD_ID = "fld4k3z7yAq8zQpfD";
const CAT_TYPE_FIELD_ID = "fldiK7pB4M5DnbMRG";
const CHART_START_YEAR = 2022;

const metrics = [
  {
    key: "cats_assisted",
    label: "Cats Assisted",
    elementId: "pelB0XCL1Qwy4nIk0",
    tableId: "tblQ2W7X4SLNfERIP",
  },
  {
    key: "tnr_cats",
    label: "TNR Cats",
    elementId: "pelLeWFgA83UBpBCJ",
    tableId: "tblQ2W7X4SLNfERIP",
  },
  {
    key: "rescued",
    label: "Cats / Kittens Rescued",
    elementId: "pelbTGtKAw3rW80tj",
    tableId: "tblQ2W7X4SLNfERIP",
  },
  {
    key: "pets_fixed",
    label: "Pets Fixed",
    elementId: "peltGhHs2iXpHCzid",
    tableId: "tblQ2W7X4SLNfERIP",
  },
];

const catTypeSeries = [
  {
    key: "tnr",
    label: "Trap-Neuter-Return",
    value: "Trap-Neuter-Return",
  },
  {
    key: "rescued",
    label: "Rescued",
    value: "Rescued",
  },
  {
    key: "pet_spay_neuter",
    label: "Pet Spay / Neuter",
    value: "Pet Spay / Neuter",
  },
];

function cliInvocation() {
  if (process.env.AIRTABLE_MCP_BIN) {
    return {
      command: process.env.AIRTABLE_MCP_BIN,
      prefixArgs: [],
    };
  }

  return {
    command: "npx",
    prefixArgs: ["-y", "@airtable/mcp-cli"],
  };
}

async function runAirtableTool(toolName, input) {
  const { command, prefixArgs } = cliInvocation();
  const args = [...prefixArgs, toolName, "--input", "-", "-q"];

  const stdout = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    let errors = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(output);
        return;
      }

      rejectPromise(new Error(errors || `${command} exited with code ${code}`));
    });

    child.stdin.end(JSON.stringify(input));
  });

  return JSON.parse(stdout);
}

async function listAllCats() {
  const records = [];
  let cursor;

  do {
    const response = await runAirtableTool("list-records-for-table", {
      baseId: BASE_ID,
      tableId: CAT_TABLE_ID,
      fieldIds: [YEAR_FIELD_ID, CAT_TYPE_FIELD_ID],
      pageSize: PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });

    records.push(...(response.records || []));
    cursor = response.nextCursor;
  } while (cursor);

  return records;
}

function countRecordsByCatType(records, catType) {
  return records.filter((record) => record.cellValuesByFieldId?.[CAT_TYPE_FIELD_ID] === catType).length;
}

function buildMetrics(records) {
  const currentYear = new Date().getFullYear();
  const impactRecords = records.filter((record) => {
    const year = Number.parseInt(record.cellValuesByFieldId?.[YEAR_FIELD_ID], 10);
    return Number.isInteger(year) && year >= CHART_START_YEAR && year <= currentYear;
  });

  return metrics.map((metric) => {
    let value;

    if (metric.key === "cats_assisted") {
      value = catTypeSeries.reduce(
        (total, series) => total + countRecordsByCatType(impactRecords, series.value),
        0,
      );
    } else if (metric.key === "tnr_cats") {
      value = countRecordsByCatType(impactRecords, "Trap-Neuter-Return");
    } else if (metric.key === "rescued") {
      value = countRecordsByCatType(impactRecords, "Rescued");
    } else {
      value = countRecordsByCatType(impactRecords, "Pet Spay / Neuter");
    }

    return {
      key: metric.key,
      label: metric.label,
      value,
      source: {
        baseId: BASE_ID,
        interfaceId: INTERFACE_ID,
        pageId: PAGE_ID,
        elementId: metric.elementId,
        tableId: metric.tableId,
      },
    };
  });
}

function formatCompact(value) {
  if (value < 1000) {
    return String(value);
  }

  const compact = value / 1000;
  return `${compact.toLocaleString("en-US", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  })}k`;
}

function buildYearlyChart(records) {
  const currentYear = new Date().getFullYear();
  const yearsByName = new Map();

  for (const record of records) {
    const values = record.cellValuesByFieldId || {};
    const year = Number.parseInt(values[YEAR_FIELD_ID], 10);
    const catType = values[CAT_TYPE_FIELD_ID];

    if (!Number.isInteger(year) || year < CHART_START_YEAR || year > currentYear) {
      continue;
    }

    if (!yearsByName.has(year)) {
      yearsByName.set(year, {
        year,
        total: 0,
        segments: Object.fromEntries(catTypeSeries.map((series) => [series.key, 0])),
      });
    }

    const series = catTypeSeries.find((item) => item.value === catType);
    if (!series) {
      continue;
    }

    const row = yearsByName.get(year);
    row.total += 1;
    row.segments[series.key] += 1;
  }

  const years = Array.from(yearsByName.values()).sort((a, b) => a.year - b.year);
  const maxTotal = Math.max(...years.map((year) => year.total), 0);
  const roundedMax = Math.max(500, Math.ceil(maxTotal / 500) * 500);
  const yAxis = [];

  const topVisibleTick = roundedMax > 500 ? roundedMax - 500 : roundedMax;
  for (let tick = topVisibleTick; tick >= 0; tick -= 500) {
    yAxis.push({
      value: tick,
      label: tick === 0 ? "0k" : `${tick / 1000}k`,
    });
  }

  return {
    title: "Cats Assisted Per Year",
    maxValue: roundedMax,
    yAxis,
    series: catTypeSeries.map(({ key, label }) => ({ key, label })),
    years: years.map((year) => ({
      ...year,
      label: formatCompact(year.total),
      height: roundedMax > 0 ? (year.total / roundedMax) * 100 : 0,
      segments: Object.fromEntries(
        Object.entries(year.segments).map(([key, value]) => [
          key,
          {
            value,
            height: roundedMax > 0 ? (value / roundedMax) * 100 : 0,
          },
        ]),
      ),
    })),
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const records = await listAllCats();
  const updatedMetrics = buildMetrics(records);
  const yearlyCatTypes = buildYearlyChart(records);

  const output = {
    generatedAt,
    pageName: "All Time--All Cities",
    metrics: updatedMetrics,
    charts: {
      yearlyCatTypes,
    },
  };

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
