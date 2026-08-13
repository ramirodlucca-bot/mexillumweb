// Lógica de cálculo del diagnóstico. Funciones puras — se importan tanto
// desde el wizard en el navegador (src/scripts/diagnostico-form.ts) como
// desde el endpoint /api/diagnostico.ts, para que el número que ve el
// usuario y el que llega por email sean siempre el mismo cálculo.
//
// Nunca inventamos un peso a partir de una tarifa genérica: la tarifa real
// (MXN/kW, horarios, factor de potencia) está en la factura de cada
// cliente y varía por región/tarifa/temporada — no hay un valor único que
// sirva para todos. Por eso:
// - Siempre mostramos el rango de reducción de demanda pico como
//   PORCENTAJE (típico de la industria para BESS bien dimensionado).
// - Solo mostramos un rango en PESOS cuando el usuario ya nos dio su
//   gasto mensual real (pregunta 8, opcional) — y ese rango se calcula
//   como porcentaje de SU factura real, no de una tarifa supuesta.

export type Sector = "manufactura" | "alimentos" | "remota" | "publico" | "otra";
export type Criticidad = "sin_impacto" | "pierdo_producto" | "paro_linea";

export interface DiagnosticoRespuestas {
  sector: Sector;
  estado: string;
  yaGenera: boolean;
  demandaPicoKW: number;
  horasPorDia: number;
  turnos: number;
  criticidad: Criticidad;
  tieneDiesel: boolean;
  gastoMensualMXN?: number;
}

export interface Contacto {
  nombre: string;
  email: string;
  telefono?: string;
}

// ⚠️ Rangos típicos de referencia, no una promesa — alguien de Mexillum
// con datos reales de proyectos debería revisar/ajustar estos valores
// antes de tráfico real de prospectos.
export const REDUCCION_PICO_MIN_PCT = 20;
export const REDUCCION_PICO_MAX_PCT = 35;
// Ahorro típico sobre la factura TOTAL (no solo el cargo por demanda)
// para instalaciones con perfil de demanda relevante — solo se aplica
// cuando el usuario ya nos dio su gasto mensual real.
export const AHORRO_SOBRE_FACTURA_MIN_PCT = 5;
export const AHORRO_SOBRE_FACTURA_MAX_PCT = 15;

export interface ResultadoDiagnostico {
  tieneFacturaReal: boolean;
  ahorroMinMXN?: number;
  ahorroMaxMXN?: number;
  reduccionPicoMinPct: number;
  reduccionPicoMaxPct: number;
  palancas: string[];
  notaGeneracion?: string;
}

export function calcularDiagnostico(r: DiagnosticoRespuestas): ResultadoDiagnostico {
  const tieneFacturaReal = !!r.gastoMensualMXN && r.gastoMensualMXN > 0;

  return {
    tieneFacturaReal,
    ahorroMinMXN: tieneFacturaReal
      ? Math.round((r.gastoMensualMXN! * AHORRO_SOBRE_FACTURA_MIN_PCT) / 100)
      : undefined,
    ahorroMaxMXN: tieneFacturaReal
      ? Math.round((r.gastoMensualMXN! * AHORRO_SOBRE_FACTURA_MAX_PCT) / 100)
      : undefined,
    reduccionPicoMinPct: REDUCCION_PICO_MIN_PCT,
    reduccionPicoMaxPct: REDUCCION_PICO_MAX_PCT,
    palancas: priorizarPalancas(r),
    notaGeneracion: r.yaGenera
      ? "Ya tenés generación propia resuelta — esto es sobre lo que todavía no tenés cubierto: qué pasa cuando esa energía falla y cuánto te cuesta en el peor momento del día."
      : undefined,
  };
}

const PALANCA_COSTO = "Costo eléctrico bajo control";
const PALANCA_CONTINUIDAD = "Continuidad de operación";
const PALANCA_RIESGO = "Riesgo transferido";
const PALANCA_CAPEX = "Sin CAPEX";

export function priorizarPalancas(r: DiagnosticoRespuestas): string[] {
  const primarias: string[] = [];

  if (r.criticidad === "paro_linea" || r.criticidad === "pierdo_producto") {
    primarias.push(PALANCA_CONTINUIDAD);
  }
  if (r.demandaPicoKW > 150) {
    primarias.push(PALANCA_COSTO);
  }
  if (primarias.length === 0) {
    primarias.push(PALANCA_COSTO);
  }

  const resto = [PALANCA_COSTO, PALANCA_CONTINUIDAD, PALANCA_RIESGO, PALANCA_CAPEX].filter(
    (p) => !primarias.includes(p),
  );

  return [...primarias, ...resto];
}
