import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [root = "out", prefix = ""] = process.argv.slice(2);
if (!prefix) process.exit(0);

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (/\.(?:html|js|css|json)$/.test(entry.name)) {
      const source = await readFile(file, "utf8");
      const updated = source
        .replaceAll('"/pet_images/', `"${prefix}/pet_images/`)
        .replaceAll('"/item_images/', `"${prefix}/item_images/`)
        .replaceAll("'/pet_images/", `'${prefix}/pet_images/`)
        .replaceAll("'/item_images/", `'${prefix}/item_images/`);
      if (updated !== source) await writeFile(file, updated);
    }
  }
}

await visit(root);
