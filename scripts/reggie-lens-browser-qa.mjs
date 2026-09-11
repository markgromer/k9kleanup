#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { LensInfrastructureFailure, runLensCheckWithClassification } from "./reggie-lens-retry.mjs";

const args = process.argv.slice(2);
const baseUrl = (getOption("--base-url") || process.env.REGGIE_QA_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const outDir = path.resolve(getOption("--out-dir") || "tmp-reggie-lens-qa");
const headed = args.includes("--headed");
const skipPerformance = args.includes("--skip-performance");
const functionalAttempts = numberOption("REGGIE_QA_FUNCTIONAL_ATTEMPTS", 2);
const infrastructureAttempts = numberOption("REGGIE_QA_INFRASTRUCTURE_ATTEMPTS", 2);
const qaFontDataUrl = findQaFontDataUrl();
const thresholds = {
  ttfb: numberOption("REGGIE_PERF_MAX_TTFB_MS", 1500),
  fcp: numberOption("REGGIE_PERF_MAX_FCP_MS", 2500),
  lcp: numberOption("REGGIE_PERF_MAX_LCP_MS", 4000),
  cls: numberOption("REGGIE_PERF_MAX_CLS", 0.15),
  transferBytes: numberOption("REGGIE_PERF_MAX_TRANSFER_BYTES", 8_000_000),
};
let traceSequence = 0;

fs.mkdirSync(outDir, { recursive: true });
await waitForServer(`${baseUrl}/admin/reggie-lens`);

const { chromium } = await loadPlaywright();
const executablePath = resolveBrowserExecutable();
const browser = await launchBrowser(chromium, { headless: !headed, ...(executablePath ? { executablePath } : {}) });
const results = { baseUrl, checks: [], thresholds };

try {
  await check("desktop layout editing and review focus", async () => testLayoutAndReview(browser));
  await check("live copy, typography, font, layout, and media preview", async () => testVisualEditing(browser));
  await check("mobile workspace containment", async () => testMobile(browser));
  if (!skipPerformance) {
    await check("homepage performance budget", async () => testPerformance(browser));
  }
} finally {
  await browser.close();
  writeResults();
}

const failed = results.checks.filter((entry) => !entry.ok);
if (failed.length > 0) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(results, null, 2));

