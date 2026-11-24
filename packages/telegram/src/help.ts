import { EAQI } from "@aviles/core";
import { esc } from "./format.ts";

/**
 * Textos de /ayuda. Cada sección es un mensaje corto; el bot navega entre ellas con botones.
 * Los umbrales se generan desde EAQI para que nunca se desincronicen con lo que usa el bot.
 */
export const HELP_SECTIONS = {
  inicio: "📖 Inicio",
  niveles: "🎨 Niveles",
  contaminantes: "🧪 Contaminantes",
  umbrales: "📏 Umbrales",
  avisos: "🔔 Avisos y datos",
} as const;
export type HelpSection = keyof typeof HELP_SECTIONS;

function intro(): string {
  return [
    "📖 <b>Ayuda</b>",
    "",
    "Este bot vigila la calidad del aire en las estaciones de la red del Principado de Asturias y te avisa cuando empeora.",
    "",
    "Cada estación tiene un <b>nivel</b> del índice europeo de calidad del aire, de 🔵 <i>Buena</i> a 🟣 <i>Extremadamente desfavorable</i>. " +
      "El nivel lo marca el contaminante que peor está en ese momento.",
    "",
    "<b>Comandos</b>",
    "/ahora · cómo está el aire (pulsa 🔎 para ver el detalle de una estación)",
    "/suscribir · elegir zonas o estaciones para recibir avisos",
    "/mis · ver tus avisos",
    "/baja · dejar de recibir avisos",
    "",
    "Elige un tema 👇",
  ].join("\n");
}

function levels(): string {
  const lines = EAQI.levels.map((lv, i) => {
    const sensitive = lv.adviceSensitive === lv.advice ? "" : `\n    <i>Sensibles:</i> ${esc(lv.adviceSensitive)}`;
    const alert = i === EAQI.alertFrom ? " 🔔" : "";
    return `${lv.icon} <b>${esc(lv.label)}</b>${alert}\n    ${esc(lv.advice)}${sensitive}`;
  });
  return [
    "🎨 <b>Niveles del índice europeo</b>",
    "",
    ...lines,
    "",
    "🔔 = a partir de este nivel el bot envía avisos.",
    "<i>Población sensible: personas con problemas respiratorios o cardiacos, niños, mayores y embarazadas.</i>",
  ].join("\n");
}

function pollutants(): string {
  return [
    "🧪 <b>Contaminantes</b>",
    "",
    "<b>En el índice europeo:</b>",
    "",
    "• <b>PM10</b> · partículas de menos de 10 micras. Polvo, tráfico, obras, industria y, a veces, polvo del Sáhara. Irritan las vías respiratorias.",
    "• <b>PM2.5</b> · partículas finas, de menos de 2,5 micras. Vienen sobre todo de combustiones (tráfico, calefacciones, industria). Llegan más adentro de los pulmones que las PM10, por eso tienen umbrales más bajos.",
    "• <b>NO₂</b> · dióxido de nitrógeno. Sale sobre todo del tráfico (especialmente diésel) y de combustiones. Irrita los bronquios.",
    "• <b>O₃</b> · ozono. No lo emite nadie directamente: se forma con el sol a partir de otros contaminantes. Sube en días soleados, por la tarde y en verano, y a menudo es más alto fuera de las ciudades.",
    "• <b>SO₂</b> · dióxido de azufre. Procede de quemar combustibles con azufre: industria pesada y barcos. Irrita ojos y vías respiratorias.",
    "",
    "<b>Medidos pero fuera del índice</b> (▫️ en el detalle):",
    "",
    "• <b>CO</b> · monóxido de carbono, de combustiones incompletas.",
    "• <b>Benceno</b> · de combustibles e industria. Se vigila su media anual, no los valores horarios.",
    "• <b>NO</b> y <b>NOx</b> · monóxido de nitrógeno y suma de óxidos de nitrógeno. El NO se transforma en NO₂ en el aire.",
  ].join("\n");
}

function thresholds(): string {
  const order = ["PM2.5", "PM10", "NO2", "O3", "SO2"];
  const blocks = order.map((metric) => {
    const bands = EAQI.bands[metric];
    const ranges = EAQI.levels.map((lv, i) => {
      const from = i === 0 ? 0 : bands[i - 1] + 1;
      const range = i < bands.length ? `${from}–${bands[i]}` : `más de ${bands[bands.length - 1]}`;
      return `${lv.icon} ${range}`;
    });
    const pretty: Record<string, string> = { NO2: "NO₂", O3: "O₃", SO2: "SO₂" };
    return `<b>${esc(pretty[metric] ?? metric)}</b>\n${ranges.join("  ")}`;
  });
  return [
    "📏 <b>Umbrales</b> (µg/m³, media horaria)",
    "",
    blocks.join("\n\n"),
    "",
    "<i>Bandas del índice europeo de calidad del aire de la Agencia Europea de Medio Ambiente, basadas en las guías de la OMS de 2021.</i>",
  ].join("\n");
}

function alertsAndData(): string {
  return [
    "🔔 <b>Cuándo avisa el bot</b>",
    "",
    `• <b>Inicio</b>: cuando una estación llega a ${EAQI.levels[EAQI.alertFrom].icon} <i>${esc(EAQI.levels[EAQI.alertFrom].label)}</i> o peor.`,
    "• <b>Empeora</b>: si durante el episodio sube a un nivel peor que el ya avisado.",
    "• <b>Fin</b>: cuando pasa 2 horas seguidas por debajo de ese nivel.",
    "• Si un valor sube y baja alrededor del umbral, no recibirás un aviso cada hora.",
    "",
    "📡 <b>De dónde salen los datos</b>",
    "",
    "• Estaciones de la Red de Control de la Calidad del Aire del Principado de Asturias.",
    "• Los obtenemos de la Agencia Europea de Medio Ambiente, que los publica casi en tiempo real.",
    "• Llegan con <b>unas 3–5 horas de retraso</b> y son <b>provisionales</b>: el organismo puede corregirlos después de validarlos.",
    "• Las horas se muestran en hora peninsular española.",
    "",
    "<i>Este bot es un proyecto independiente y no es un servicio oficial. Ante un episodio grave, sigue las indicaciones de las autoridades sanitarias.</i>",
  ].join("\n");
}

export function helpText(section: HelpSection): string {
  switch (section) {
    case "niveles":
      return levels();
    case "contaminantes":
      return pollutants();
    case "umbrales":
      return thresholds();
    case "avisos":
      return alertsAndData();
    default:
      return intro();
  }
}
