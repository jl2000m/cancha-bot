import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { format, addDays } from "date-fns";
import {
  fetchAvailability,
  formatAvailability,
  extractVenueInfo,
} from "@/lib/atc/client";
import {
  VENUES,
  getVenueById,
  getVenuePlaybook,
  assertAtcVenue,
  type VenueConfig,
} from "@/lib/atc/venues";
import {
  scrapeSkeddaConsecutiveDays,
  scrapeSkeddaDayAvailability,
} from "@/lib/skedda/scrape-availability";
import {
  fetchWixBookingsConsecutiveDays,
  fetchWixBookingsDayAvailability,
} from "@/lib/wix-bookings/availability";

export type BookingToolsMode = "single" | "multi";

export interface BookingToolsContext {
  mode: BookingToolsMode;
  /** Requerido cuando mode === "single" */
  venueId?: string;
}

function requireVenue(venueId: string): VenueConfig {
  const v = getVenueById(venueId);
  if (!v) throw new Error(`Unknown venue: ${venueId}`);
  return v;
}

function requirePlaybook(venueId: string) {
  const p = getVenuePlaybook(venueId);
  if (!p) throw new Error(`No playbook for venue: ${venueId}`);
  return p;
}

function hidePublicBooking(venue: VenueConfig): boolean {
  return venue.hidePublicBookingUrl === true;
}

/** No exponer URLs de reserva al modelo/usuario (flujo solo en chat). */
function redactBookingUrl<T extends Record<string, unknown>>(
  venue: VenueConfig,
  payload: T
): T {
  if (!hidePublicBooking(venue)) return payload;
  const { bookingUrl: _, ...rest } = payload;
  return rest as T;
}

function externalBookingPayload(venue: VenueConfig) {
  if (hidePublicBooking(venue)) {
    return {
      bookingViaChat: true as const,
      venueName: venue.name,
      message:
        `**${venue.name}**: cupos con las herramientas y reserva con **createBooking** en este chat.`,
    };
  }
  const url = venue.externalBookingUrl ?? "";
  return {
    liveAvailabilityOnExternal: true as const,
    bookingUrl: url,
    venueName: venue.name,
    message:
      `La disponibilidad en tiempo real y las reservas de **${venue.name}** están en su sistema oficial. ` +
      `No puedo ver cupos en vivo desde aquí; usa el enlace para elegir horario y completar la reserva.`,
  };
}

function isSkeddaUrl(url: string | undefined): boolean {
  return !!url && url.includes("skedda.com");
}

function hasWixBookingsApi(venue: VenueConfig): boolean {
  return (
    venue.provider === "external" &&
    !!venue.wixBookings &&
    !!venue.externalBookingUrl
  );
}

function buildListVenuesResult() {
  return {
    venues: Object.values(VENUES).map((v) => ({
      venueId: v.id,
      name: v.name,
      liveAvailabilityInChat:
        v.provider === "atc" ||
        (v.provider === "external" && isSkeddaUrl(v.externalBookingUrl)) ||
        (v.provider === "external" && !!v.wixBookings),
      bookingUrl:
        v.provider === "external" && !hidePublicBooking(v)
          ? (v.externalBookingUrl ?? null)
          : null,
      note:
        v.provider === "external" && hidePublicBooking(v)
          ? "Reservas y cupos solo por este chat (sin enlaces externos al usuario)."
          : v.provider === "external" && v.wixBookings
            ? "Disponibilidad vía API Wix Bookings del sitio; aplica duración mínima si está configurada."
            : v.provider === "external" && isSkeddaUrl(v.externalBookingUrl)
              ? "Disponibilidad vía Skedda (hover verde); aplica duración mínima del venue si está configurada."
              : v.provider === "external"
                ? "Consulta horarios y paga en el enlace oficial."
                : "Puedes consultar horarios en este chat con checkAvailability.",
    })),
  };
}