async function testLayoutAndReview(browserInstance) {
  const session = await openLens(browserInstance, { width: 1440, height: 1000 });
  const { context, page, frame, missionSubmissions, runtimeErrors } = session;
  try {
    const dashboardNavigation = page.locator("#poopsites-dashboard-navigation");
    await dashboardNavigation.waitFor({ state: "visible", timeout: 15000 });
    const sidebarBox = await requiredBox(dashboardNavigation, "Dashboard sidebar");
    const previewBox = await requiredBox(page.locator('iframe[title="Reggie Lens site preview"]'), "Lens preview iframe");
    assert(await page.getByRole("link", { name: "Dashboard", exact: true }).isVisible(), "Dashboard navigation is not usable while Lens is open.");
    assert(previewBox.x >= sidebarBox.x + sidebarBox.width - 1, `Lens preview overlaps the persistent Dashboard sidebar (${JSON.stringify({ sidebarBox, previewBox })}).`);
    await page.getByRole("button", { name: "Move & Resize", exact: true }).click();
    await markLargestVisible(frame, "img", "layout-image", { preferStable: true, requireResizable: true });
    await dispatchMarkedTarget(frame, "layout-image");

    const overlay = frame.locator('[data-reggie-lens-layout-overlay="1"]');
    await overlay.waitFor({ state: "visible", timeout: 15000 });
    assert(await page.getByRole("checkbox", { name: "Lock proportions" }).isChecked(), "Image selection did not enable locked proportions.");
    const originalGuide = frame.locator('[data-reggie-lens-layout-original="1"]');
    const initial = await readLayoutBox(overlay);
    const initialRelation = await readLayoutRelation(overlay, originalGuide);
    const eastHandle = frame.locator('[data-reggie-lens-resize-handle="e"]');
    const beforeResize = await readLayoutBox(overlay);
    const minimumScale = Math.max(24 / beforeResize.width, 24 / beforeResize.height);
    const resizeDirection = minimumScale <= 0.92 ? -1 : 1;
    const resizeChanged = (box) => resizeDirection > 0 ? box.width > beforeResize.width + 4 : box.width < beforeResize.width - 4;
    // Keyboard interaction is deterministic across iframe scaling and validates
    // the same accessible resize controller used by pointer manipulation.
    await eastHandle.focus();
    await eastHandle.press(resizeDirection > 0 ? "Shift+ArrowRight" : "Shift+ArrowLeft");
    await waitFor(async () => resizeChanged(await readLayoutBox(overlay)), "keyboard resize to update width");
    const resized = await readLayoutBox(overlay);
    assert(
      resizeDirection > 0 ? resized.height > beforeResize.height : resized.height < beforeResize.height,
      `Locked image proportions did not update height during resize (${JSON.stringify({ beforeResize, resized })}).`,
    );
    const resizedRelation = await readLayoutRelation(overlay, originalGuide);

    const ghost = frame.locator('[data-reggie-lens-layout-ghost="1"]');
    assert(await ghost.count() === 1, "The retained layout ghost is missing.");
    assert(await originalGuide.count() === 1, "The original-position guide is missing.");
    const ghostOpacity = Number(await ghost.evaluate((element) => getComputedStyle(element).opacity));
    assert(ghostOpacity >= 0.55 && ghostOpacity <= 0.7, `Expected a semi-transparent ghost, received opacity ${ghostOpacity}.`);

    const undo = page.getByTitle("Undo layout change");
    const redo = page.getByTitle("Redo layout change");
    await undo.click();
    await waitFor(async () => boxesMatch(initialRelation, await readLayoutRelation(overlay, originalGuide), 2), "layout undo");
    await redo.click();
    await waitFor(async () => boxesMatch(resizedRelation, await readLayoutRelation(overlay, originalGuide), 2), "layout redo");

    const logicalRect = await overlay.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
    });
    const moveDelta = logicalRect.x > 48
      ? { x: -52, y: 0, key: "Shift+ArrowLeft" }
      : logicalRect.right < logicalRect.viewportWidth - 48
        ? { x: 52, y: 0, key: "Shift+ArrowRight" }
        : logicalRect.y > 48
          ? { x: 0, y: -52, key: "Shift+ArrowUp" }
          : { x: 0, y: 52, key: "Shift+ArrowDown" };
    await overlay.focus();
    await overlay.press(moveDelta.key);
    await waitFor(async () => {
      const box = await readLayoutBox(overlay);
      return box.x !== resized.x || box.y !== resized.y;
    }, "keyboard movement to update the layout preview");
    const moved = await readLayoutBox(overlay);
    assert(moved.width === resized.width && moved.height === resized.height, `Moving the layout preview unexpectedly resized it (${JSON.stringify({ resized, moved })}).`);

    await page.getByRole("button", { name: "Original", exact: true }).click();
    assert(await overlay.evaluate((element) => getComputedStyle(element).visibility) === "hidden", "Original mode did not hide the preview overlay.");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    assert(await overlay.evaluate((element) => getComputedStyle(element).visibility) === "visible", "Preview mode did not restore the overlay.");

    await page.getByRole("button", { name: "Save Layout Change", exact: true }).click();
    const reviewTrigger = page.getByRole("button", { name: "Review Changes", exact: true }).first();
    await reviewTrigger.click();
    const dialog = page.getByRole("dialog", { name: "Review Changes" });
    await dialog.waitFor({ state: "visible" });
    const submit = page.getByRole("button", { name: "Send Changes to Reggie" });
    await waitFor(async () => submit.evaluate((element) => element === document.activeElement), "review dialog initial focus");
    await page.keyboard.press("Shift+Tab");
    assert(await page.getByRole("button", { name: "Cancel", exact: true }).evaluate((element) => element === document.activeElement), "Shift+Tab did not wrap focus to the final dialog action.");
    await page.keyboard.press("Tab");
    assert(await submit.evaluate((element) => element === document.activeElement), "Tab did not wrap focus to the first dialog action.");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await waitFor(async () => reviewTrigger.evaluate((element) => element === document.activeElement), "focus restoration after closing review");

    await reviewTrigger.click();
    await dialog.waitFor({ state: "visible" });
    await submit.click();
    const submissionError = page.locator('[data-reggie-lens-submit-error="true"]');
    await submissionError.waitFor({ state: "visible" });
    assert(/not been connected/i.test(await submissionError.textContent()), "Lens did not show the mission submission error beside the action.");
    const errorBox = await requiredBox(submissionError, "mission submission error");
    assert(errorBox.y >= 0 && errorBox.y + errorBox.height <= 1000, "Mission submission feedback is outside the visible review dialog.");
    assert(await submit.textContent() === "Try Again", "Lens did not offer a clear retry action after mission failure.");
    await submit.click();
    await page.getByText("Changes sent to Reggie. Track progress in the Revision Queue.", { exact: true }).waitFor({ state: "visible" });
    assert(missionSubmissions.length === 2, `Expected a failed and successful mission submission, received ${missionSubmissions.length}.`);
    assert(missionSubmissions[1]?.requestedBy === "reggie-lens" && /Visual revision/.test(missionSubmissions[1]?.title || ""), "Lens did not send the reviewed revision packet to the mission endpoint.");

    await page.screenshot({ path: path.join(outDir, "desktop-layout.png"), fullPage: true });
    assertNoInteractionRuntimeErrors(runtimeErrors);
    return { initial, moved, resized, ghostOpacity, sidebarWidth: sidebarBox.width, previewX: previewBox.x, submissionAttempts: missionSubmissions.length, runtimeErrorCount: runtimeErrors.length };
  } finally {
    await closeContextWithTrace(context);
  }
}

