// Lógica de cálculo del diagnóstico. Funciones puras — se importan tanto
// desde el wizard en el navegador (src/scripts/diagnostico-form.ts) como
// desde el endpoint /api/diagnostico.ts, para que el número que ve el
// usuario y el que llega por email sean siempre el mismo cálculo.

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

// ⚠️ Tarifa de referencia (MXN/kW/mes), NO la tarifa real de CFE vigente —
// es un supuesto explícito para poder mostrar aritmética sin pedir la
// factura. Alguien de Mexillum con datos de tarifa actuales debería
// revisar/ajustar este único valor antes de tráfico real de prospectos.
export const REFERENCIA_CARGO_DEMANDA_MXN_KW = 450;
export const REDUCCION_PICO_MIN = 0.2;
export const REDUCCION_PICO_MAX = 0.35;

export interface ResultadoDiagnostico {
  cargoDemandaEstimadoMXN: number;
  ahorroMinMXN: number;
  ahorroMaxMXN: number;
  porcentajeSobreFactura?: { min: number; max: number };
  palancas: string[];
  notaGeneracion?: string;
}

export function calcularDiagnostico(r: DiagnosticoRespuestas): ResultadoDiagnostico {
  const cargoDemandaEstimadoMXN = Math.round(r.demandaPicoKW * REFERENCIA_CARGO_DEMANDA_MXN_KW);
  const ahorroMinMXN = Math.round(cargoDemandaEstimadoMXN * REDUCCION_PICO_MIN);
  const ahorroMaxMXN = Math.round(cargoDemandaEstimadoMXN * REDUCCION_PICO_MAX);

  const porcentajeSobreFactura =
    r.gastoMensualMXN && r.gastoMensualMXN > 0
      ? {
          min: Math.round((ahorroMinMXN / r.gastoMensualMXN) * 100),
          max: Math.round((ahorroMaxMXN / r.gastoMensualMXN) * 100),
        }
      : undefined;

  return {
    cargoDemandaEstimadoMXN,
    ahorroMinMXN,
    ahorroMaxMXN,
    porcentajeSobreFactura,
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
