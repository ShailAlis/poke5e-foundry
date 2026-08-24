import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [script, css, teamTemplate, teamTabIcon, manifestText, packageText] = await Promise.all([
  readFile(new URL("scripts/trainer/trainer-actor-sheet.mjs", root), "utf8"),
  readFile(new URL("styles/poke5e.css", root), "utf8"),
  readFile(new URL("templates/trainer-sheet-team.hbs", root), "utf8"),
  readFile(new URL("assets/icons/pokeball-tab.svg", root), "utf8"),
  readFile(new URL("module.json", root), "utf8"),
  readFile(new URL("package.json", root), "utf8")
]);
const manifest = JSON.parse(manifestText);
const packageJson = JSON.parse(packageText);

assert.match(script, /static PARTS\s*=\s*\{\s*\.\.\.super\.PARTS,/s,
  "The Trainer sheet must retain every native dnd5e part");
assert.match(script, /pokemonTeam:\s*\{\s*container:\s*\{\s*classes:\s*\["tab-body"\],\s*id:\s*"tabs"\s*\},\s*template:\s*`\$\{MODULE_PATH\}\/templates\/trainer-sheet-team\.hbs`,\s*scrollable:\s*\[""\]\s*\}/s,
  "The Pokémon Team part must remain in the native tab-body container");
assert.match(script, /static TABS\s*=\s*\[\s*\.\.\.super\.TABS\.slice\(0, 1\),\s*\{\s*tab:\s*"pokemonTeam",\s*label:\s*"POKE5E\.Team\.WindowTitle",\s*svg:\s*`\$\{MODULE_PATH\}\/assets\/icons\/pokeball-tab\.svg`\s*\},\s*\.\.\.super\.TABS\.slice\(1\)\.filter\(\(\{ tab \}\) => !\["spells", "specialTraits"\]\.includes\(tab\)\)\s*\]/s,
  "The Trainer sheet must retain the native dnd5e tabs");
assert.match(script, /!\["spells", "specialTraits"\]\.includes\(tab\)/,
  "The Trainer sheet must omit unused Spells and Special Traits tabs");
assert.match(script, /tab:\s*"pokemonTeam"[^{}]+svg:\s*`\$\{MODULE_PATH\}\/assets\/icons\/pokeball-tab\.svg`/,
  "The Pokemon Team tab must use its dedicated Poke Ball SVG");
assert.match(teamTabIcon, /data-poke5e-tab-icon="pokeball"/,
  "The Pokemon Team tab icon must remain an identifiable Poke Ball asset");
assert.match(teamTabIcon, /<path d="M5 32h54"[^>]+stroke="#180204"[^>]+\/>[\s\S]*?<circle cx="32" cy="32" r="10"/,
  "The Pokemon Team tab icon needs a clear band and central button at small sizes");
assert.match(script, /position:\s*\{\s*width:\s*1000,\s*height:\s*800\s*\}/,
  "The Trainer sheet should open in a landscape Pokédex format");
assert.doesNotMatch(script, /pokedexChrome|static LIMITED_PARTS/,
  "Decorative parts must not participate in the ApplicationV2 sheet layout");

for (const action of [
  "browsePokemon", "capturePokemon", "deployPokemon", "openPokemon", "recallPokemon", "togglePokemonTeam",
  "healFaintedPokemon", "removeFaintedPokemon", "givePokechef", "guruSpirit", "chooseSpecialization",
  "usePokemonTracker", "addTrainerExperience", "advanceTrainerClass", "spendPathResource", "restorePathResource"
]) {
  assert.match(script, new RegExp(`${action}:\\s*Poke5eTrainerActorSheet\\.#${action}`),
    `Missing Trainer sheet action: ${action}`);
  assert.ok(teamTemplate.includes(`data-action="${action}"`), `The Team tab no longer exposes ${action}`);
}

for (const action of ["selectTypeMastery", "selectRangerCompanion", "selectAceTrainerAbility"]) {
  assert.ok(teamTemplate.includes(`data-action="${action}"`), `The Team tab no longer exposes ${action}`);
  assert.match(script, new RegExp(`querySelector\\(\[?['\"]\\[data-action=['\"]${action}['\"]\\]['\"]?\]?\\)`),
    `The Trainer sheet no longer binds ${action}`);
}

const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...cssWithoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(match => ({ selector: match[1].trim(), declarations: match[2] }))
  .filter(rule => !rule.selector.startsWith("@"));
const rulesEndingIn = ending => rules.filter(rule => rule.selector.split(",").some(selector => {
  selector = selector.trim();
  return /\.poke5e-trainer-sheet\b/i.test(selector) && ending.test(selector);
}));
const assertNoLayoutOverride = (label, ending, forbidden) => {
  const matches = rulesEndingIn(ending);
  assert.ok(matches.length, `Missing CSS rule for ${label}`);
  for (const { selector, declarations } of matches) {
    assert.doesNotMatch(declarations, forbidden, `${selector} must leave native layout geometry untouched`);
  }
};

const outerLayoutProperty = /(?:^|;)\s*(?:display|position|overflow(?:-[xy])?|(?:min-|max-)?(?:width|height)|grid(?:-[\w-]+)?|flex(?:-[\w-]+)?|contain|transform|inset|top|right|bottom|left|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|border(?:-(?:width|style))?)\s*:/i;
assertNoLayoutOverride("Trainer root", /\.poke5e-trainer-sheet$/i, outerLayoutProperty);
assertNoLayoutOverride("window-content", /\.window-content$/i,
  /(?:^|;)\s*(?:display|position|overflow(?:-[xy])?|(?:min-|max-)?(?:width|height)|grid(?:-[\w-]+)?|flex(?:-[\w-]+)?|contain|transform|inset|top|right|bottom|left|padding(?:-[\w-]+)?|border(?:-(?:width|style))?)\s*:/i);
assertNoLayoutOverride("sheet-body", /\.sheet-body$/i, outerLayoutProperty);
assertNoLayoutOverride("ability-scores", /\.ability-scores$/i,
  /(?:^|;)\s*(?:display|position|overflow(?:-[xy])?|(?:min-|max-)?(?:width|height)|grid(?:-[\w-]+)?|flex(?:-[\w-]+)?|contain|transform|inset|right|bottom|left|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|border(?:-(?:width|style))?)\s*:/i);
assertNoLayoutOverride("native tabs", /nav\.tabs$/i, outerLayoutProperty);

const innerLayoutProperty = /(?:^|;)\s*(?:display|position|z-index|overflow(?:-[xy])?|(?:max-)?(?:width|height)|grid(?:-[\w-]+)?|flex(?:-[\w-]+)?|contain|transform|inset|top|right|bottom|left|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|border(?:-(?:width|style))?)\s*:/i;
for (const target of [/\.sheet-body \.sidebar$/i, /\.sheet-body \.tab-body$/i]) {
  assertNoLayoutOverride("Trainer screen", target, innerLayoutProperty);
}

assert.doesNotMatch(cssWithoutComments, /\.poke5e-pokedex-(?:chrome|device-header|hinge|side-controls)/i,
  "Removed standalone chrome styles must not return to the native sheet flow");
assert.doesNotMatch(cssWithoutComments, /\.poke5e-trainer-sheet[^,{]*#(?:main|tabs)\b/i,
  "Trainer styling must use the native class hierarchy, not assumed part IDs");
assert.match(css, /\.poke5e-trainer-sheet\s*\{[^{}]*container-name:\s*poke5e-trainer;[^{}]*container-type:\s*inline-size;/s,
  "The Trainer sheet root must provide a safe named container for its landscape skin");
assert.match(css, /@container\s+poke5e-trainer\s*\(min-width:\s*1050px\)\s*\{[\s\S]*?--dnd5e-sheet-sidebar-width:\s*38cqw;/,
  "Wide Trainer sheets must balance both leaves through the native sidebar variable");
assert.match(css, /@container\s+poke5e-trainer\s*\(min-width:\s*900px\)\s+and\s+\(max-width:\s*1049px\)\s*\{[\s\S]*?--dnd5e-sheet-sidebar-width:\s*34cqw;/,
  "Saved medium-width Trainer sheets must retain a compact two-leaf layout");
assert.match(css, /\.poke5e-trainer-sheet\.sidebar-collapsed \.sheet-body \.main-content::before\s*\{\s*display:\s*none;/,
  "The decorative hinge must disappear with the collapsed sidebar");
assert.match(css, /\.sheet-header::before\s*\{[^{}]*width:\s*76px;[^{}]*height:\s*76px;/s,
  "The Trainer sheet needs the large blue Pokédex lens");
assert.match(css, /\.window-content\s*\{[^{}]*margin-block-start:\s*calc\(-1 \* var\(--header-height\)\);/s,
  "The native sheet must start below the clipped region while retaining its draggable header");
assert.match(css, /\.ability-scores\s*\{[^{}]*top:\s*35px;/s,
  "Ability score markers must follow the corrected sheet header offset");
assert.match(css, /\.window-header :is\(\.window-icon, \.window-title\)\s*\{[^{}]*visibility:\s*hidden;/s,
  "The Foundry title must be visually integrated into the Pokedex shell");
assert.match(css, /\.sheet-header > \.right \.boon-badge\s*\{[^{}]*display:\s*none;/s,
  "The unwanted epic boon badge must stay hidden");
assert.match(css, /\.sheet-header \.document-name\s*\{[^{}]*background:\s*linear-gradient[^{}]*box-shadow:/s,
  "The Trainer name must remain styled as a recessed device plate");
assert.match(css, /\.main-content::before\s*\{[^{}]*repeating-linear-gradient\(to bottom/s,
  "The two native panels require a visibly segmented hinge");
assert.match(css, /\.poke5e-sheet-team-tab\s*\{[^{}]*container-type:\s*inline-size/s,
  "The Team tab must respond to its own Foundry window width");
const narrowContainer = css.match(/@container\s*\(max-width:\s*620px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
for (const selector of [".poke5e-sheet-team-header", ".poke5e-sheet-team-actions", ".poke5e-sheet-slots", ".poke5e-held-item-panel"]) {
  assert.ok(narrowContainer.includes(selector), `The narrow Team layout no longer adapts ${selector}`);
}
assert.match(css, /body\.poke5e-dark-mode \.poke5e-trainer-sheet\s*\{[^{}]*--pk-device-screen:[^;]+;[^{}]*--pk-device-screen-blue:[^;]+;[^{}]*--pk-device-ink:[^;]+;/s,
  "Dark mode must provide matching screen and foreground colors for the Trainer sheet");
assert.match(css, /body\.poke5e-dark-mode \.poke5e-trainer-sheet\s*\{[^{}]*--color-text-title:\s*var\(--pk-device-ink\);/s,
  "Dark mode must keep native pill titles legible on the device screens");
assert.match(css, /body\.poke5e-dark-mode \.dnd5e2\.sheet\.actor\.character\.poke5e-trainer-sheet[^{}]+\.pokemon-controls button[^{}]*\{[^{}]*color:\s*#321400;[^{}]*background:\s*linear-gradient\(#ffd52d, #ee9600\);/s,
  "Dark mode must preserve contrast on amber Pokémon controls");
assert.match(css, /\.poke5e-sheet-reserve-grid \.reserve-controls button\[data-action="removeFaintedPokemon"\]\s*\{[^{}]*color:\s*#fff;[^{}]*background:\s*linear-gradient\(#cf333a, #741017\);/s,
  "The destructive reserve action must remain visually distinct from full recovery");
assert.equal(manifest.version, packageJson.version, "Manifest and package versions must match");
assert.ok(manifest.download.endsWith(`/v${manifest.version}/poke5e-foundry.zip`),
  "The module download URL must match the release version");

let obsoleteTemplateError;
try {
  await access(new URL("templates/trainer-sheet-pokedex-chrome.hbs", root));
} catch (error) {
  obsoleteTemplateError = error;
}
assert.equal(obsoleteTemplateError?.code, "ENOENT", "The obsolete standalone chrome template should remain removed");

console.log("Trainer sheet structure validation passed.");