async function testVisualEditing(browserInstance) {
  const session = await openLens(browserInstance, { width: 1440, height: 1000 });
  const { context, page, frame, runtimeErrors } = session;
  try {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await markLargestVisible(frame, "h1, h2, h3, p", "typography-target", { requireText: true, requireLayout: true });
    await dispatchMarkedTarget(frame, "typography-target");
    const textTarget = frame.locator('[data-reggie-lens-qa-target="typography-target"]');
    const originalFont = await textTarget.evaluate((element) => getComputedStyle(element).fontFamily);
    const fontSelect = page.getByLabel("Font", { exact: true });
    await fontSelect.waitFor({ state: "visible" });
    const capturedEditorText = await page.getByLabel("Preview text", { exact: true }).inputValue();
    await fontSelect.selectOption("Georgia, serif");
    await waitFor(async () => /Georgia/i.test(await textTarget.evaluate((element) => getComputedStyle(element).fontFamily)), "live font preview");
    const previewFont = await textTarget.evaluate((element) => getComputedStyle(element).fontFamily);
    await page.getByTitle("Undo preview change").click();
    await waitFor(async () => (await textTarget.evaluate((element) => getComputedStyle(element).fontFamily)) === originalFont, "font preview undo");

    const originalText = (await textTarget.textContent())?.trim() || "";
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    await waitFor(async () => (await textTarget.textContent())?.trim() === "Clear, dependable service for a cleaner yard.", "live Reggie copy preview");
    const rewrittenText = (await textTarget.textContent())?.trim() || "";
    await page.screenshot({ path: path.join(outDir, "desktop-copy-rewrite.png"), fullPage: true });
    await page.getByTitle("Undo preview change").click();
    await waitFor(async () => (await textTarget.textContent())?.trim() === originalText, "copy preview undo");

    let customFontPreviewed = false;
    if (qaFontDataUrl) {
      await page.getByRole("tab", { name: "Fonts", exact: true }).click();
      const fontTile = page.getByRole("button", { name: /Reggie QA Font/i });
      await fontTile.waitFor({ state: "visible" });
      await fontTile.click();
      await waitFor(async () => /Reggie QA Font/i.test(await textTarget.evaluate((element) => getComputedStyle(element).fontFamily)), "uploaded font preview");
      customFontPreviewed = true;
      await page.screenshot({ path: path.join(outDir, "desktop-custom-font.png"), fullPage: true });
      await page.getByTitle("Undo preview change").click();
      await page.getByRole("tab", { name: "Fonts", exact: true }).click();
      const fontRow = page.locator("article").filter({ hasText: "Reggie QA Font" }).first();
      await fontRow.getByRole("button", { name: "Manage", exact: true }).click();
      await fontRow.getByLabel("Family name", { exact: true }).fill("Reggie QA Sans");
      await fontRow.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Font details saved.", { exact: true }).waitFor({ state: "visible" });
    }

    await page.getByRole("tab", { name: "Layouts", exact: true }).click();
    await page.getByText(capturedEditorText, { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /Balanced split/i }).click();
    await waitFor(async () => {
      const geometry = await readStructurePreviewGeometry(textTarget);
      return Boolean(geometry && geometry.trackCount >= 2 && geometry.childXPositions.length >= 2);
    }, "a measurable two-column section layout preview");
    const balancedLayoutGeometry = await readStructurePreviewGeometry(textTarget);
    assert(balancedLayoutGeometry?.outlineStyle === "solid", "The affected layout container is not visibly identified.");
    const layoutOverlapCount = await textTarget.evaluate((element) => {
      let container = element.parentElement;
      while (container && container !== document.body) {
        if (getComputedStyle(container).display === "grid" && container.style.getPropertyValue("grid-template-columns")) break;
        container = container.parentElement;
      }
      if (!container || container === document.body) return -1;
      const children = Array.from(container.children).filter((child) => {
        const style = getComputedStyle(child);
        const rect = child.getBoundingClientRect();
        return style.position !== "absolute" && style.position !== "fixed" && style.display !== "none" && rect.width > 1 && rect.height > 1;
      });
      let overlaps = 0;
      for (let left = 0; left < children.length; left += 1) {
        const leftRect = children[left].getBoundingClientRect();
        for (let right = left + 1; right < children.length; right += 1) {
          const rightRect = children[right].getBoundingClientRect();
          const overlapWidth = Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left);
          const overlapHeight = Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top);
          if (overlapWidth > 1 && overlapHeight > 1) overlaps += 1;
        }
      }
      return overlaps;
    });
    assert(layoutOverlapCount === 0, `Layout preset created ${layoutOverlapCount} overlapping content pairs.`);
    const platformLayout = page.getByRole("button", { name: /QA Section System/i });
    await platformLayout.waitFor({ state: "visible" });
    await platformLayout.click();
    await page.getByText("QA Section System", { exact: true }).last().waitFor({ state: "visible" });
    await waitFor(async () => {
      const geometry = await readStructurePreviewGeometry(textTarget);
      return Boolean(
        geometry
        && geometry.columns !== balancedLayoutGeometry?.columns
        && geometry.trackCount >= 2
        && JSON.stringify(geometry.childXPositions) !== JSON.stringify(balancedLayoutGeometry?.childXPositions)
      );
    }, "a distinct PoopSites system geometry preview");
    const platformLayoutGeometry = await readStructurePreviewGeometry(textTarget);
    assert(platformLayoutGeometry?.columns !== balancedLayoutGeometry?.columns, "The PoopSites layout did not change the section grid.");
    const layoutPreviewed = true;
    await page.screenshot({ path: path.join(outDir, "desktop-layout-presets.png"), fullPage: true });
    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    await page.getByTitle("Undo preview change").click();

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await markLargestVisible(frame, "img", "media-target");
    await dispatchMarkedTarget(frame, "media-target");
    const imageTarget = frame.locator('[data-reggie-lens-qa-target="media-target"]');
    const originalSrc = await imageTarget.getAttribute("src");
    await page.getByRole("tab", { name: "Media", exact: true }).click();
    const mediaTile = page.getByRole("button", { name: /QA replacement image/i });
    await mediaTile.waitFor({ state: "visible" });
    await mediaTile.click();
    await waitFor(async () => (await imageTarget.getAttribute("src"))?.startsWith("data:image/png") === true, "live media replacement preview");
    const replacementSrc = await imageTarget.getAttribute("src");
    await page.getByTitle("Undo preview change").click();
    await waitFor(async () => (await imageTarget.getAttribute("src")) === originalSrc, "media replacement undo");

    await page.getByRole("tab", { name: "Media", exact: true }).click();
    await page.getByRole("button", { name: "PoopSites library", exact: true }).click();
    const platformMediaTile = page.getByRole("button", { name: /QA PoopSites image/i });
    await platformMediaTile.waitFor({ state: "visible" });
    await platformMediaTile.click();
    await waitFor(async () => (await imageTarget.getAttribute("src"))?.includes("fV4nxo") === true, "PoopSites library replacement preview");
    const platformReplacementSrc = await imageTarget.getAttribute("src");

    await page.getByRole("tab", { name: "Brand", exact: true }).click();
    const tone = page.getByLabel("Tone", { exact: true });
    await tone.waitFor({ state: "visible" });
    await tone.fill("Professional, warm, and direct");
    await page.getByRole("button", { name: "Save Brand Voice", exact: true }).click();
    await page.getByText(/Brand voice saved/i).waitFor({ state: "visible" });

    await page.screenshot({ path: path.join(outDir, "desktop-visual-editing.png"), fullPage: true });
    assertNoInteractionRuntimeErrors(runtimeErrors);
    return { originalFont, previewFont, rewrittenText, customFontPreviewed, layoutPreviewed, balancedLayoutGeometry, platformLayoutGeometry, layoutOverlapCount, replacementPreviewed: Boolean(replacementSrc), platformReplacementPreviewed: Boolean(platformReplacementSrc), brandVoiceSaved: true, runtimeErrorCount: runtimeErrors.length };
  } finally {
    await closeContextWithTrace(context);
  }
}