async function runCheckAvailability(venueId: string, date: string) {
  const venue = requireVenue(venueId);

  if (venue.provider === "external") {
    const url = venue.externalBookingUrl ?? "";

    if (hasWixBookingsApi(venue) && venue.wixBookings) {
      const minMins = venue.externalMinBookingMinutes;
      const wix = await fetchWixBookingsDayAvailability(
        url,
        venue.wixBookings,
        date,
        { minBookableMinutes: minMins }
      );
      if (wix.ok) {
        if (wix.totalFreeSlots === 0) {
          return redactBookingUrl(venue, {
            available: false,
            date,
            venueId,
            venueName: venue.name,
            message:
              minMins && minMins > 0
                ? `No se detectaron franjas libres de **al menos ${minMins} minutos** (reserva mínima del club) para el ${date} en ${venue.name}.`
                : `No se detectaron franjas libres para el ${date} en ${venue.name} (según el calendario).`,
            source: wix.source,
            disclaimer: wix.disclaimer,
            ...(minMins ? { minBookingMinutes: minMins } : {}),
          });
        }

        const courts: Record<
          string,
          { courtName: string; intervalLabel: string }[]
        > = {};
        for (const [courtName, slots] of Object.entries(wix.courts)) {
          courts[courtName] = slots.map((s) => ({
            courtName: s.courtName,
            intervalLabel: s.intervalLabel,
          }));
        }

        return redactBookingUrl(venue, {
          available: true,
          date,
          venueId,
          venueName: venue.name,
          courts,
          totalSlots: wix.totalFreeSlots,
          source: wix.source,
          disclaimer: wix.disclaimer,
          serviceName: wix.serviceName,
          ...(minMins ? { minBookingMinutes: minMins } : {}),
        });
      }

      return {
        ...externalBookingPayload(venue),
        date,
        scrapeError: wix.error,
        message: hidePublicBooking(venue)
          ? `No pudimos leer el calendario Wix (${wix.error}). Pide otra fecha o reintenta.`
          : `No pude leer el calendario Wix (${wix.error}). Abre el enlace oficial del club.`,
      };
    }

    if (isSkeddaUrl(url)) {
      const minMins = venue.externalMinBookingMinutes;
      const scraped = await scrapeSkeddaDayAvailability(url, date, {
        minBookableMinutes: minMins,
      });
      if (scraped.ok) {
        if (scraped.totalFreeSlots === 0) {
          return redactBookingUrl(venue, {
            available: false,
            date,
            venueId,
            venueName: scraped.venueName,
            message:
              minMins && minMins > 0
                ? `No se detectaron franjas libres de **al menos ${minMins} minutos** (reserva mínima del club) para el ${date} en ${scraped.venueName}.`
                : `No se detectaron franjas libres para el ${date} en ${scraped.venueName} (según el calendario).`,
            bookingUrl: scraped.bookingUrl,
            source: "skedda-scraper",
            disclaimer: scraped.disclaimer,
            displayedDate: scraped.displayedDate,
            readOnlyMode: scraped.readOnlyMode,
            ...(minMins ? { minBookingMinutes: minMins } : {}),
          });
        }

        const courts: Record<
          string,
          { courtName: string; intervalLabel: string }[]
        > = {};
        for (const [courtName, slots] of Object.entries(scraped.courts)) {
          courts[courtName] = slots.map((s) => ({
            courtName: s.courtName,
            intervalLabel: s.intervalLabel,
          }));
        }

        return redactBookingUrl(venue, {
          available: true,
          date,
          venueId,
          venueName: scraped.venueName,
          courts,
          totalSlots: scraped.totalFreeSlots,
          bookingUrl: scraped.bookingUrl,
          source: "skedda-scraper",
          displayedDate: scraped.displayedDate,
          disclaimer: scraped.disclaimer,
          readOnlyMode: scraped.readOnlyMode,
          ...(minMins ? { minBookingMinutes: minMins } : {}),
        });
      }

      return {
        ...externalBookingPayload(venue),
        date,
        scrapeError: scraped.error,
        message: hidePublicBooking(venue)
          ? `No pudimos leer el calendario (${scraped.error}). Pide otra fecha o reintenta en un momento.`
          : `No pude leer Skedda automáticamente (${scraped.error}). Abre el enlace oficial para ver cupos en vivo.`,
      };
    }

    return {
      ...externalBookingPayload(venue),
      date,
    };
  }

  assertAtcVenue(venue);
  try {
    const data = await fetchAvailability(venue.atcSportclubId, date);
    const slots = formatAvailability(data);

    if (slots.length === 0) {
      return {
        available: false,
        date,
        venueId,
        message: `No hay horarios disponibles para el ${date} en ${venue.name}.`,
      };
    }

    const courtGroups: Record<string, typeof slots> = {};
    for (const slot of slots) {
      if (!courtGroups[slot.courtName]) {
        courtGroups[slot.courtName] = [];
      }
      courtGroups[slot.courtName].push(slot);
    }

    return {
      available: true,
      date,
      venueId,
      venueName: data.name,
      courts: courtGroups,
      totalSlots: slots.length,
    };
  } catch {
    return {
      available: false,
      date,
      venueId,
      error: "No pude consultar la disponibilidad. Intenta de nuevo.",
    };
  }
}

