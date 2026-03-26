import { tool } from "ai";
import { z } from "zod";
import { format, addDays } from "date-fns";
import {
  fetchAvailability,
  formatAvailability,
  extractVenueInfo,
} from "@/lib/atc/client";
import { DEFAULT_VENUE, VENUE_PLAYBOOK } from "@/lib/atc/venues";

const venue = DEFAULT_VENUE;

export const bookingTools = {
  checkAvailability: tool({
    description:
      "Check available courts and time slots for one date at the soccer venue. " +
      "Use for availability questions. Date in YYYY-MM-DD; convert 'tomorrow', 'Saturday', etc. " +
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
    execute: async ({ date }) => {
      try {
        const data = await fetchAvailability(venue.atcSportclubId, date);
        const slots = formatAvailability(data);

        if (slots.length === 0) {
          return {
            available: false,
            date,
            message: `No hay horarios disponibles para el ${date}.`,
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
          venueName: data.name,
          courts: courtGroups,
          totalSlots: slots.length,
        };
      } catch {
        return {
          available: false,
          date,
          error: "No pude consultar la disponibilidad. Intenta de nuevo.",
        };
      }
    },
  }),

  getVenueInfo: tool({
    description:
      "Get information about the venue: name, address, phone, API amenities, " +
      "club services (Wi-Fi, parking, etc.), typical court features, policies, " +
      "Yappy payment handle, business hours. Use for location, services, rules, or payment questions.",
    inputSchema: z.object({}),
    execute: async () => {
      const clubContext = {
        clubServices: [...VENUE_PLAYBOOK.clubServices],
        typicalCourtFeatures: VENUE_PLAYBOOK.typicalCourtFeatures,
        policies: VENUE_PLAYBOOK.policies,
        payment: VENUE_PLAYBOOK.payment,
      };
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const data = await fetchAvailability(venue.atcSportclubId, today);
        const api = extractVenueInfo(data);
        return {
          ...api,
          address: VENUE_PLAYBOOK.address,
          apiAddressFromAtc: api.address,
          ...clubContext,
        };
      } catch {
        return {
          name: venue.name,
          timezone: venue.timezone,
          address: VENUE_PLAYBOOK.address,
          ...clubContext,
          error: "No pude obtener la información completa del venue.",
        };
      }
    },
  }),

  checkMultipleDays: tool({
    description:
      "Check availability across multiple consecutive days (max 6). " +
      "Use when the user is flexible on dates, asks for the next opening, or you need to see if " +
      "a specific hour exists tomorrow/day after while today has no match. " +
      "Keep the user-facing answer short: cite only relevant days/slots, not full dumps.",
    inputSchema: z.object({
      startDate: z
        .string()
        .describe("Start date in YYYY-MM-DD format"),
      numberOfDays: z
        .number()
        .min(1)
        .max(6)
        .describe("How many days to check (max 6, ATC allows up to 6 days ahead)"),
    }),
    execute: async ({ startDate, numberOfDays }) => {
      const results = [];
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
        daysChecked: numberOfDays,
        daysWithAvailability: results.length,
        results,
      };
    },
  }),

  createBooking: tool({
    description:
      "Create a booking reservation. Use ONLY after the user confirmed court, date, time, and name " +
      "(phone if given). Do not use for non-booking requests. After success, keep the reply short " +
      "and include deposit, footwear, cancellation (24h), and Yappy per system instructions.",
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
    execute: async ({
      courtName,
      date,
      startTime,
      duration,
      customerName,
      customerPhone,
    }) => {
      const bookingId = `BK-${Date.now().toString(36).toUpperCase()}`;
      const booking = {
        id: bookingId,
        venueName: venue.name,
        courtName,
        date,
        startTime,
        duration,
        customerName,
        customerPhone: customerPhone || "not provided",
        status: "confirmed",
        createdAt: new Date().toISOString(),
      };

      console.log("[BOOKING CREATED]", JSON.stringify(booking, null, 2));

      return {
        ...booking,
        venueAddress: VENUE_PLAYBOOK.address,
        clubServices: [...VENUE_PLAYBOOK.clubServices],
        typicalCourtFeatures: VENUE_PLAYBOOK.typicalCourtFeatures,
        policies: VENUE_PLAYBOOK.policies,
        payment: VENUE_PLAYBOOK.payment,
        confirmationNote: VENUE_PLAYBOOK.confirmation.noEmailVoucherEs,
      };
    },
  }),
};