async function testMobile(browserInstance) {
  const session = await openLens(browserInstance, { width: 390, height: 844 });
  const { context, page, frame, runtimeErrors } = session;
  try {
    await page.getByRole("button", { name: "Mobile", exact: true }).click();
    await page.getByText("390 x 844", { exact: true }).waitFor({ state: "visible" });
    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
    }));
    assert(dimensions.pageWidth <= dimensions.viewportWidth + 2, `Mobile Lens overflows horizontally: ${dimensions.pageWidth}px page in ${dimensions.viewportWidth}px viewport.`);
    const tray = page.locator('[data-reggie-lens-tray="true"]');
    await tray.scrollIntoViewIfNeeded();
    const trayBox = await requiredBox(tray, "mobile editor tray");
    assert(trayBox.width <= dimensions.viewportWidth + 2, `Mobile editor tray is ${trayBox.width}px wide.`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await markLargestVisible(frame, "h1, h2, h3, p", "mobile-layout-target", { requireText: true, requireLayout: true });
    await dispatchMarkedTarget(frame, "mobile-layout-target");
    const mobileLayoutTarget = frame.locator('[data-reggie-lens-qa-target="mobile-layout-target"]');
    await page.getByRole("tab", { name: "Layouts", exact: true }).click();
    await page.getByRole("button", { name: /Balanced split/i }).click();
    await waitFor(async () => (await readStructurePreviewGeometry(mobileLayoutTarget))?.trackCount === 1, "mobile layout preset to stack into one column");
    const mobileLayoutGeometry = await readStructurePreviewGeometry(mobileLayoutTarget);
    const frameDimensions = await frame.evaluate(() => ({ viewportWidth: window.innerWidth, pageWidth: document.documentElement.scrollWidth }));
    assert(frameDimensions.pageWidth <= frameDimensions.viewportWidth + 2, `Mobile preview overflows horizontally after a layout change: ${frameDimensions.pageWidth}px page in ${frameDimensions.viewportWidth}px viewport.`);
    await page.screenshot({ path: path.join(outDir, "mobile-workspace.png"), fullPage: true });
    assertNoInteractionRuntimeErrors(runtimeErrors);
    return { ...dimensions, trayWidth: trayBox.width, mobileLayoutGeometry, frameDimensions, runtimeErrorCount: runtimeErrors.length };
  } finally {
    await closeContextWithTrace(context);
  }
}

