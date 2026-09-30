#!/usr/bin/env node
/**
 * Scan API JSON and rendered page text for forbidden strings before README screenshots.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = JSON.parse(
  readFileSync(join(ROOT, "scripts/readme-leak-strings.json"), "utf8"),
);

const API_ENDPOINTS = [
  "/api/projects-breakdown",
  "/api/raw-spend?page=1",
  "/api/raw-spend/projects",
  "/api/tracing/projects",
];

const TRACE_PROJECT_SLUG =
  process.env.TRACE_SCREENSHOT_PROJECT_SLUG ?? "-Users-eladd-General-Code-Work-OS";
const TRACE_SESSION_ID =
  process.env.TRACE_SCREENSHOT_SESSION ??
  "dbb4af73-dcf9-40ff-a7d8-93bb2adc9cb4";

const encodedProject = encodeURIComponent(TRACE_PROJECT_SLUG);
const encodedSession = encodeURIComponent(TRACE_SESSION_ID);

const PAGE_PATHS = [
  "/leverage?screenshot=summary-export&year=2026",
  "/leverage",
  "/raw-spend",
  "/projects-breakdown",
  "/tracing",
  `/tracing/${encodedProject}`,
  `/tracing/${encodedProject}/${encodedSession}?harness=claude`,
];

function assertNoLeaks(payload, context) {
  const lower = payload.toLowerCase();
  for (const needle of FORBIDDEN) {
    if (lower.includes(needle.toLowerCase())) {
      throw new Error(`Leak detected in ${context}: found "${needle}"`);
    }
  }
}

async function verifyApis(baseUrl) {
  for (const endpoint of API_ENDPOINTS) {
    const res = await fetch(`${baseUrl}${endpoint}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${endpoint}: HTTP ${res.status}`);
    }
    const body = await res.text();

    if (endpoint === "/api/raw-spend/projects") {
      const json = JSON.parse(body);
      for (const project of json.projects ?? []) {
        assertNoLeaks(
          JSON.stringify({ label: project.label, detail: project.detail }),
          `${endpoint} (display fields)`,
        );
      }
      continue;
    }

    assertNoLeaks(body, endpoint);
  }

  const sessionsUrl = `${baseUrl}/api/tracing/sessions?projectPath=${encodedProject}&limit=5`;
  const sessionsRes = await fetch(sessionsUrl);
  if (!sessionsRes.ok) {
    throw new Error(`Failed to fetch tracing sessions: HTTP ${sessionsRes.status}`);
  }
  assertNoLeaks(await sessionsRes.text(), sessionsUrl);
}

async function verifyPages(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const path of PAGE_PATHS) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(path.includes("/tracing/") && path.includes("?") ? 4000 : 1500);
      const text = await page.locator("body").innerText();
      assertNoLeaks(text, path);
    }
  } finally {
    await browser.close();
  }
}

const baseUrl = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3001";

try {
  await verifyApis(baseUrl);
  await verifyPages(baseUrl);
  console.log(`No leaks detected at ${baseUrl}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
