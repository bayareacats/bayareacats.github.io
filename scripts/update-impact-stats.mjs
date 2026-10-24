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
const APPOINTMENT_TABLE_ID = "tblOOJuOihxinb4K3";
const APPOINTMENT_DATE_FIELD_ID = "fldp6Qhsgn7h17CvC";
const APPOINTMENT_STATUS_FIELD_ID = "fldtkmgmeSxNIFfNc";
const APPOINTMENT_SERVICES_FIELD_ID = "fldyDhtD3gBqH4kA0";
const APPOINTMENT_CAT_COUNT_FIELD_ID = "fldcpjnUta0CF8TPN";
const COUNTED_APPOINTMENT_STATUSES = new Set(["Scheduled", "Completed"]);
const SPAY_NEUTER_SERVICE = "Spay / Neuter";
const REPORT_TIME_ZONE = "America/Los_Angeles";
const CHART_START_YEAR = 2022;
const SHELTERLUV_API_BASE_URL = "https://www.shelterluv.com/api/v1";
const SHELTERLUV_PAGE_SIZE = 100;
const EXCLUDED_CAT_TYPES = new Set(["Pending Outcome"]);
const ASSISTED_CAT_TYPES = new Set([
  "Rescued",
  "Pet Spay / Neuter",
  "Trap-Neuter-Return",
  "Other Service",
]);

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
  {
    key: "other_service",
    label: "Other Service",
    value: "Other Service",
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

async function listAllAppointments() {
  const records = [];
  let cursor;

  do {
    const response = await runAirtableTool("list-records-for-table", {
      baseId: BASE_ID,
      tableId: APPOINTMENT_TABLE_ID,
      fieldIds: [
        APPOINTMENT_DATE_FIELD_ID,
        APPOINTMENT_STATUS_FIELD_ID,
        APPOINTMENT_SERVICES_FIELD_ID,
        APPOINTMENT_CAT_COUNT_FIELD_ID,
      ],
      pageSize: PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });

    records.push(...(response.records || []));
    cursor = response.nextCursor;
  } while (cursor);

  return records;
}

async function fetchShelterluvJson(path, query = {}) {
  const apiKey = process.env.SHELTERLUV_API_KEY;
  if (!apiKey) {
    throw new Error("SHELTERLUV_API_KEY is required to update adoption stats");
  }

  const url = new URL(`${SHELTERLUV_API_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      "X-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Shelterluv ${path} request failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function listAllShelterluvEvents() {
  const events = [];

  for (let offset = 0; ; offset += SHELTERLUV_PAGE_SIZE) {
    const response = await fetchShelterluvJson("events", {
      limit: SHELTERLUV_PAGE_SIZE,
      offset,
    });

    events.push(...(response.events || []));

    if (!response.has_more || events.length >= response.total_count) {
      break;
    }
  }

  return events;
}

function getFieldValueName(value) {
  if (Array.isArray(value)) {
    return value.map(getFieldValueName).filter(Boolean);
  }

  if (value && typeof value === "object" && "name" in value) {
    return value.name;
  }

  return value;
}

function getCatType(record) {
  return getFieldValueName(record.cellValuesByFieldId?.[CAT_TYPE_FIELD_ID]);
}

function countRecordsByCatType(records, catType) {
  return records.filter((record) => getCatType(record) === catType).length;
}

function isAssistedCatType(record) {
  const catType = getCatType(record);
  return ASSISTED_CAT_TYPES.has(catType) && !EXCLUDED_CAT_TYPES.has(catType);
}

function getIsoDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return shifted.toISOString().slice(0, 10);
}

function buildSpayNeuterWeeklyStat(records, now = new Date()) {
  const today = getIsoDateInTimeZone(now, REPORT_TIME_ZONE);
  const todayDayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
  const periodEnd = shiftIsoDate(today, -(todayDayOfWeek + 1));
  const periodStart = shiftIsoDate(periodEnd, -6);

  const catsFixedLastWeek = records.reduce((total, record) => {
    const values = record.cellValuesByFieldId || {};
    const appointmentDate = values[APPOINTMENT_DATE_FIELD_ID];
    const status = getFieldValueName(values[APPOINTMENT_STATUS_FIELD_ID]);
    const services = getFieldValueName(values[APPOINTMENT_SERVICES_FIELD_ID]);
    const catCount = Number(values[APPOINTMENT_CAT_COUNT_FIELD_ID]) || 0;
    const includesSpayNeuter = Array.isArray(services)
      ? services.includes(SPAY_NEUTER_SERVICE)
      : services === SPAY_NEUTER_SERVICE;

    if (
      appointmentDate >= periodStart
      && appointmentDate <= periodEnd
      && COUNTED_APPOINTMENT_STATUSES.has(status)
      && includesSpayNeuter
    ) {
      return total + catCount;
    }

    return total;
  }, 0);

  return {
    catsFixedLastWeek,
    periodStart,
    periodEnd,
    timeZone: REPORT_TIME_ZONE,
    source: {
      baseId: BASE_ID,
      tableId: APPOINTMENT_TABLE_ID,
      dateFieldId: APPOINTMENT_DATE_FIELD_ID,
      countFieldId: APPOINTMENT_CAT_COUNT_FIELD_ID,
      rule: "Sum Cats (Count) for scheduled or completed appointments with Spay / Neuter service during the most recently completed Sunday-Saturday week",
    },
  };
}

function getEventAnimalId(event) {
  return event.AssociatedRecords?.find((record) => record.Type === "Animal")?.Id;
}

function getEventTime(event) {
  return Number.parseInt(event.Time, 10) || 0;
}

function countCurrentAdoptions(events) {
  const eventsByAnimal = new Map();

  for (const event of events) {
    const animalId = getEventAnimalId(event);
    if (!animalId) {
      continue;
    }

    if (!eventsByAnimal.has(animalId)) {
      eventsByAnimal.set(animalId, []);
    }

    eventsByAnimal.get(animalId).push(event);
  }

  let adoptionCount = 0;

  for (const animalEvents of eventsByAnimal.values()) {
    const latestEvent = [...animalEvents].sort((a, b) => getEventTime(a) - getEventTime(b)).at(-1);

    if (latestEvent?.Type === "Outcome.Adoption") {
      adoptionCount += 1;
    }
  }

  return adoptionCount;
}

function buildAdoptionMetric(events) {
  return {
    key: "adoptions",
    label: "Adoptions",
    value: countCurrentAdoptions(events),
    source: {
      api: "Shelterluv",
      endpoint: "/api/v1/events",
      rule: "Count animals whose latest event is Outcome.Adoption",
    },
  };
}

function buildMetrics(records, shelterluvEvents) {
  const currentYear = new Date().getFullYear();
  const impactRecords = records.filter((record) => {
    const year = Number.parseInt(record.cellValuesByFieldId?.[YEAR_FIELD_ID], 10);
    return Number.isInteger(year) && year >= CHART_START_YEAR && year <= currentYear && isAssistedCatType(record);
  });

  const airtableMetrics = metrics.map((metric) => {
    let value;

    if (metric.key === "cats_assisted") {
      value = impactRecords.length;
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

  return [...airtableMetrics, buildAdoptionMetric(shelterluvEvents)];
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
    const catType = getCatType(record);

    if (!Number.isInteger(year) || year < CHART_START_YEAR || year > currentYear || !ASSISTED_CAT_TYPES.has(catType)) {
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
  const [records, appointments, shelterluvEvents] = await Promise.all([
    listAllCats(),
    listAllAppointments(),
    listAllShelterluvEvents(),
  ]);
  const updatedMetrics = buildMetrics(records, shelterluvEvents);
  const yearlyCatTypes = buildYearlyChart(records);
  const spayNeuter = buildSpayNeuterWeeklyStat(appointments);

  const output = {
    generatedAt,
    pageName: "All Time--All Cities",
    metrics: updatedMetrics,
    spayNeuter,
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