async function testPerformance(browserInstance) {
  const context = await browserInstance.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    window.__reggiePerformance = { cls: 0, lcp: 0, longTaskDuration: 0 };
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const latest = entries[entries.length - 1];
      if (latest) window.__reggiePerformance.lcp = latest.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__reggiePerformance.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__reggiePerformance.longTaskDuration += entry.duration;
    }).observe({ type: "longtask", buffered: true });
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
      const resources = performance.getEntriesByType("resource");
      const transferBytes = resources.reduce((total, entry) => total + (entry.transferSize || 0), 0);
      const topResources = resources
        .map((entry) => ({ name: entry.name, transferSize: entry.transferSize || 0, decodedBodySize: entry.decodedBodySize || 0, initiatorType: entry.initiatorType }))
        .sort((left, right) => right.transferSize - left.transferSize)
        .slice(0, 10);
      return {
        ttfb: navigation ? navigation.responseStart - navigation.startTime : 0,
        fcp,
        lcp: window.__reggiePerformance?.lcp ?? 0,
        cls: window.__reggiePerformance?.cls ?? 0,
        longTaskDuration: window.__reggiePerformance?.longTaskDuration ?? 0,
        transferBytes,
        resourceCount: resources.length,
        topResources,
      };
    });

    const failures = [
      metrics.ttfb <= 0 || metrics.ttfb > thresholds.ttfb ? `TTFB ${round(metrics.ttfb)}ms exceeds ${thresholds.ttfb}ms.` : "",
      metrics.fcp <= 0 || metrics.fcp > thresholds.fcp ? `FCP ${round(metrics.fcp)}ms exceeds ${thresholds.fcp}ms.` : "",
      metrics.lcp <= 0 || metrics.lcp > thresholds.lcp ? `LCP ${round(metrics.lcp)}ms exceeds ${thresholds.lcp}ms.` : "",
      metrics.cls > thresholds.cls ? `CLS ${metrics.cls.toFixed(3)} exceeds ${thresholds.cls}.` : "",
      metrics.transferBytes > thresholds.transferBytes ? `Transferred ${metrics.transferBytes} bytes, above ${thresholds.transferBytes}.` : "",
    ].filter(Boolean);
    if (failures.length > 0) {
      const error = new Error(failures.join(" "));
      error.qaValue = metrics;
      throw error;
    }
    await page.screenshot({ path: path.join(outDir, "performance-home.png"), fullPage: true });
    return { ...metrics, ttfb: round(metrics.ttfb), fcp: round(metrics.fcp), lcp: round(metrics.lcp), cls: Number(metrics.cls.toFixed(3)), longTaskDuration: round(metrics.longTaskDuration) };
  } finally {
    await closeContextWithTrace(context);
  }
}

