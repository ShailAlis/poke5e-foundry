import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIRECTORIES = [
  join(ROOT, "assets", "icons", "specializations"),
  join(ROOT, "assets", "icons", "trainer-paths")
];

function darken(hex, factor = 0.62) {
  const channels = hex.slice(1).match(/.{2}/g).map(value => Math.round(parseInt(value, 16) * factor));
  return `#${channels.map(value => value.toString(16).padStart(2, "0")).join("")}`;
}

function firstPass(source) {
  const title = source.match(/<title>.*?<\/title>/s)?.[0] ?? "";
  const body = source.match(/<svg[^>]*>(.*)<\/svg>/s)?.[1]?.replace(title, "") ?? "";
  const background = body.match(/<circle\s+cx="128"\s+cy="128"\s+r="118"\s+fill="(#[0-9a-f]{6})"[^>]*\/>/i);
  if (!background) throw new Error("No se encontró el fondo circular original.");
  const base = background[1].toLowerCase();
  const emblem = body.replace(background[0], "").replaceAll("#f7f3e8", base);
  return { title, base, emblem };
}

function existingPass(source) {
  const title = source.match(/<title>.*?<\/title>/s)?.[0] ?? "";
  const base = source.match(/data-role="ball-top"[^>]*fill="(#[0-9a-f]{6})"/i)?.[1]?.toLowerCase();
  const emblem = source.match(/<g data-poke5e-emblem="true"[^>]*>(.*)<\/g>\s*<circle data-role="ball-outline"/s)?.[1];
  if (!base || emblem == null) throw new Error("No se pudo leer el SVG mejorado.");
  return { title, base, emblem };
}

function improvedSvg({ title, base, emblem }) {
  const lower = darken(base);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" data-poke5e-ball-background="true">
  ${title}
  <circle data-role="ball-top" cx="128" cy="128" r="118" fill="${base}"/>
  <path data-role="ball-bottom" d="M10 128a118 118 0 0 0 236 0Z" fill="${lower}"/>
  <path data-role="ball-band" d="M12 128h232" stroke="#18212b" stroke-width="14"/>
  <circle data-role="ball-button" cx="128" cy="128" r="63" fill="#f7f3e8" stroke="#18212b" stroke-width="10"/>
  <g data-poke5e-emblem="true" transform="translate(48 48) scale(.625)">${emblem.trim()}</g>
  <circle data-role="ball-outline" cx="128" cy="128" r="118" fill="none" stroke="#18212b" stroke-width="12"/>
</svg>
`;
}

let updated = 0;
for (const directory of DIRECTORIES) {
  for (const filename of (await readdir(directory)).filter(name => name.endsWith(".svg")).sort()) {
    const path = join(directory, filename);
    const source = await readFile(path, "utf8");
    const parts = source.includes('data-poke5e-ball-background="true"') ? existingPass(source) : firstPass(source);
    await writeFile(path, improvedSvg(parts), "utf8");
    updated++;
  }
}
console.log(`Improved ${updated} Trainer specialization and path icons.`);
