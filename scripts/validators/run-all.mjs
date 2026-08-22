/**
 * Orquestador de `npm run check`. Sustituye a la cadena de comandos que antes
 * enumeraba a mano cada archivo en package.json: descubre los módulos y los
 * validadores recorriendo `scripts/`, de modo que un archivo nuevo queda
 * cubierto sin tocar nada, y ejecuta ambas fases en paralelo.
 *
 * Fase 1: `node --check` sobre todos los `.mjs` (comprobación de sintaxis).
 * Fase 2: cada `validate-*.mjs` en su propio proceso, como antes; siguen siendo
 * ejecutables sueltos (`node scripts/validators/validate-datos.mjs`).
 *
 * La salida se agrupa por archivo y se imprime en orden alfabético para que dos
 * ejecuciones seguidas produzcan el mismo texto pese al paralelismo.
 */
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPTS = join(ROOT, "scripts");
// Los validadores cargan varios megabytes de JSON cada uno, así que se limitan
// más que las comprobaciones de sintaxis, que apenas consumen memoria.
const SYNTAX_CONCURRENCY = Math.max(2, availableParallelism());
const VALIDATOR_CONCURRENCY = Math.max(2, Math.min(4, availableParallelism()));

/** Devuelve todos los `.mjs` bajo `directory`, en orden alfabético estable. */
async function collectModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectModules(full));
    else if (entry.name.endsWith(".mjs")) files.push(full);
  }
  return files;
}

/** Ejecuta node con los argumentos dados y captura su salida completa. */
function run(args) {
  return new Promise(resolvePromise => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", error => resolvePromise({ code: 1, output: `${output}${error.message}\n` }));
    child.on("close", code => resolvePromise({ code, output }));
  });
}

/** Recorre `tasks` con un número acotado de procesos simultáneos. */
async function runPool(tasks, limit, worker) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await worker(tasks[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const modules = await collectModules(SCRIPTS);
const validators = modules.filter(file => /[\\/]validators[\\/]validate-[^\\/]+\.mjs$/.test(file));

const syntax = await runPool(modules, SYNTAX_CONCURRENCY, file => run(["--check", file]));
const syntaxFailures = modules.filter((file, index) => syntax[index].code !== 0);
if (syntaxFailures.length) {
  for (const [index, file] of modules.entries()) {
    if (syntax[index].code !== 0) console.error(`✗ ${relative(ROOT, file)}\n${syntax[index].output}`);
  }
  console.error(`Syntax check failed for ${syntaxFailures.length} file(s).`);
  process.exit(1);
}
console.log(`Syntax check passed for ${modules.length} modules.`);

const results = await runPool(validators, VALIDATOR_CONCURRENCY, file => run([file]));
let failed = 0;
for (const [index, file] of validators.entries()) {
  const { code, output } = results[index];
  if (code === 0) process.stdout.write(output);
  else {
    failed++;
    console.error(`✗ ${relative(ROOT, file)}\n${output}`);
  }
}
if (failed) {
  console.error(`${failed} of ${validators.length} validators failed.`);
  process.exit(1);
}
console.log(`All ${validators.length} validators passed.`);
