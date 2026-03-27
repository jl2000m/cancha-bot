import { addDays, format, parseISO } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import {
  chromium,
  type Browser,
  type Locator,
  type Page,
} from "playwright";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Color de hover “disponible” en Skedda (verde). */
const SKEDDA_HOVER_AVAILABLE_BG = "rgb(0, 189, 139)";

const ES_MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

export interface SkeddaScrapedSlot {
  courtName: string;
  /** e.g. "7:00 a.m. – 8:00 a.m." */
  intervalLabel: string;
  /** Minutos de bloque continuo reservable (p. ej. 60). Sin definir en slots legacy. */
  durationMinutes?: number;
}

export interface SkeddaScrapeOk {
  ok: true;
  /** Fecha pedida (YYYY-MM-DD) */
  date: string;
  /** Fecha realmente mostrada en Skedda tras navegar */
  displayedDate: string;
  venueName: string;
  readOnlyMode: boolean;
  bookingUrl: string;
  courts: Record<string, SkeddaScrapedSlot[]>;
  totalFreeSlots: number;
  disclaimer: string;
}

export interface SkeddaScrapeErr {
  ok: false;
  error: string;
  bookingUrl: string;
}

export type SkeddaScrapeResult = SkeddaScrapeOk | SkeddaScrapeErr;