async function openLens(browserInstance, viewport) {
  const context = await browserInstance.newContext({ viewport, deviceScaleFactor: 1 });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const missionSubmissions = [];
  const runtimeErrors = [];
  page.on("pageerror", (error) => {
    const detail = error.stack || error.message;
    if (!isImportedCustomerThemeError(detail)) runtimeErrors.push(detail);
  });
  await page.route("**/api/admin/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, authenticated: true, role: "support" }) });
  });
  await page.route("**/api/admin/reggie-lens/auth", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/admin/reggie-mission**", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, jobs: [] }) });
      return;
    }
    const payload = JSON.parse(request.postData() || "{}");
    missionSubmissions.push(payload);
    if (missionSubmissions.length === 1) {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, error: "This site has not been connected to Reggie yet." }) });
      return;
    }
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ok: true, mission: { id: "mission_lens_qa", status: "requested" } }) });
  });
  await page.route("**/api/admin/media", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configured: true,
        assets: [{
          assetId: "reggie-qa-image",
          publicId: "reggie/qa-image",
          secureUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARAwMjDAGsgAANgQCAZtJWKkAAAAASUVORK5CYII=",
          fileName: "qa-replacement.png",
          displayName: "QA replacement image",
          altText: "QA replacement image",
          width: 2,
          height: 2,
        }],
      }),
    });
  });
  await page.route("**/api/admin/reggie-rewrite", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, text: "Clear, dependable service for a cleaner yard.", mode: "rewrite" }),
    });
  });
  await page.route("**/api/admin/reggie-catalog**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const include = requestUrl.searchParams.get("include") || "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        assets: include.includes("assets") ? {
          items: [{
            id: "qa-platform-image",
            title: "QA PoopSites image",
            originalUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAfV4nxoAAAAASUVORK5CYII=",
            previewUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAfV4nxoAAAAASUVORK5CYII=",
            altText: "QA PoopSites image",
            imageType: "hero",
            styles: ["friendly-local"],
            width: 2,
            height: 2,
          }],
          pagination: { total: 1, returned: 1, offset: 0, limit: 24, hasMore: false },
          filters: { imageTypes: ["hero"], styles: ["friendly-local"] },
        } : undefined,
        templates: include.includes("templates") ? [{
          id: "qa-section-system",
          name: "QA Section System",
          description: "QA section layout.",
          fit: "QA layout validation",
          variant: "rail",
          signature: "A stable split section.",
          mobileTransformation: "Stack on mobile.",
          preview: { columns: [34, 66], blocks: [72, 42, 58] },
        }] : undefined,
        siteContext: { connected: false },
      }),
    });
  });
  await page.route("**/api/admin/reggie-brand-voice", async (route) => {
    const request = route.request();
    const payload = request.method() === "PATCH" ? JSON.parse(request.postData() || "{}") : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        profile: {
          tone: payload.tone || "Friendly and direct",
          audience: payload.audience || "Local dog owners",
          ctaStyle: payload.ctaStyle || "Clear and low-friction",
          notes: payload.notes || "Dependable local service",
          approvedPhrases: payload.approvedPhrases || ["Cleaner yard"],
          forbiddenClaims: payload.forbiddenClaims || ["Guaranteed"],
          source: request.method() === "PATCH" ? "manual" : "poopsites-platform",
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });
  await page.route("**/api/admin/fonts", async (route) => {
    if (route.request().method() === "PATCH") {
      const payload = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, asset: { family: payload.family, weight: payload.weight, style: payload.style, licenseName: payload.licenseName, licenseUrl: payload.licenseUrl } }),
      });
    }
    if (route.request().method() === "DELETE") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, deleted: true }) });
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        configured: true,
        assets: qaFontDataUrl ? [{
          assetId: "reggie-qa-font",
          publicId: "reggie/fonts/reggie-qa-font.woff2",
          secureUrl: qaFontDataUrl,
          fileName: "reggie-qa-font.woff2",
          family: "Reggie QA Font",
          format: "woff2",
          weight: 400,
          style: "normal",
          licenseName: "QA commercial license",
          licenseUrl: "https://example.com/license",
          rightsConfirmedAt: "2026-08-08T00:00:00.000Z",
        }] : [],
      }),
    });
  });

  await page.goto(`${baseUrl}/admin/reggie-lens`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const modeButton = page.getByRole("button", { name: "Move & Resize", exact: true });
  const iframe = page.locator('iframe[title="Reggie Lens site preview"]');
  let workspaceReady = false;
  let frame = null;
  for (let attempt = 0; attempt < 3 && !workspaceReady; attempt += 1) {
    const readinessTimeout = attempt === 0 ? 20000 : 30000;
    try {
      await modeButton.waitFor({ state: "visible", timeout: readinessTimeout });
      const iframeHandle = await iframe.elementHandle({ timeout: readinessTimeout });
      frame = await iframeHandle?.contentFrame() ?? null;
      if (!frame) throw new Error("Lens preview iframe did not become available.");
      await frame.waitForLoadState("domcontentloaded");
      await frame.locator("body").waitFor({ state: "visible", timeout: readinessTimeout });
      await frame.locator('html[data-reggie-lens-ready="1"]').waitFor({ state: "attached", timeout: readinessTimeout });
      await iframe.scrollIntoViewIfNeeded();
      await iframe.waitFor({ state: "visible", timeout: readinessTimeout });
      workspaceReady = true;
    } catch {
      frame = null;
    }
    if (!workspaceReady && attempt < 2) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    }
  }
  if (!workspaceReady) {
    await closeContextWithTrace(context);
    throw new LensInfrastructureFailure("Reggie Lens and its preview did not finish loading after three clean attempts.");
  }
  // A customer's existing theme can emit a startup error before Reggie is ready.
  // Keep that from impersonating a Reggie regression, then strictly gate every
  // runtime error raised during the actual editing interactions below.
  runtimeErrors.length = 0;
  return { context, page, frame, missionSubmissions, runtimeErrors };
}