/** Consulta en paralelo todos los venues del registro (comportamiento por defecto de Birriapp). */
async function runCheckAvailabilityAcrossVenues(date: string) {
  const venueIds = Object.keys(VENUES);
  const venues = await Promise.all(
    venueIds.map(async (venueId) => ({
      venueId,
      name: getVenueById(venueId)?.name ?? venueId,
      availability: await runCheckAvailability(venueId, date),
    }))
  );
  return { date, venues };
}

async function runGetVenueInfo(venueId: string) {
  const venue = requireVenue(venueId);
  const playbook = requirePlaybook(venueId);
  const clubContext = {
    clubServices: [...playbook.clubServices],
    typicalCourtFeatures: playbook.typicalCourtFeatures,
    policies: playbook.policies,
    payment: playbook.payment,
    ...(hidePublicBooking(venue)
      ? {}
      : { externalBookingUrl: venue.externalBookingUrl ?? null }),
  };

  if (venue.provider === "external") {
    return {
      venueId,
      name: venue.name,
      timezone: venue.timezone,
      address: playbook.address,
      ...clubContext,
      bookingNote: hidePublicBooking(venue)
        ? "Disponibilidad y reservas solo por este chat; no envíes enlaces externos al usuario."
        : "Reserva y disponibilidad en vivo: usa bookingUrl (Skedda / sistema del club).",
    };
  }

  assertAtcVenue(venue);
  try {
    const today = format(new Date(), "yyyy-MM-dd");
    const data = await fetchAvailability(venue.atcSportclubId, today);
    const api = extractVenueInfo(data);
    return {
      venueId,
      ...api,
      address: playbook.address,
      apiAddressFromAtc: api.address,
      ...clubContext,
    };
  } catch {
    return {
      venueId,
      name: venue.name,
      timezone: venue.timezone,
      address: playbook.address,
      ...clubContext,
      error: "No pude obtener la información completa del venue.",
    };
  }
}

