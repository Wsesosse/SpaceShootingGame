import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const release = join(root, "release");

rmSync(release, { recursive: true, force: true });
mkdirSync(release, { recursive: true });

for (const entry of ["index.html", "dist", "assets"]) {
    cpSync(join(root, entry), join(release, entry), { recursive: true });
}

console.log("Prepared Netlify release folder.");