function normalizeWs(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function headerToIsoDate(headerText: string): string | null {
  const lines = headerText
    .split("\n")
    .map((l) => normalizeWs(l))
    .filter(Boolean);
  const long = lines.find((l) => /\bde\s+\w+\s+de\s+\d{4}\b/i.test(l));
  if (!long) return null;
  const m = long.match(
    /(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i
  );
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = ES_MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  const year = parseInt(m[3], 10);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function datePickerButton(page: Page) {
  return page.locator(
    'button.scheduler-header-nav-button-bold[title="Select date"]'
  );
}

async function readDisplayedIsoDate(page: Page): Promise<string | null> {
  const txt = await datePickerButton(page).innerText();
  return headerToIsoDate(txt);
}

async function navigateToDate(page: Page, targetIso: string): Promise<void> {
  for (let i = 0; i < 21; i++) {
    const cur = await readDisplayedIsoDate(page);
    if (!cur) throw new Error("No pude leer la fecha en Skedda.");
    if (cur === targetIso) return;

    if (targetIso > cur) {
      await page.locator("button.btn-g300:has(svg.fa-chevron-right)").click();
    } else {
      const prev = page.locator("button.btn-g300:has(svg.fa-chevron-left)");
      if (await prev.isDisabled()) {
        throw new Error(
          "Skedda no permite retroceder a esa fecha (botón deshabilitado)."
        );
      }
      await prev.click();
    }

    await page.waitForTimeout(450);
    try {
      await page.waitForLoadState("networkidle", { timeout: 8000 });
    } catch {
      /* seguir */
    }
    await page.waitForSelector("table.day-mode-table", { timeout: 15000 });
  }

  throw new Error("Demasiados clics de fecha: límite de seguridad.");
}

function normalizeWsLocal(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Scroll del contenedor del grid (string `evaluate` evita helpers del bundler en el browser). */
async function ensureDayGridFullyRendered(page: Page): Promise<void> {
  const loc = page.locator("table.day-mode-table").first();
  if ((await loc.count()) === 0) return;
  await loc.scrollIntoViewIfNeeded().catch(() => {});

  await page.evaluate(`
    (() => {
      var el = document.querySelector("table.day-mode-table");
      if (!el) return;
      var n = el;
      for (var d = 0; d < 14 && n; d++) {
        var st = getComputedStyle(n);
        if ((st.overflowY === "auto" || st.overflowY === "scroll") && n.scrollHeight > n.clientHeight + 8) {
          n.scrollTop = n.scrollHeight;
          return;
        }
        n = n.parentElement;
      }
    })()
  `);
  await sleep(450);

  await page.evaluate(`
    (() => {
      var el = document.querySelector("table.day-mode-table");
      if (!el) return;
      var n = el;
      for (var d = 0; d < 14 && n; d++) {
        var st = getComputedStyle(n);
        if ((st.overflowY === "auto" || st.overflowY === "scroll") && n.scrollHeight > n.clientHeight + 8) {
          n.scrollTop = 0;
          return;
        }
        n = n.parentElement;
      }
    })()
  `);
  await sleep(200);

  await page.evaluate(`
    window.scrollTo(0, Math.max(document.documentElement.scrollHeight || 0, 0))
  `);
  await sleep(180);
  await page.evaluate(`window.scrollTo(0, 0)`);
  await sleep(120);
}

/**
 * Etiqueta de hora de la columna izquierda del grid (ej. "2:00 p. m.", "10:00 P. M.").
 * Devuelve minutos desde medianoche del **inicio** de esa fila horaria (cada hora tiene 2 medias).
 */
function parseSkeddaGridHourToStartMinutes(label: string): number | null {
  const n = normalizeWsLocal(label).replace(/\u00a0/g, " ");
  const dotted = n.match(/^(\d{1,2}):(\d{2})\s*([ap])\.\s*m\.?$/i);
  const plain = n.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  const m = dotted ?? plain;
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const isPm = dotted
    ? m[3].toLowerCase() === "p"
    : (m[3] as string).toLowerCase() === "pm";
  if (isPm && hour < 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function minutesToDate(mins: number): Date {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return new Date(2000, 0, 1, h, m, 0, 0);
}

/** Rango en español; `endMin` es exclusivo (fin del último bloque de 30 min). */
function formatEsHalfHourRange(startMin: number, endMin: number): string {
  const s = minutesToDate(startMin);
  const e = minutesToDate(endMin);
  const a = format(s, "h:mm a", { locale: esLocale });
  const b = format(e, "h:mm a", { locale: esLocale });
  return `${a} – ${b}`;
}

function mergeHalfHourIntervals(
  items: { court: string; startMin: number; endMin: number }[]
): Record<string, SkeddaScrapedSlot[]> {
  const byCourt = new Map<string, { startMin: number; endMin: number }[]>();
  for (const it of items) {
    if (!byCourt.has(it.court)) byCourt.set(it.court, []);
    byCourt.get(it.court)!.push({ startMin: it.startMin, endMin: it.endMin });
  }

  const out: Record<string, SkeddaScrapedSlot[]> = {};
  for (const [court, ivs] of byCourt) {
    ivs.sort((a, b) => a.startMin - b.startMin);
    const merged: { startMin: number; endMin: number }[] = [];
    for (const iv of ivs) {
      const last = merged[merged.length - 1];
      if (last && last.endMin === iv.startMin) last.endMin = iv.endMin;
      else merged.push({ startMin: iv.startMin, endMin: iv.endMin });
    }
    out[court] = merged.map((m) => ({
      courtName: court,
      intervalLabel: formatEsHalfHourRange(m.startMin, m.endMin),
      durationMinutes: m.endMin - m.startMin,
    }));
  }
  return out;
}

function filterSkeddaCourtsByMinDuration(
  courts: Record<string, SkeddaScrapedSlot[]>,
  minMinutes: number | undefined
): Record<string, SkeddaScrapedSlot[]> {
  if (minMinutes === undefined || minMinutes <= 0) return courts;
  const out: Record<string, SkeddaScrapedSlot[]> = {};
  for (const [name, slots] of Object.entries(courts)) {
    const kept = slots.filter(
      (s) => (s.durationMinutes ?? 0) >= minMinutes
    );
    if (kept.length > 0) out[name] = kept;
  }
  return out;
}

/** Texto corto para el modelo: sin “visibilidad limitada” (el banner READ-ONLY es normal sin login). */
function buildSkeddaDisclaimer(
  minBookableMinutes: number | undefined,
  readOnlyMode: boolean
): string {
  const parts: string[] = [
    "Cupo = celda **verde** al hover en Skedda (reservable); rojo = no.",
  ];
  if (minBookableMinutes && minBookableMinutes > 0) {
    parts.push(
      `Reserva mínima del club: **${minBookableMinutes} min**; solo listamos bloques continuos que la cumplen.`
    );
  }
  if (readOnlyMode) {
    parts.push(
      "Vista pública del calendario (sin cuenta); no implica que los cupos anteriores sean incorrectos."
    );
  }
  return parts.join(" ");
}

/** Celdas grises usan `hoa-u` y no son reservables; las blancas sin `hoa-u` pueden estarlo. */
function isWhiteSlotBackground(rgb: string): boolean {
  return (
    rgb === "rgb(255, 255, 255)" ||
    rgb === "rgba(255, 255, 255, 1)" ||
    rgb === "rgba(255, 255, 255, 1.0)"
  );
}

/**
 * Skedda solo deja reservar cuando el hover pinta la celda en **verde** (`hov-a`);
 * en rojo (`hov-u`) no hay booking aunque la celda se vea blanca vacía.
 */
async function isSkeddaCellBookableAfterHover(
  td: Locator,
  page: Page
): Promise<boolean> {
  const cls0 = (await td.getAttribute("class")) || "";
  if (cls0.includes("hoa-u")) return false;

  const text = normalizeWsLocal(await td.innerText());
  if (text.length > 0) return false;

  const bg0 = await td.evaluate((el) => getComputedStyle(el).backgroundColor);
  if (!isWhiteSlotBackground(bg0)) return false;

  await td.scrollIntoViewIfNeeded().catch(() => {});

  try {
    await td.hover({ force: true, timeout: 10_000 });
  } catch {
    return false;
  }

  await sleep(320);

  const cls1 = (await td.getAttribute("class")) || "";
  const bg1 = await td.evaluate((el) => getComputedStyle(el).backgroundColor);

  await page.mouse.move(0, 0).catch(() => {});
  await sleep(120);

  if (cls1.includes("hov-u")) return false;
  return cls1.includes("hov-a") || bg1 === SKEDDA_HOVER_AVAILABLE_BG;
}

/** Sin `page.evaluate` masivo: evita helpers del bundler en el navegador. */
async function scrapeDayGrid(page: Page): Promise<{
  courts: Record<string, SkeddaScrapedSlot[]>;
  readOnlyMode: boolean;
  venueName: string;
}> {
  const bodyText = await page.locator("body").innerText();
  const readOnlyMode = /READ-ONLY|LIMITED VISIBILITY/i.test(bodyText);
  const venueName = /FÚTBOL\s+TOWN/i.test(bodyText)
    ? "Fútbol Town"
    : "Skedda venue";

  await ensureDayGridFullyRendered(page);

  const headerRow = page
    .locator("table.scheduler-header-spaces-table tbody tr")
    .first();
  const tdCount = await headerRow.locator("td").count();
  const courtNames: string[] = [];
  for (let i = 1; i < tdCount; i++) {
    courtNames.push(
      normalizeWsLocal(await headerRow.locator("td").nth(i).innerText())
    );
  }

  const rows = page.locator("table.day-mode-table tbody tr");
  const rowCount = await rows.count();

  let hourLabel = "";
  let halfIndex = 0;
  const freeRanges: { court: string; startMin: number; endMin: number }[] = [];
  const freeLegacy: { court: string; intervalLabel: string }[] = [];

  for (let r = 0; r < rowCount; r++) {
    const tr = rows.nth(r);
    const timeSmall = tr.locator("td.scheduler-time-column small").first();
    if ((await timeSmall.count()) > 0) {
      hourLabel = normalizeWsLocal(await timeSmall.innerText());
      halfIndex = 0;
    }

    const slotCells = tr.locator('td[role="button"]');
    const nSlots = await slotCells.count();
    if (nSlots === 0 || !hourLabel) continue;

    const halfLabel = halfIndex === 0 ? "1ª media hora" : "2ª media hora";
    const hourStart = parseSkeddaGridHourToStartMinutes(hourLabel);

    for (let c = 0; c < nSlots; c++) {
      const td = slotCells.nth(c);
      const ok = await isSkeddaCellBookableAfterHover(td, page);
      if (!ok) continue;
      const court = courtNames[c] ?? `Cancha ${c + 1}`;
      if (hourStart !== null) {
        const startMin = hourStart + (halfIndex === 0 ? 0 : 30);
        freeRanges.push({
          court,
          startMin,
          endMin: startMin + 30,
        });
      } else {
        freeLegacy.push({
          court,
          intervalLabel: `${hourLabel} (${halfLabel})`,
        });
      }
    }

    halfIndex = halfIndex === 0 ? 1 : 0;
  }

  const courtsMap = mergeHalfHourIntervals(freeRanges);
  for (const leg of freeLegacy) {
    if (!courtsMap[leg.court]) courtsMap[leg.court] = [];
    courtsMap[leg.court].push({
      courtName: leg.court,
      intervalLabel: leg.intervalLabel,
    });
  }

  return { courts: courtsMap, readOnlyMode, venueName };
}

function isSkeddaDisabled(): boolean {
  return (
    process.env.SKEDDA_SCRAPER_DISABLED === "1" ||
    process.env.SKEDDA_SCRAPER_DISABLED === "true"
  );
}

/**
 * Headless scrape de la vista **día** de Skedda. Frágil: depende del DOM de Skedda.
 * En serverless (p. ej. Vercel) suele fallar sin Chromium; usar SKEDDA_SCRAPER_DISABLED o un worker.
 */
export async function scrapeSkeddaDayAvailability(
  bookingUrl: string,
  targetDateIso: string,
  options?: { timeoutMs?: number; minBookableMinutes?: number }
): Promise<SkeddaScrapeResult> {
  if (isSkeddaDisabled()) {
    return {
      ok: false,
      error: "Scraper Skedda deshabilitado (SKEDDA_SCRAPER_DISABLED).",
      bookingUrl,
    };
  }

  const timeoutMs = options?.timeoutMs ?? 90_000;
  const minBookable = options?.minBookableMinutes;

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      timeout: timeoutMs,
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);

    await page.goto(bookingUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForSelector("#ember-root-element", { timeout: timeoutMs });
    await page.waitForSelector("table.day-mode-table", { timeout: timeoutMs });

    await navigateToDate(page, targetDateIso);

    await page.waitForTimeout(800);
    const displayedDate = (await readDisplayedIsoDate(page)) ?? targetDateIso;

    let { courts, readOnlyMode, venueName } = await scrapeDayGrid(page);
    courts = filterSkeddaCourtsByMinDuration(courts, minBookable);
    const flat = Object.values(courts).flat();

    const disclaimer = buildSkeddaDisclaimer(minBookable, readOnlyMode);

    return {
      ok: true,
      date: targetDateIso,
      displayedDate,
      venueName,
      readOnlyMode,
      bookingUrl,
      courts,
      totalFreeSlots: flat.length,
      disclaimer,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: msg,
      bookingUrl,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export interface SkeddaMultiDaySlice {
  date: string;
  totalFreeSlots: number;
  courts: Record<string, SkeddaScrapedSlot[]>;
}

/**
 * Un solo Chromium: navega día a día con la flecha derecha para ahorrar arranques.
 */
export async function scrapeSkeddaConsecutiveDays(
  bookingUrl: string,
  startDateIso: string,
  numberOfDays: number,
  options?: { timeoutMs?: number; minBookableMinutes?: number }
): Promise<
  | { ok: true; bookingUrl: string; readOnlyMode: boolean; venueName: string; disclaimer: string; results: SkeddaMultiDaySlice[] }
  | SkeddaScrapeErr
> {
  if (isSkeddaDisabled()) {
    return {
      ok: false,
      error: "Scraper Skedda deshabilitado (SKEDDA_SCRAPER_DISABLED).",
      bookingUrl,
    };
  }

  const days = Math.min(Math.max(numberOfDays, 1), 6);
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const minBookable = options?.minBookableMinutes;

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true, timeout: timeoutMs });
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);

    await page.goto(bookingUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    await page.waitForSelector("#ember-root-element", { timeout: timeoutMs });
    await page.waitForSelector("table.day-mode-table", { timeout: timeoutMs });

    await navigateToDate(page, startDateIso);

    const results: SkeddaMultiDaySlice[] = [];
    let readOnlyMode = false;
    let venueName = "Skedda venue";

    for (let i = 0; i < days; i++) {
      await page.waitForTimeout(500);
      const displayed =
        (await readDisplayedIsoDate(page)) ??
        format(addDays(parseISO(startDateIso), i), "yyyy-MM-dd");

      const grid = await scrapeDayGrid(page);
      readOnlyMode = readOnlyMode || grid.readOnlyMode;
      venueName = grid.venueName;

      const courts = filterSkeddaCourtsByMinDuration(
        grid.courts,
        minBookable
      );
      const flat = Object.values(courts).flat();
      results.push({
        date: displayed,
        totalFreeSlots: flat.length,
        courts,
      });

      if (i < days - 1) {
        await page.locator("button.btn-g300:has(svg.fa-chevron-right)").click();
        await page.waitForTimeout(400);
        try {
          await page.waitForLoadState("networkidle", { timeout: 6000 });
        } catch {
          /* ignore */
        }
        await page.waitForSelector("table.day-mode-table", { timeout: 15000 });
      }
    }

    const disclaimer = buildSkeddaDisclaimer(minBookable, readOnlyMode);

    return {
      ok: true,
      bookingUrl,
      readOnlyMode,
      venueName,
      disclaimer,
      results,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, bookingUrl };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
