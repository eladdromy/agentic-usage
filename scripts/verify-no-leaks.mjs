#!/usr/bin/env node
/**
 * Scan API JSON and rendered page text for forbidden strings before README screenshots.
 */
import { chromium } from "playwright";

const FORBIDDEN = [
  "plan-leverage",
  "HarnessApp",
  "harnessAppMVP",
  "SupplementsDirectory",
  "investments",
  "saas-appraisgent",
  "Ideas-Machine",
  "KnowledgeMCP",
  "Scrapers-Exploration",
  "StarterSprint",
  "/Users/eladd",
];

const API_ENDPOINTS = [
  "/api/projects-breakdown",
  "/api/raw-spend?page=1",
  "/api/raw-spend/projects",
];

const PAGE_PATHS = [
  "/leverage?screenshot=year-summary&year=2026",
  "/leverage",
  "/raw-spend",
  "/projects-breakdown",
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
    assertNoLeaks(body, endpoint);
  }
}

async function verifyPages(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const path of PAGE_PATHS) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
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