async function runCheckMultipleDays(
  venueId: string,
  startDate: string,
  numberOfDays: number
) {
  const venue = requireVenue(venueId);

  if (venue.provider === "external") {
    const url = venue.externalBookingUrl ?? "";

    if (hasWixBookingsApi(venue) && venue.wixBookings) {
      const minMins = venue.externalMinBookingMinutes;
      const multi = await fetchWixBookingsConsecutiveDays(
        url,
        venue.wixBookings,
        startDate,
        numberOfDays,
        { minBookableMinutes: minMins }
      );
      if (multi.ok) {
        return redactBookingUrl(venue, {
          venueId,
          daysChecked: multi.results.length,
          daysWithAvailability: multi.results.filter((r) => r.totalFreeSlots > 0)
            .length,
          results: multi.results.map((r) => ({
            date: r.date,
            slots: r.totalFreeSlots,
            courts: r.courts,
          })),
          source: multi.source,
          venueName: venue.name,
          disclaimer: multi.disclaimer,
          ...(minMins ? { minBookingMinutes: minMins } : {}),
        });
      }
      return {
        venueId,
        ...externalBookingPayload(venue),
        daysChecked: numberOfDays,
        results: [] as const,
        scrapeError: multi.error,
      };
    }

    if (isSkeddaUrl(url)) {
      const multi = await scrapeSkeddaConsecutiveDays(
        url,
        startDate,
        numberOfDays,
        { minBookableMinutes: venue.externalMinBookingMinutes }
      );
      if (multi.ok) {
        return redactBookingUrl(venue, {
          venueId,
          daysChecked: multi.results.length,
          daysWithAvailability: multi.results.filter((r) => r.totalFreeSlots > 0)
            .length,
          results: multi.results.map((r) => ({
            date: r.date,
            slots: r.totalFreeSlots,
            courts: r.courts,
          })),
          source: "skedda-scraper",
          venueName: multi.venueName,
          disclaimer: multi.disclaimer,
          readOnlyMode: multi.readOnlyMode,
          bookingUrl: multi.bookingUrl,
          ...(venue.externalMinBookingMinutes
            ? { minBookingMinutes: venue.externalMinBookingMinutes }
            : {}),
        });
      }
      return {
        venueId,
        ...externalBookingPayload(venue),
        daysChecked: numberOfDays,
        results: [] as const,
        scrapeError: multi.error,
      };
    }

    return {
      venueId,
      ...externalBookingPayload(venue),
      daysChecked: numberOfDays,
      results: [] as const,
    };
  }

  assertAtcVenue(venue);
  const results: {
    date: string;
    slots: number;
    available: ReturnType<typeof formatAvailability>;
  }[] = [];
  const start = new Date(startDate + "T00:00:00");

  for (let i = 0; i < numberOfDays; i++) {
    const date = format(addDays(start, i), "yyyy-MM-dd");
    try {
      const data = await fetchAvailability(venue.atcSportclubId, date);
      const slots = formatAvailability(data);
      if (slots.length > 0) {
        results.push({ date, slots: slots.length, available: slots });
      }
    } catch {
      // skip failed dates
    }
  }

  return {
    venueId,
    daysChecked: numberOfDays,
    daysWithAvailability: results.length,
    results,
  };
}

