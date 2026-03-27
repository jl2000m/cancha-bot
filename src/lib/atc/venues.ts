export type VenueProvider = "atc" | "external";

export interface VenuePlaybook {
  address: string;
  clubServices: readonly string[];
  typicalCourtFeatures: string;
  policies: {
    deposit: string;
    footwear: string;
    cancellation: string;
  };
  payment: {
    /** Yappy u otro handle; omitir si el club solo cobra vía web externa */
    yappyHandle?: string;
    instructionEs: string;
  };
  confirmation: {
    noEmailVoucherEs: string;
  };
}

export interface VenueConfig {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  locale: string;
  provider: VenueProvider;
  /** Requerido si provider === "atc" */
  atcSportclubId?: string;
  /** Reservas en Skedda, web propia, etc. (solo servidor; puede ocultarse al usuario). */
  externalBookingUrl?: string;
  /**
   * Si es true, no exponer `externalBookingUrl` al modelo ni dirigir al usuario a la web:
   * flujo end-to-end en el chat (disponibilidad vía scraper interno, reserva vía herramientas).
   */
  hidePublicBookingUrl?: boolean;
  /** Skedda u externo: solo listar bloques continuos con al menos esta duración (minutos). */
  externalMinBookingMinutes?: number;
}

export const VENUE_PLAYBOOKS: Record<string, VenuePlaybook> = {
  "pro-camp-explora": {
    address: "Avenida Condado del Rey, Terrenos de Explora, Panamá",
    clubServices: [
      "Wi-Fi",
      "Estacionamiento",
      "Cumpleaños",
      "Vestuario",
      "Torneos",
      "Escuelita deportiva",
    ],
    typicalCourtFeatures:
      "Césped sintético, iluminación, cancha descubierta (outdoor).",
    policies: {
      deposit:
        "Toda reserva debe ser separada con el **50%** del monto total de la reserva.",
      footwear:
        "Solo se permite el uso de **taquillos de fútbol** (no tenis ni calzado de calle).",
      cancellation:
        "Puedes **cancelar o reprogramar** con **al menos 24 horas** de anticipación. " +
        "Si avisas después, pueden aplicar políticas o cargos del club; ante duda, confirma con recepción o por los canales oficiales.",
    },
    payment: {
      yappyHandle: "@procampexplora",
      instructionEs:
        "Haz Yappy a **@procampexplora** desde el directorio y envía el comprobante **por este chat**.",
    },
    confirmation: {
      noEmailVoucherEs:
        "Por este canal **no enviamos voucher al correo**; estamos pendientes: mándanos el comprobante aquí y te confirmamos el cupo.",
    },
  },
  "futbol-town": {
    address:
      "Panamá — la dirección exacta y acceso se confirman al cerrar la reserva por este chat.",
    clubServices: [
      "Reservas coordinadas por chat",
      "Canchas de fútbol",
      "Iluminación",
    ],
    typicalCourtFeatures:
      "Instalaciones para fútbol; confirma tipo de cancha y superficie al reservar.",
    policies: {
      deposit:
        "Depósito y pago según las reglas del club. **Reserva mínima: 1 hora.** El asistente recoge datos aquí y el club confirma.",
      footwear:
        "Sigue las reglas del club sobre calzado; si no están claras, pregunta en recepción.",
      cancellation:
        "Cancelación y cambios según políticas del club (suele requerirse aviso con antelación).",
    },
    payment: {
      instructionEs:
        "El equipo del club indicará método de pago (transferencia, Yappy, etc.) **por este chat** tras confirmar el cupo.",
    },
    confirmation: {
      noEmailVoucherEs:
        "La confirmación final la envía el club por este canal; guarda el comprobante si te lo piden.",
    },
  },
};

/** Compat: mismo contenido que VENUE_PLAYBOOKS["pro-camp-explora"] */
export const VENUE_PLAYBOOK = VENUE_PLAYBOOKS["pro-camp-explora"];

export const VENUES: Record<string, VenueConfig> = {
  "pro-camp-explora": {
    id: "pro-camp-explora",
    name: "PRO CAMP EXPLORA",
    slug: "pro-camp-explora-panama",
    atcSportclubId: "1863",
    timezone: "America/Panama",
    currency: "PAN",
    locale: "es-PA",
    provider: "atc",
  },
  "futbol-town": {
    id: "futbol-town",
    name: "Fútbol Town",
    slug: "futbol-town-panama",
    timezone: "America/Panama",
    currency: "USD",
    locale: "es-PA",
    provider: "external",
    externalBookingUrl: "https://futboltown.skedda.com/booking",
    hidePublicBookingUrl: true,
    externalMinBookingMinutes: 60,
  },
};

export const DEFAULT_VENUE = VENUES["pro-camp-explora"];

export function getVenueById(id: string): VenueConfig | undefined {
  return VENUES[id];
}

export function getVenuePlaybook(venueId: string): VenuePlaybook | undefined {
  return VENUE_PLAYBOOKS[venueId];
}

export function listAtcVenueIds(): string[] {
  return Object.values(VENUES)
    .filter((v) => v.provider === "atc" && v.atcSportclubId)
    .map((v) => v.id);
}

export function assertAtcVenue(venue: VenueConfig): asserts venue is VenueConfig & {
  atcSportclubId: string;
} {
  if (venue.provider !== "atc" || !venue.atcSportclubId) {
    throw new Error(`Venue ${venue.id} is not ATC-backed`);
  }
}