async function markLargestVisible(frame, selector, marker, options = {}) {
  const found = await frame.evaluate(({ selector: query, marker: value, options: requirements }) => {
    for (const existing of document.querySelectorAll("[data-reggie-lens-qa-target]")) existing.removeAttribute("data-reggie-lens-qa-target");
    const hasLayoutContainer = (element) => {
      let current = /^(SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|DIV)$/.test(element.tagName) ? element : element.parentElement;
      for (let depth = 0; current && current.tagName !== "BODY" && depth < 8; depth += 1) {
        const allChildren = Array.from(current.children);
        const visibleFlowChildren = allChildren.filter((child) => {
          const rect = child.getBoundingClientRect();
          const style = getComputedStyle(child);
          return style.position !== "absolute" && style.position !== "fixed" && style.display !== "none" && style.visibility !== "hidden" && rect.width > 8 && rect.height > 8;
        });
        const hasFloatingChildren = allChildren.some((child) => {
          const position = getComputedStyle(child).position;
          return position === "absolute" || position === "fixed";
        });
        if (!hasFloatingChildren && visibleFlowChildren.length >= 2 && visibleFlowChildren.length <= 12 && !/^(FORM|NAV|UL|OL|TABLE|TBODY|TR)$/.test(current.tagName)) return true;
        current = current.parentElement;
      }
      return false;
    };
    const candidates = Array.from(document.querySelectorAll(query)).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const hasText = !requirements.requireText || (element.textContent || "").trim().length >= 8;
      const canMove = !requirements.requireMovement || rect.left > 12 || rect.top > 12 || rect.right < innerWidth - 12 || rect.bottom < innerHeight - 12;
      const minimumScale = Math.max(24 / rect.width, 24 / rect.height);
      const centerY = rect.y + (rect.height / 2);
      const maximumScale = Math.max(minimumScale, Math.min(
        (innerWidth - rect.x) / rect.width,
        (2 * Math.min(centerY, innerHeight - centerY)) / rect.height,
      ));
      const canResize = !requirements.requireResizable || minimumScale <= 0.92 || maximumScale >= 1.08;
      const hasLayout = !requirements.requireLayout || hasLayoutContainer(element);
      return hasText && canMove && canResize && hasLayout && rect.width >= 24 && rect.height >= 18 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    }).sort((left, right) => {
      if (requirements.preferStable) {
        const unstableSelector = '[class*="carousel" i], [class*="slider" i], [class*="slide" i], [data-carousel], [aria-roledescription="slide"]';
        const leftIsStable = !left.closest(unstableSelector) && getComputedStyle(left).animationName === "none";
        const rightIsStable = !right.closest(unstableSelector) && getComputedStyle(right).animationName === "none";
        if (leftIsStable !== rightIsStable) return rightIsStable ? 1 : -1;
      }
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    });
    const target = candidates[0];
    if (!target) return false;
    target.setAttribute("data-reggie-lens-qa-target", value);
    return true;
  }, { selector, marker, options });
  assert(found, `No visible ${selector} target was available in the Lens preview.`);
}

function assertNoInteractionRuntimeErrors(runtimeErrors) {
  assert(runtimeErrors.length === 0, `Browser runtime errors during Reggie interactions: ${runtimeErrors.join(" | ")}`);
}

function isImportedCustomerThemeError(detail) {
  return /\/(?:wp-content|wp-includes)\//i.test(detail);
}

async function dispatchMarkedTarget(frame, marker) {
  const target = frame.locator(`[data-reggie-lens-qa-target="${marker}"]`);
  await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + (rect.width / 2),
      clientY: rect.top + (rect.height / 2),
      view: window,
    }));
  });
}

async function readLayoutBox(locator) {
  return locator.evaluate((element) => ({
    x: Number.parseFloat(element.style.left),
    y: Number.parseFloat(element.style.top),
    width: Number.parseFloat(element.style.width),
    height: Number.parseFloat(element.style.height),
  }));
}

async function readLayoutRelation(overlay, originalGuide) {
  const [current, original] = await Promise.all([readLayoutBox(overlay), readLayoutBox(originalGuide)]);
  return {
    x: current.x - original.x,
    y: current.y - original.y,
    width: current.width,
    height: current.height,
  };
}

