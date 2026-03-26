const ATC_API_BASE = "https://alquilatucancha.com/api/v3";

interface PriceInfo {
  cents: number;
  currency: string;
}

interface AvailableSlot {
  start: string;
  duration: number;
  price: PriceInfo;
}

interface Court {
  id: string;
  name: string;
  surface_type: string;
  has_lighting: boolean;
  is_roofed: boolean;
  sport_ids: string[];
  available_slots: AvailableSlot[];
}

interface BusinessHours {
  day_of_week: string;
  open_time: string;
  close_time: string;
}

interface VenueAvailability {
  id: string;
  permalink: string;
  name: string;
  phone: string;
  location: {
    zone: {
      name: string;
      timezone: string;
      country: { code: string; currency: string; currency_code: string };
    };
    name: string;
    lat: number;
    lng: number;
  };
  amenities: { id: string; name: string }[];
  date: string;
  business_hours: BusinessHours[];
  business_hours_for_given_date: BusinessHours;
  currency: string;
  available_courts: Court[];
}

export interface FormattedSlot {
  courtId: string;
  courtName: string;
  startTime: string;
  startHour: string;
  duration: number;
  priceDisplay: string;
  priceCents: number;
}

export interface VenueInfo {
  name: string;
  address: string;
  phone: string;
  timezone: string;
  amenities: string[];
  businessHours: { day: string; open: string; close: string }[];
}

export async function fetchAvailability(
  sportclubId: string,
  date: string
): Promise<VenueAvailability> {
  const res = await fetch(
    `${ATC_API_BASE}/availability/sportclubs/${sportclubId}?date=${date}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`ATC API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export function formatAvailability(data: VenueAvailability): FormattedSlot[] {
  const slots: FormattedSlot[] = [];

  for (const court of data.available_courts) {
    for (const slot of court.available_slots) {
      const startDate = new Date(slot.start);
      const startHour = startDate.toLocaleTimeString("es-PA", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: data.location.zone.timezone,
      });

      slots.push({
        courtId: court.id,
        courtName: court.name,
        startTime: slot.start,
        startHour,
        duration: slot.duration,
        priceDisplay: `$${(slot.price.cents / 100).toFixed(2)}`,
        priceCents: slot.price.cents,
      });
    }
  }

  return slots;
}

export function extractVenueInfo(data: VenueAvailability): VenueInfo {
  return {
    name: data.name,
    address: data.location.name,
    phone: data.phone,
    timezone: data.location.zone.timezone,
    amenities: data.amenities.map((a) => a.name),
    businessHours: data.business_hours.map((bh) => ({
      day: bh.day_of_week,
      open: bh.open_time,
      close: bh.close_time,
    })),
  };
}