async function runCreateBooking(
  venueId: string,
  args: {
    courtName: string;
    date: string;
    startTime: string;
    duration: number;
    customerName: string;
    customerPhone?: string;
  }
) {
  const venue = requireVenue(venueId);
  const playbook = requirePlaybook(venueId);

  if (venue.provider === "external") {
    if (hidePublicBooking(venue)) {
      const bookingId = `BK-${Date.now().toString(36).toUpperCase()}`;
      const booking = {
        id: bookingId,
        venueId,
        venueName: venue.name,
        courtName: args.courtName,
        date: args.date,
        startTime: args.startTime,
        duration: args.duration,
        customerName: args.customerName,
        customerPhone: args.customerPhone || "not provided",
        status: "pending_club_confirmation",
        createdAt: new Date().toISOString(),
      };
      console.log("[BOOKING INTENT]", JSON.stringify(booking, null, 2));
      return {
        bookedViaThisChat: true as const,
        ...booking,
        venueAddress: playbook.address,
        clubServices: [...playbook.clubServices],
        typicalCourtFeatures: playbook.typicalCourtFeatures,
        policies: playbook.policies,
        payment: playbook.payment,
        confirmationNote: playbook.confirmation.noEmailVoucherEs,
        message:
          `Solicitud registrada en **${venue.name}** por este chat. El club confirmará el cupo y el pago por aquí o sus canales habituales.`,
      };
    }
    return {
      bookedViaThisChat: false as const,
      venueId,
      venueName: venue.name,
      bookingUrl: venue.externalBookingUrl ?? "",
      message:
        `Las reservas de **${venue.name}** se confirman en su sistema oficial. ` +
        `Abre el enlace, elige cancha y horario, y completa el pago allí.`,
    };
  }

  assertAtcVenue(venue);
  const bookingId = `BK-${Date.now().toString(36).toUpperCase()}`;
  const booking = {
    id: bookingId,
    venueId,
    venueName: venue.name,
    courtName: args.courtName,
    date: args.date,
    startTime: args.startTime,
    duration: args.duration,
    customerName: args.customerName,
    customerPhone: args.customerPhone || "not provided",
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  console.log("[BOOKING CREATED]", JSON.stringify(booking, null, 2));

  return {
    ...booking,
    venueAddress: playbook.address,
    clubServices: [...playbook.clubServices],
    typicalCourtFeatures: playbook.typicalCourtFeatures,
    policies: playbook.policies,
    payment: playbook.payment,
    confirmationNote: playbook.confirmation.noEmailVoucherEs,
  };
}

const venueIdEnumAny = z.enum(
  Object.keys(VENUES) as [string, ...string[]]
);

export function createBookingTools(ctx: BookingToolsContext): ToolSet {
  if (ctx.mode === "multi") {
    return {
      listVenues: tool({
        description:
          "List connected venues (ids, enlaces, notas). Usa si preguntan qué sedes existen o cómo reservar.",
        inputSchema: z.object({}),
        execute: async () => buildListVenuesResult(),
      }),

      checkAvailabilityAcrossVenues: tool({
        description:
          "**Herramienta por defecto de Birriapp** para cupos: consulta **todos** los clubs conectados para **una misma fecha** en paralelo. " +
          "Úsala cuando el usuario pregunte por disponibilidad **sin** nombrar un solo venue (ej. “¿hay cancha mañana?”, “¿dónde hay espacio el sábado?”). " +
          "Así comparan sedes sin chatear con cada agente por separado. " +
          "Si el usuario **nombra un club concreto** (PRO CAMP, Fútbol Town, un venueId), usa **checkAvailability** solo para ese venue. " +
          "Después de recibir resultados, si pidieron una **hora concreta**, contrasta esa hora entre venues usando los datos devueltos (slots ATC + intervalos Skedda).",
        inputSchema: z.object({
          date: z
            .string()
            .describe(
              "YYYY-MM-DD. Hoy es " + format(new Date(), "yyyy-MM-dd") + "."
            ),
        }),
        execute: async ({ date }) => runCheckAvailabilityAcrossVenues(date),
      }),

      checkAvailability: tool({
        description:
          "Cupos en **un solo** venue (id explícito). Úsala solo si el usuario pidió **ese** club o ya eligió sede. " +
          "Si no nombraron sede, prefiere **checkAvailabilityAcrossVenues**. " +
          "Si el resultado trae **minBookingMinutes**, respeta esa duración mínima al recomendar horarios.",
        inputSchema: z.object({
          venueId: venueIdEnumAny.describe("Venue id from listVenues"),
          date: z
            .string()
            .describe(
              "Date in YYYY-MM-DD. Today is " +
                format(new Date(), "yyyy-MM-dd") +
                "."
            ),
        }),
        execute: async ({ venueId, date }) => runCheckAvailability(venueId, date),
      }),

      getVenueInfo: tool({
        description:
          "Venue details: address, services, policies, payment, phone when available.",
        inputSchema: z.object({
          venueId: venueIdEnumAny,
        }),
        execute: async ({ venueId }) => runGetVenueInfo(venueId),
      }),

      checkMultipleDays: tool({
        description:
          "Cupos en **varios días seguidos** para **un** venue (cuando ya nombraron sede o siguen en un club concreto). " +
          "No sustituye a checkAvailabilityAcrossVenues para comparar sedes el mismo día.",
        inputSchema: z.object({
          venueId: venueIdEnumAny,
          startDate: z.string().describe("Start date YYYY-MM-DD"),
          numberOfDays: z.number().min(1).max(6),
        }),
        execute: async ({ venueId, startDate, numberOfDays }) =>
          runCheckMultipleDays(venueId, startDate, numberOfDays),
      }),

      createBooking: tool({
        description:
          "Registrar reserva tras confirmar cancha, fecha, hora y nombre. " +
          "Venues ATC: cupo en sistema interno. Venues “solo chat” (p. ej. Fútbol Town): solicitud por este canal sin enlaces externos.",
        inputSchema: z.object({
          venueId: venueIdEnumAny,
          courtName: z.string(),
          date: z.string(),
          startTime: z.string(),
          duration: z.number(),
          customerName: z.string(),
          customerPhone: z.string().optional(),
        }),
        execute: async (input) =>
          runCreateBooking(input.venueId, {
            courtName: input.courtName,
            date: input.date,
            startTime: input.startTime,
            duration: input.duration,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
          }),
      }),
    } as ToolSet;
  }

  const singleVenueId = ctx.venueId;
  if (!singleVenueId) {
    throw new Error("createBookingTools(single) requires venueId");
  }
  requireVenue(singleVenueId);

  return {
    checkAvailability: tool({
      description:
        "Check available courts and time slots for one date at the soccer venue. " +
        "Use for availability questions. Date in YYYY-MM-DD; convert 'tomorrow', 'Saturday', etc. " +
        "If the response includes minBookingMinutes, that is the venue minimum booking length; interval labels already meet it. " +
        "After results: if the user asked for a specific time that is missing, do NOT dump every slot—offer " +
        "the closest 1–2 options on that day and optionally ask if they want the full list. " +
        "Use checkMultipleDays when you need the same clock time on nearby days.",
      inputSchema: z.object({
        date: z
          .string()
          .describe(
            "Date in YYYY-MM-DD format. Today is " +
              format(new Date(), "yyyy-MM-dd") +
              ". Convert relative dates (tomorrow, next Saturday, etc.) to absolute."
          ),
      }),
      execute: async ({ date }) => runCheckAvailability(singleVenueId, date),
    }),

    getVenueInfo: tool({
      description:
        "Get information about the venue: name, address, phone, API amenities, " +
        "club services, typical court features, policies, payment. " +
        "Use for location, services, rules, or payment questions.",
      inputSchema: z.object({}),
      execute: async () => runGetVenueInfo(singleVenueId),
    }),

    checkMultipleDays: tool({
      description:
        "Check availability across multiple consecutive days (max 6). " +
        "Use when the user is flexible on dates, asks for the next opening, or you need to see if " +
        "a specific hour exists tomorrow/day after while today has no match. " +
        "Keep the user-facing answer short: cite only relevant days/slots, not full dumps.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date in YYYY-MM-DD format"),
        numberOfDays: z
          .number()
          .min(1)
          .max(6)
          .describe("How many days to check (max 6, ATC allows up to 6 days ahead)"),
      }),
      execute: async ({ startDate, numberOfDays }) =>
        runCheckMultipleDays(singleVenueId, startDate, numberOfDays),
    }),

    createBooking: tool({
      description:
        "Registrar reserva tras confirmar cancha, fecha, hora y nombre (teléfono si lo dan). " +
        "Si el venue es solo chat, registra la solicitud aquí sin mandar al usuario a la web. " +
        "Respuesta breve con políticas de depósito, calzado y cancelación según el sistema.",
      inputSchema: z.object({
        courtName: z.string().describe("Name of the court (e.g., 'Cancha 1 F5')"),
        date: z.string().describe("Date in YYYY-MM-DD format"),
        startTime: z.string().describe("Start time (e.g., '19:00')"),
        duration: z.number().describe("Duration in minutes"),
        customerName: z.string().describe("Customer's full name"),
        customerPhone: z
          .string()
          .optional()
          .describe("Customer's phone number if provided"),
      }),
      execute: async (args) => runCreateBooking(singleVenueId, args),
    }),
  } as ToolSet;
}

/** Compat: Telegram y rutas legacy usan solo PRO CAMP. */
export const bookingTools = createBookingTools({
  mode: "single",
  venueId: "pro-camp-explora",
});
