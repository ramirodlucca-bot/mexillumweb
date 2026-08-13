import { track } from "@vercel/analytics";
import {
  calcularDiagnostico,
  AHORRO_SOBRE_FACTURA_MIN_PCT,
  AHORRO_SOBRE_FACTURA_MAX_PCT,
  type DiagnosticoRespuestas,
} from "@/lib/diagnostico-calc";

const TOTAL_PASOS = 8;

function leerRespuestas(form: HTMLFormElement): DiagnosticoRespuestas {
  const data = new FormData(form);
  return {
    sector: data.get("sector") as DiagnosticoRespuestas["sector"],
    estado: String(data.get("estado") ?? ""),
    yaGenera: data.get("yaGenera") === "si",
    demandaPicoKW: Number(data.get("demandaPicoKW") ?? 0),
    horasPorDia: Number(data.get("horasPorDia") ?? 0),
    turnos: Number(data.get("turnos") ?? 1),
    criticidad: data.get("criticidad") as DiagnosticoRespuestas["criticidad"],
    tieneDiesel: data.get("tieneDiesel") === "si",
    gastoMensualMXN: data.get("gastoMensualMXN")
      ? Number(data.get("gastoMensualMXN"))
      : undefined,
  };
}

function formatMXN(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

export function initDiagnosticoForm(): void {
  const form = document.querySelector<HTMLFormElement>("[data-diagnostico-form]");
  const resultado = document.querySelector<HTMLElement>("[data-resultado]");
  if (!form || !resultado) return;

  const progressLabel = form.querySelector<HTMLElement>("[data-progress-label]");
  const prevBtn = form.querySelector<HTMLButtonElement>("[data-diagnostico-prev]");
  const nextBtn = form.querySelector<HTMLButtonElement>("[data-diagnostico-next]");
  const steps = [...form.querySelectorAll<HTMLFieldSetElement>("[data-step]")];

  let current = 1;

  function showStep(n: number) {
    steps.forEach((s) => {
      s.hidden = Number(s.dataset.step) !== n;
    });
    if (progressLabel) progressLabel.textContent = `Pregunta ${n} de ${TOTAL_PASOS}`;
    if (prevBtn) prevBtn.style.visibility = n === 1 ? "hidden" : "visible";
    if (nextBtn) nextBtn.textContent = n === TOTAL_PASOS ? "Ver resultado" : "Siguiente";
  }

  function currentStepValid(): boolean {
    const step = steps.find((s) => Number(s.dataset.step) === current);
    if (!step) return true;
    const inputs = [...step.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")];
    return inputs.every((el) => el.checkValidity());
  }

  function reportCurrentStep() {
    const step = steps.find((s) => Number(s.dataset.step) === current);
    step?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((el) => {
      el.reportValidity();
    });
  }

  nextBtn?.addEventListener("click", () => {
    if (!currentStepValid()) {
      reportCurrentStep();
      return;
    }
    if (current < TOTAL_PASOS) {
      current += 1;
      showStep(current);
      track("diagnostico_pregunta", { pregunta: current });
      return;
    }
    mostrarResultado();
  });

  prevBtn?.addEventListener("click", () => {
    if (current > 1) {
      current -= 1;
      showStep(current);
    }
  });

  let respuestasActuales: DiagnosticoRespuestas | null = null;

  function mostrarResultado() {
    if (!form || !resultado) return;
    const respuestas = leerRespuestas(form);
    respuestasActuales = respuestas;
    const r = calcularDiagnostico(respuestas);

    const desglose = resultado.querySelector<HTMLElement>("[data-resultado-desglose]");
    const rango = resultado.querySelector<HTMLElement>("[data-resultado-rango]");
    const porcentaje = resultado.querySelector<HTMLElement>("[data-resultado-porcentaje]");
    const notaGeneracion = resultado.querySelector<HTMLElement>("[data-resultado-nota-generacion]");
    const palancasEl = resultado.querySelector<HTMLOListElement>("[data-resultado-palancas]");

    if (desglose) {
      desglose.textContent = r.tieneFacturaReal
        ? `Con una demanda pico de ${respuestas.demandaPicoKW} kW, un sistema de almacenamiento bien dimensionado suele reducir esa demanda entre ${r.reduccionPicoMinPct}% y ${r.reduccionPicoMaxPct}%.`
        : `Con una demanda pico de ${respuestas.demandaPicoKW} kW, un sistema de almacenamiento bien dimensionado suele reducir esa demanda entre ${r.reduccionPicoMinPct}% y ${r.reduccionPicoMaxPct}% — típico para instalaciones con tu perfil.`;
    }
    if (rango) {
      rango.textContent = r.tieneFacturaReal
        ? `$${formatMXN(r.ahorroMinMXN!)}–$${formatMXN(r.ahorroMaxMXN!)} MXN/mes estimados`
        : `${r.reduccionPicoMinPct}%–${r.reduccionPicoMaxPct}% de reducción en demanda pico`;
    }
    if (porcentaje) {
      porcentaje.textContent = r.tieneFacturaReal
        ? `Eso equivale aproximadamente a un ${AHORRO_SOBRE_FACTURA_MIN_PCT}%–${AHORRO_SOBRE_FACTURA_MAX_PCT}% de tu factura mensual actual. El rango exacto depende del detalle de tu tarifa — lo confirmamos en la llamada de consulta.`
        : "Para traducir esto a pesos con precisión necesitamos tu tarifa real (varía según tu factura) — te la pedimos en la llamada de consulta, sin costo.";
    }
    if (notaGeneracion) {
      notaGeneracion.textContent = r.notaGeneracion ?? "";
      notaGeneracion.hidden = !r.notaGeneracion;
    }
    if (palancasEl) {
      palancasEl.innerHTML = "";
      r.palancas.forEach((p, i) => {
        const li = document.createElement("li");
        li.className = "flex gap-3";
        li.innerHTML = `<span class="font-mono text-sm text-primary">0${i + 1}</span><span>${p}</span>`;
        palancasEl.appendChild(li);
      });
    }

    form!.hidden = true;
    resultado!.hidden = false;
    resultado!.scrollIntoView({ behavior: "smooth", block: "start" });

    track("diagnostico_completado", { sector: respuestas.sector });
  }

  showStep(current);
  track("diagnostico_pregunta", { pregunta: 1 });

  const contactoForm = document.querySelector<HTMLFormElement>("[data-contacto-form]");
  const contactoStatus = contactoForm?.querySelector<HTMLElement>("[data-contacto-status]");
  const contactoSubmit = contactoForm?.querySelector<HTMLButtonElement>("[data-contacto-submit]");

  contactoForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!respuestasActuales || !contactoForm) return;

    const data = new FormData(contactoForm);
    const contacto = {
      nombre: String(data.get("nombre") ?? ""),
      email: String(data.get("email") ?? ""),
      telefono: data.get("telefono") ? String(data.get("telefono")) : undefined,
    };

    if (!contacto.nombre.trim() || !contacto.email.includes("@")) {
      contactoForm.querySelectorAll<HTMLInputElement>("input").forEach((el) => el.reportValidity());
      return;
    }

    if (contactoSubmit) {
      contactoSubmit.disabled = true;
      contactoSubmit.textContent = "Enviando…";
    }
    if (contactoStatus) contactoStatus.textContent = "";

    try {
      const res = await fetch("/api/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respuestas: respuestasActuales, contacto }),
      });
      if (!res.ok) throw new Error("request failed");
      if (contactoStatus) {
        contactoStatus.textContent = "Listo — te vamos a contactar en breve.";
      }
      contactoForm.reset();
      if (contactoSubmit) contactoSubmit.textContent = "Enviado";
      track("diagnostico_contacto_enviado");
    } catch {
      if (contactoStatus) {
        contactoStatus.textContent =
          "No pudimos enviar tus datos. Intentá de nuevo o escribinos directamente.";
      }
      if (contactoSubmit) {
        contactoSubmit.disabled = false;
        contactoSubmit.textContent = "Enviar y agendar";
      }
    }
  });
}
