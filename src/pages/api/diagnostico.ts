import type { APIRoute } from "astro";
import {
  calcularDiagnostico,
  type Contacto,
  type DiagnosticoRespuestas,
} from "@/lib/diagnostico-calc";

export const prerender = false;

interface Body {
  respuestas: DiagnosticoRespuestas;
  contacto: Contacto;
}

function esBodyValido(body: unknown): body is Body {
  if (!body || typeof body !== "object") return false;
  const b = body as Partial<Body>;
  const r = b.respuestas;
  const c = b.contacto;
  if (!r || typeof r.demandaPicoKW !== "number" || r.demandaPicoKW <= 0) return false;
  if (!c || typeof c.nombre !== "string" || !c.nombre.trim()) return false;
  if (typeof c.email !== "string" || !c.email.includes("@")) return false;
  return true;
}

function formatearEmailHtml(respuestas: DiagnosticoRespuestas, contacto: Contacto): string {
  const resultado = calcularDiagnostico(respuestas);
  return `
    <h2>Nuevo diagnóstico completado</h2>
    <p><strong>${contacto.nombre}</strong> — ${contacto.email}${
      contacto.telefono ? ` — ${contacto.telefono}` : ""
    }</p>
    <ul>
      <li>Sector: ${respuestas.sector}</li>
      <li>Estado: ${respuestas.estado}</li>
      <li>Ya genera (solar/PPA): ${respuestas.yaGenera ? "sí" : "no"}</li>
      <li>Demanda pico: ${respuestas.demandaPicoKW} kW</li>
      <li>Operación: ${respuestas.horasPorDia} h/día, ${respuestas.turnos} turno(s)</li>
      <li>Criticidad ante falla: ${respuestas.criticidad}</li>
      <li>Tiene diésel de respaldo: ${respuestas.tieneDiesel ? "sí" : "no"}</li>
      <li>Gasto mensual declarado: ${
        respuestas.gastoMensualMXN ? `$${respuestas.gastoMensualMXN} MXN` : "no informado"
      }</li>
    </ul>
    <p>Cargo por demanda estimado: $${resultado.cargoDemandaEstimadoMXN} MXN/mes</p>
    <p>Ahorro estimado: $${resultado.ahorroMinMXN}–$${resultado.ahorroMaxMXN} MXN/mes</p>
    <p>Palancas priorizadas: ${resultado.palancas.join(", ")}</p>
  `;
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), { status: 400 });
  }

  if (!esBodyValido(body)) {
    return new Response(JSON.stringify({ ok: false, error: "Datos incompletos" }), {
      status: 400,
    });
  }

  const { respuestas, contacto } = body;
  const resultado = calcularDiagnostico(respuestas);

  // Red de seguridad: mientras no haya email configurado, esto es lo único
  // que evita perder el lead — queda visible en los logs de la función en
  // Vercel (`vercel logs` o el dashboard) aunque RESEND_API_KEY no exista.
  console.log(
    "LEAD_DIAGNOSTICO:",
    JSON.stringify({ contacto, respuestas, resultado, fecha: new Date().toISOString() }),
  );

  const apiKey = import.meta.env.RESEND_API_KEY;
  const destino = import.meta.env.LEAD_NOTIFICATION_EMAIL;

  if (apiKey && destino) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Mexillum <onboarding@resend.dev>",
          to: [destino],
          subject: `Nuevo diagnóstico: ${contacto.nombre}`,
          html: formatearEmailHtml(respuestas, contacto),
        }),
      });
    } catch {
      // No bloqueamos la respuesta al usuario si falla el envío del email.
    }
  }

  return new Response(JSON.stringify({ ok: true, resultado }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