async function readStructurePreviewGeometry(target) {
  return target.evaluate((element) => {
    let container = element.parentElement;
    while (container && container !== document.body) {
      if (getComputedStyle(container).display === "grid" && container.style.getPropertyValue("grid-template-columns")) break;
      container = container.parentElement;
    }
    if (!container || container === document.body) return null;
    const containerRect = container.getBoundingClientRect();
    const selectedRect = element.getBoundingClientRect();
    const style = getComputedStyle(container);
    const visibleChildren = Array.from(container.children).filter((child) => {
      const childStyle = getComputedStyle(child);
      const rect = child.getBoundingClientRect();
      return childStyle.position !== "absolute" && childStyle.position !== "fixed" && childStyle.display !== "none" && rect.width > 1 && rect.height > 1;
    });
    const childXPositions = [...new Set(visibleChildren.map((child) => Math.round(child.getBoundingClientRect().x)))];
    let gridTrackCount = 0;
    let gridTrackDepth = 0;
    let insideGridTrack = false;
    for (const character of style.gridTemplateColumns) {
      if (/\s/.test(character) && gridTrackDepth === 0) {
        if (insideGridTrack) gridTrackCount += 1;
        insideGridTrack = false;
        continue;
      }
      insideGridTrack = true;
      if (character === "(") gridTrackDepth += 1;
      if (character === ")") gridTrackDepth = Math.max(0, gridTrackDepth - 1);
    }
    if (insideGridTrack) gridTrackCount += 1;
    return {
      columns: style.gridTemplateColumns,
      trackCount: gridTrackCount,
      columnCount: childXPositions.length,
      childXPositions,
      containerWidth: Math.round(containerRect.width),
      selectedWidth: Math.round(selectedRect.width),
      outlineStyle: style.outlineStyle,
    };
  });
}

function boxesMatch(left, right, tolerance = 0) {
  return ["x", "y", "width", "height"].every((key) => Math.abs(left[key] - right[key]) <= tolerance);
}

async function requiredBox(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Could not measure ${label}.`);
  return box;
}

async function waitFor(predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForServer(url) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.status < 500) return;
    } catch {
      // The local preview may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new LensInfrastructureFailure(`Reggie Lens did not become available at ${url}.`);
}

async function loadPlaywright() {
  try {
    return await import("@playwright/test");
  } catch {
    console.error("Missing @playwright/test. Run `npm install -D @playwright/test` before Lens browser QA.");
    process.exit(2);
  }
}

async function check(name, fn) {
  const outcome = await runLensCheckWithClassification(fn, { infrastructureAttempts, functionalAttempts });
  if (outcome.ok) {
    results.checks.push({ name, ok: true, value: outcome.value, attempts: outcome.failures.length + 1, infrastructureFailures: outcome.infrastructureFailures, functionalFailures: outcome.functionalFailures });
  } else {
    results.checks.push({ name, ok: false, attempts: outcome.failures.length, infrastructureFailures: outcome.infrastructureFailures, functionalFailures: outcome.functionalFailures, error: outcome.failures.map((failure, index) => `Attempt ${index + 1} [${failure.failureClass}]: ${failure.detail}`).join("\n\n") });
  }
  writeResults();
}

async function launchBrowser(chromium, options) {
  let lastError;
  for (let attempt = 1; attempt <= infrastructureAttempts; attempt += 1) {
    try { return await chromium.launch(options); } catch (error) { lastError = error; }
  }
  throw new LensInfrastructureFailure("The Lens QA browser could not be launched.", { cause: lastError });
}

function resolveBrowserExecutable() {
  const configured = process.env.REGGIE_QA_BROWSER_EXECUTABLE?.trim();
  const candidates = [configured, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

async function closeContextWithTrace(context) {
  traceSequence += 1;
  try { await context.tracing.stop({ path: path.join(outDir, `trace-${traceSequence}.zip`) }); } catch { /* preserve the primary QA failure */ }
  await context.close();
}

function writeResults() {
  fs.writeFileSync(path.join(outDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function numberOption(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function findQaFontDataUrl() {
  const directory = path.resolve(".next/static/media");
  if (!fs.existsSync(directory)) return "";
  const fileName = fs.readdirSync(directory)
    .filter((entry) => entry.toLowerCase().endsWith(".woff2"))
    .sort((left, right) => fs.statSync(path.join(directory, left)).size - fs.statSync(path.join(directory, right)).size)[0];
  if (!fileName) return "";
  return `data:font/woff2;base64,${fs.readFileSync(path.join(directory, fileName)).toString("base64")}`;
}

function getOption(name) {
  const index = args.indexOf(name);
  return index === -1 || !args[index + 1] || args[index + 1].startsWith("-") ? "" : args[index + 1];
}
