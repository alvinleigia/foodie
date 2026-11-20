import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const nativeControls = new Set(["button", "input", "select", "textarea", "label"]);
const sharedControls = new Set(["Button", "ChoiceButton", "Input", "Textarea", "Label", "Checkbox", "Radio", "SelectTrigger", "NativeSelect", "Combobox", "FormField", "Dialog", "Sheet"]);

export function auditUiControls(root = process.cwd()) {
  const result = { files: 0, pages: 0, shared: {}, exceptions: [], violations: [] };
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const filename = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        scan(filename);
        continue;
      }
      if (!filename.endsWith(".tsx")) continue;
      result.files++;
      if (entry.name === "page.tsx") result.pages++;
      const path = relative(root, filename).replaceAll("\\", "/");
      const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          if (sharedControls.has(tag)) result.shared[tag] = (result.shared[tag] ?? 0) + 1;
          if (nativeControls.has(tag) && !path.startsWith("components/ui/")) {
            const attribute = (name) => node.attributes.properties.find((prop) => prop.name?.getText(source) === name);
            const isFilePicker = path === "components/staff/MenuManager.tsx" && tag === "input" && attribute("type")?.initializer?.text === "file" && attribute("className")?.initializer?.text === "hidden";
            const isNativeSelectPrimitive = path === "components/shared/NativeSelect.tsx" && tag === "select";
            const target = isFilePicker || isNativeSelectPrimitive ? result.exceptions : result.violations;
            target.push({ path, line, tag });
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(resolve(root, "app"));
  scan(resolve(root, "components"));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditUiControls();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result));
    process.exit(result.violations.length ? 1 : 0);
  }
  console.log(`Audited ${result.pages} pages and ${result.files} TSX files.`);
  console.log("Shared controls:", result.shared);
  console.log("Documented native exceptions:", result.exceptions);
  if (result.violations.length) console.error("One-off controls:", result.violations);
  process.exitCode = result.violations.length ? 1 : 0;
}
