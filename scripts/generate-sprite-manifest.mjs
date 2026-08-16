import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const assetsRoot = path.join(projectRoot, "assets");
const generatedDirectory = path.join(projectRoot, "src", "generated");
const manifestFile = path.join(generatedDirectory, "SpriteFrameManifest.ts");

/**
 * A clip is one folder whose directly contained PNG/SVG files follow the
 * authoring convention `<name><number>.<png|svg>`. Nested clip folders are
 * collected independently.
 */
const framePattern = /^(?<prefix>.+?)(?<index>\d+)\.(?<extension>png|svg)$/;
const imagePattern = /\.(png|svg)$/;

/** @typedef {{ relativeDirectory: string, prefix: string, extension: string, frames: { path: string, index: number }[] }} Clip */

/** @type {Clip[]} */
const clips = [];

/**
 * Scan every directory below assets. A directory is ignored unless at least
 * one directly contained image uses the numeric frame suffix convention.
 *
 * @param {string} directory
 * @returns {Promise<void>}
 */
async function scanDirectory(directory) {
    let entries;

    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        // A project without an assets directory is still a valid project. It
        // simply has an empty manifest. Re-throw all other read errors.
        if (error && typeof error === "object" && error.code === "ENOENT" && directory === assetsRoot) {
            return;
        }
        throw error;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    const imageFiles = entries.filter(entry =>
        entry.isFile() && imagePattern.test(entry.name)
    );
    const frameFiles = imageFiles
        .map(entry => ({ entry, match: entry.name.match(framePattern) }))
        .filter(candidate => candidate.match !== null);

    if (frameFiles.length > 0) {
        const relativeDirectory = toAssetRelativeDirectory(directory);
        const nonFrameImages = imageFiles.filter(entry => !framePattern.test(entry.name));

        if (nonFrameImages.length > 0) {
            fail(
                relativeDirectory,
                `contains numeric frame files and static image file(s): ${formatNames(nonFrameImages.map(entry => entry.name))}. ` +
                "An animation folder may contain only <name><number>.png or <name><number>.svg frame files."
            );
        }

        const first = frameFiles[0].match.groups;
        if (!first) {
            throw new Error("Internal sprite manifest error: matched frame has no capture groups");
        }

        const prefix = first.prefix;
        const extension = first.extension;
        const mismatchedNames = frameFiles
            .filter(candidate => {
                const groups = candidate.match.groups;
                return !groups || groups.prefix !== prefix || groups.extension !== extension;
            })
            .map(candidate => candidate.entry.name);

        if (mismatchedNames.length > 0) {
            fail(
                relativeDirectory,
                `uses mixed frame names or formats. Expected ${prefix}<number>.${extension}; found ${formatNames(mismatchedNames)}.`
            );
        }

        const frames = frameFiles
            .map(candidate => {
                const groups = candidate.match.groups;
                if (!groups) {
                    throw new Error("Internal sprite manifest error: matched frame has no capture groups");
                }
                return {
                    path: toSpritePath(path.join(directory, candidate.entry.name)),
                    index: Number.parseInt(groups.index, 10)
                };
            })
            .sort((left, right) => left.index - right.index || left.path.localeCompare(right.path));

        for (let index = 1; index < frames.length; index += 1) {
            if (frames[index - 1].index === frames[index].index) {
                fail(
                    relativeDirectory,
                    `has duplicate frame number ${frames[index].index} (${frames[index - 1].path} and ${frames[index].path}).`
                );
            }
        }

        clips.push({ relativeDirectory, prefix, extension, frames });
    }

    for (const entry of entries) {
        if (entry.isDirectory()) {
            await scanDirectory(path.join(directory, entry.name));
        }
    }
}

/** @param {string} directory */
function toAssetRelativeDirectory(directory) {
    const relative = path.relative(assetsRoot, directory);
    return relative.split(path.sep).join("/");
}

/** @param {string} file */
function toSpritePath(file) {
    const relative = path.relative(assetsRoot, file).split(path.sep).join("/");
    return `/assets/${relative}`;
}

/** @param {string[]} names */
function formatNames(names) {
    return names.map(name => `"${name}"`).join(", ");
}

/** @param {string} relativeDirectory @param {string} reason */
function fail(relativeDirectory, reason) {
    throw new Error(
        `[sprite-manifest] Invalid animation folder "assets/${relativeDirectory}": ${reason}`
    );
}

function quote(value) {
    return JSON.stringify(value);
}

function renderManifest() {
    const orderedClips = [...clips].sort((left, right) =>
        left.relativeDirectory.localeCompare(right.relativeDirectory)
    );

    const entries = orderedClips.map(clip => {
        const frameLines = clip.frames
            .map(frame => `            ${quote(frame.path)},`)
            .join("\n");

        return [
            `    ${quote(clip.relativeDirectory)}: {`,
            `        id: ${quote(clip.relativeDirectory)},`,
            "        frames: [",
            frameLines,
            "        ]",
            "    }"
        ].join("\n");
    });

    const body = entries.length === 0
        ? "{}"
        : `{\n${entries.join(",\n")}\n}`;

    return `// This file is generated by scripts/generate-sprite-manifest.mjs. Do not edit manually.\n` +
        `import type { SpriteFrames } from "../SpriteFrames.js";\n\n` +
        `export type SpriteFrameManifest = Readonly<Record<string, SpriteFrames>>;\n\n` +
        `export const spriteFrameManifest = ${body} as const satisfies SpriteFrameManifest;\n\n` +
        `export type SpriteFrameId = keyof typeof spriteFrameManifest;\n\n` +
        `export const SPRITE_FRAME_IDS = Object.freeze(\n` +
        `    Object.keys(spriteFrameManifest)\n` +
        `) as readonly SpriteFrameId[];\n\n` +
        `/** Return a generated clip or explain which asset-folder id is missing. */\n` +
        `export function getSpriteFrames(id: string): SpriteFrames {\n` +
        `    const frames = (spriteFrameManifest as Readonly<Record<string, SpriteFrames | undefined>>)[id];\n` +
        `    if (frames) {\n` +
        `        return frames;\n` +
        `    }\n\n` +
        `    const knownIds = SPRITE_FRAME_IDS.length > 0\n` +
        `        ? \` Available clips: \${SPRITE_FRAME_IDS.join(", ")}.\`\n` +
        `        : \" The generated manifest is empty.\";\n` +
        `    throw new Error(\`[sprite-manifest] Unknown SpriteFrames id "\${id}".\${knownIds}\`);\n` +
        `}\n`;
}

await scanDirectory(assetsRoot);
await mkdir(generatedDirectory, { recursive: true });
await writeFile(manifestFile, renderManifest(), "utf8");
