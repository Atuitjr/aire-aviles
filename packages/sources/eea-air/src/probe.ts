/**
 * Exploración de la API de la EEA para Asturias:
 *   1. Qué "ciudades" de España conoce la EEA (buscamos Avilés, Gijón, Oviedo...).
 *   2. Qué ficheros Parquet hay para Avilés con datos sin verificar (UTD) de los últimos días.
 *   3. Columnas de esos ficheros y lo reciente que es el último dato de cada uno.
 *
 *   npm run probe -w @aviles/source-eea-air
 *   npm run probe -w @aviles/source-eea-air -- Gijón      ← para probar otra ciudad
 */
import { Dataset, listCities, parquetUrls, readParquet } from "./api.ts";

const wanted = process.argv[2] ?? "Avil";
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const ASTURIAS = ["avil", "gijon", "oviedo", "langreo", "mieres", "siero", "castrillon", "carreno", "corvera"];

// 1. Ciudades
console.log("\n### 1. Ciudades de España en la EEA");
let cityName: string | null = null;
try {
  const cities = await listCities(["ES"]);
  console.log(`Total: ${cities.length}. Ejemplo de registro:`, JSON.stringify(cities[0]));
  const names = cities.map((c) =>
    typeof c === "string" ? c : String((c as Record<string, unknown>).cityName ?? JSON.stringify(c)),
  );
  const asturias = names.filter((n) => ASTURIAS.some((a) => norm(n).includes(a)));
  console.log("Asturias:", asturias.length ? asturias.join(" · ") : "(ninguna encontrada)");
  cityName = names.find((n) => norm(n).includes(norm(wanted))) ?? null;
  console.log(`Ciudad elegida para la prueba: ${cityName ?? "(no encontrada)"}`);
} catch (err) {
  console.error("Error en /City:", (err as Error).message);
}

if (!cityName) {
  console.log("\nSin ciudad no se puede seguir. Pásame esta salida.");
  process.exit(0);
}

// 2. URLs de ficheros UTD de los últimos 3 días
console.log(`\n### 2. Ficheros UTD de ${cityName}`);
const end = new Date();
const start = new Date(end.getTime() - 3 * 24 * 3600_000);
let urls: string[] = [];
try {
  urls = await parquetUrls({
    countries: ["ES"],
    cities: [cityName],
    dataset: Dataset.UpToDate,
    dateTimeStart: start.toISOString().slice(0, 19) + "Z",
    dateTimeEnd: end.toISOString().slice(0, 19) + "Z",
    aggregationType: "hour",
  });
  console.log(`${urls.length} ficheros`);
  for (const u of urls.slice(0, 5)) console.log("  ", u);
  if (urls.length > 5) console.log(`   … y ${urls.length - 5} más`);
} catch (err) {
  console.error("Error en /ParquetFile/urls:", (err as Error).message);
}

// 3. Contenido de los ficheros
if (urls.length) {
  console.log("\n### 3. Contenido");
  let shownSample = false;
  for (const url of urls.slice(0, 40)) {
    const file = url.split("/").pop();
    try {
      const rows = await readParquet(url);
      if (!shownSample && rows.length) {
        shownSample = true;
        console.log("Columnas:", Object.keys(rows[0]).join(", "));
        console.log("Últimas 2 filas (crudas):");
        console.dir(rows.slice(-2), { depth: null });
        console.log("");
      }
      const last = rows.at(-1) ?? {};
      console.log(
        `${file} · ${rows.length} filas · último: Start=${String(last.Start)} Value=${String(last.Value)} ` +
          `Unit=${String(last.Unit)} Pollutant=${String(last.Pollutant)} Validity=${String(last.Validity)}`,
      );
    } catch (err) {
      console.error(`${file}: ${(err as Error).message}`);
    }
  }
}

console.log(`\nHora actual (UTC): ${new Date().toISOString()}`);
