import { addDays, differenceInMinutes, format, parse, parseISO } from "date-fns";
import { es as esLocale } from "date-fns/locale";

/** App definition id del widget “Booking Calendar” en Wix (mismo en todos los sitios estándar). */
const WIX_BOOKINGS_CALENDAR_APP_DEF_ID =
  "13d21c63-b5ec-5912-8397-c3a5ddb27a97";

export interface VenueWixBookingsConfig {
  /** Slug de la URL del calendario, p. ej. `cancha-completa-1`. */
  calendarSlug: string;
  timeZone: string;
  /** Revisión del sitio Wix; si cambia el publish, actualizar. */
  siteRevision?: string;
}

interface AccessTokensJson {
  visitorId: string;
  apps: Record<string, { accessToken?: string } | undefined>;
}

interface TimeSlotRow {
  localStartDate: string;
  localEndDate: string;
  bookable?: boolean;
  remainingCapacity?: number;
}

interface TimeSlotsResponse {
  timeSlots?: TimeSlotRow[];
}

interface ServicesQueryResponse {
  services?: Array<{ id: string; name?: string }>;
}

export interface WixBookingsDayOk {
  ok: true;
  date: string;
  serviceName: string;
  courts: Record<string, { courtName: string; intervalLabel: string }[]>;
  totalFreeSlots: number;
  disclaimer: string;
  source: "wix-bookings-api";
}

export interface WixBookingsDayErr {
  ok: false;
  error: string;
  source: "wix-bookings-api";
}

export type WixBookingsDayResult = WixBookingsDayOk | WixBookingsDayErr;

function wixDisabled(): boolean {
  return (
    process.env.WIX_BOOKINGS_DISABLED === "1" ||
    process.env.WIX_BOOKINGS_DISABLED === "true"
  );
}

function siteOriginFromBookingUrl(bookingPageUrl: string): string {
  return new URL(bookingPageUrl).origin;
}

function buildCommonConfigHeader(
  visitorId: string,
  siteRevision: string
): string {
  return encodeURIComponent(
    JSON.stringify({
      brand: "wix",
      host: "VIEWER",
      BSI: `${visitorId}|1`,
      siteRevision,
      renderingFlow: "NONE",
      language: "es",
      locale: "es-pa",
    })
  );
}

async function fetchAccessTokens(origin: string): Promise<AccessTokensJson> {
  const res = await fetch(`${origin}/_api/v1/access-tokens`, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (compatible; CanchaBot/1.0)",
    },
  });
  if (!res.ok) {
    throw new Error(`access-tokens HTTP ${res.status}`);
  }
  return (await res.json()) as AccessTokensJson;
}

function bookingsAuthHeaders(
  tokens: AccessTokensJson,
  siteRevision: string
): { authorization: string; commonconfig: string } {
  const token =
    tokens.apps[WIX_BOOKINGS_CALENDAR_APP_DEF_ID]?.accessToken ?? "";
  if (!token) {
    throw new Error("Wix Bookings: no accessToken para el calendario.");
  }
  return {
    authorization: token,
    commonconfig: buildCommonConfigHeader(tokens.visitorId, siteRevision),
  };
}

