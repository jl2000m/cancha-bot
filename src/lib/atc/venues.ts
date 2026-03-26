export interface VenueConfig {
  id: string;
  name: string;
  slug: string;
  atcSportclubId: string;
  timezone: string;
  currency: string;
  locale: string;
}

/** Static copy + policies shown in chat; keep in sync with club rules. */
export const VENUE_PLAYBOOK = {
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
} as const;

// Single venue for now -- add more rows here for marketplace expansion
export const VENUES: Record<string, VenueConfig> = {
  "pro-camp-explora": {
    id: "pro-camp-explora",
    name: "PRO CAMP EXPLORA",
    slug: "pro-camp-explora-panama",
    atcSportclubId: "1863",
    timezone: "America/Panama",
    currency: "PAN",
    locale: "es-PA",
  },
};

export const DEFAULT_VENUE = VENUES["pro-camp-explora"];

export function getVenueById(id: string): VenueConfig | undefined {
  return VENUES[id];
}