async function postWixJson<T>(
  origin: string,
  path: string,
  headers: { authorization: string; commonconfig: string },
  body: unknown
): Promise<T> {
  const res = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: headers.authorization,
      commonconfig: headers.commonconfig,
      "x-wix-brand": "wix",
      "user-agent": "Mozilla/5.0 (compatible; CanchaBot/1.0)",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`${path} HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function resolveServiceId(
  origin: string,
  auth: { authorization: string; commonconfig: string },
  calendarSlug: string
): Promise<{ id: string; name: string }> {
  const data = await postWixJson<ServicesQueryResponse>(
    origin,
    "/_api/bookings/v2/services/query",
    auth,
    {
      conditionalFields: [
        "STAFF_MEMBER_DETAILS",
        "DISCOUNT_INFO_DETAILS",
      ],
      query: {
        filter: {
          "supportedSlugs.name": calendarSlug,
          type: { $in: ["CLASS", "APPOINTMENT"] },
          "onlineBooking.enabled": true,
          $or: [{ hidden: false }, { hidden: { $exists: false } }],
        },
      },
    }
  );
  const s = data.services?.[0];
  if (!s?.id) {
    throw new Error(`No se encontró servicio Wix para slug “${calendarSlug}”.`);
  }
  return { id: s.id, name: s.name ?? "Servicio" };
}

function formatLocalRange(startStr: string, endStr: string): string {
  const s = parse(startStr, "yyyy-MM-dd'T'HH:mm:ss", new Date());
  const e = parse(endStr, "yyyy-MM-dd'T'HH:mm:ss", new Date());
  const a = format(s, "h:mm a", { locale: esLocale });
  const b = format(e, "h:mm a", { locale: esLocale });
  return `${a} – ${b}`;
}

function slotDurationMinutes(row: TimeSlotRow): number {
  const s = parse(row.localStartDate, "yyyy-MM-dd'T'HH:mm:ss", new Date());
  const e = parse(row.localEndDate, "yyyy-MM-dd'T'HH:mm:ss", new Date());
  return differenceInMinutes(e, s);
}

/**
 * Cupos del día vía API de Wix Bookings (misma que usa el calendario embebido).
 */
export async function fetchWixBookingsDayAvailability(
  bookingPageUrl: string,
  wix: VenueWixBookingsConfig,
  dateIso: string,
  options?: { minBookableMinutes?: number; timeoutMs?: number }
): Promise<WixBookingsDayResult> {
  if (wixDisabled()) {
    return {
      ok: false,
      error: "Cliente Wix deshabilitado (WIX_BOOKINGS_DISABLED).",
      source: "wix-bookings-api",
    };
  }

  const minMins = options?.minBookableMinutes;
  const siteRevision = wix.siteRevision ?? "89";
  const origin = siteOriginFromBookingUrl(bookingPageUrl);

  try {
    const tokens = await fetchAccessTokens(origin);
    const auth = bookingsAuthHeaders(tokens, siteRevision);
    const service = await resolveServiceId(
      origin,
      auth,
      wix.calendarSlug
    );

    const data = await postWixJson<TimeSlotsResponse>(
      origin,
      "/_api/service-availability/v2/time-slots",
      auth,
      {
        serviceId: service.id,
        fromLocalDate: `${dateIso}T00:00:00`,
        toLocalDate: `${dateIso}T23:59:59`,
        timeZone: wix.timeZone,
        bookable: true,
        includeNonBookable: false,
        shouldReturnAllResources: true,
      }
    );

    const rows = data.timeSlots ?? [];
    const free: { courtName: string; intervalLabel: string }[] = [];

    for (const row of rows) {
      if (!row.bookable) continue;
      if ((row.remainingCapacity ?? 0) < 1) continue;
      const dur = slotDurationMinutes(row);
      if (minMins !== undefined && minMins > 0 && dur < minMins) continue;
      free.push({
        courtName: service.name,
        intervalLabel: formatLocalRange(
          row.localStartDate,
          row.localEndDate
        ),
      });
    }

    const courts: Record<string, typeof free> = {};
    if (free.length > 0) {
      courts[service.name] = free;
    }

    const disclaimer =
      "Cupo leído desde el calendario Wix del club (API de disponibilidad). " +
      "Confirma precio y detalle al cerrar la reserva.";

    return {
      ok: true,
      date: dateIso,
      serviceName: service.name,
      courts,
      totalFreeSlots: free.length,
      disclaimer,
      source: "wix-bookings-api",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, source: "wix-bookings-api" };
  }
}

export interface WixBookingsMultiDaySlice {
  date: string;
  totalFreeSlots: number;
  courts: Record<string, { courtName: string; intervalLabel: string }[]>;
}

export async function fetchWixBookingsConsecutiveDays(
  bookingPageUrl: string,
  wix: VenueWixBookingsConfig,
  startDateIso: string,
  numberOfDays: number,
  options?: { minBookableMinutes?: number }
): Promise<
  | {
      ok: true;
      disclaimer: string;
      results: WixBookingsMultiDaySlice[];
      source: "wix-bookings-api";
    }
  | WixBookingsDayErr
> {
  if (wixDisabled()) {
    return {
      ok: false,
      error: "Cliente Wix deshabilitado (WIX_BOOKINGS_DISABLED).",
      source: "wix-bookings-api",
    };
  }

  const days = Math.min(Math.max(numberOfDays, 1), 6);
  const start = parseISO(startDateIso);
  const results: WixBookingsMultiDaySlice[] = [];
  let disclaimer = "";

  for (let i = 0; i < days; i++) {
    const dateIso = format(addDays(start, i), "yyyy-MM-dd");
    const day = await fetchWixBookingsDayAvailability(
      bookingPageUrl,
      wix,
      dateIso,
      options
    );
    if (!day.ok) {
      return day;
    }
    disclaimer = day.disclaimer;
    const flat = Object.values(day.courts).flat();
    results.push({
      date: day.date,
      totalFreeSlots: flat.length,
      courts: day.courts,
    });
  }

  return {
    ok: true,
    disclaimer,
    results,
    source: "wix-bookings-api",
  };
}
