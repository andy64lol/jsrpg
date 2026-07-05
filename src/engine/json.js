import { debug, warn } from "./debug.js";

const MODULE = "JSON";

/**
 * Flexible JSON parser that handles JSONC, JSON5, and plain JSON.
 * Strips single-line comments (//), block comments (/* ... * /), and trailing commas.
 * @param {string} text
 * @returns {object}
 */
export function parseFlexJSON(text) {
    debug(MODULE, "Parsing flex JSON (jsonc / json5 / json)...");
    const cleaned = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n\r]*/g, "")
        .replace(/,(\s*[\]}])/g, "$1");
    return JSON.parse(cleaned);
}

/**
 * Fetch a JSON-like file by trying multiple extensions in parallel.
 * Tries: .jsonc, .json5, .json
 * Returns the text of the first successful response.
 * @param {string} url - Base URL without extension, e.g. "maps/map1/definitions"
 * @returns {Promise<string>}
 */
export async function fetchFlexJSON(url) {
    const extensions = ["jsonc", "json5", "json"];
    const responses = await Promise.allSettled(
        extensions.map(ext => fetch(`${url}.${ext}`))
    );

    for (let i = 0; i < responses.length; i++) {
        const r = responses[i];
        if (r.status === "fulfilled" && r.value.ok) {
            debug(MODULE, `fetchFlexJSON: resolved "${url}.${extensions[i]}"`);
            return r.value.text();
        }
    }

    const tried = extensions.map(e => `${url}.${e}`).join(", ");
    warn(MODULE, `fetchFlexJSON: no file found — tried: ${tried}`);
    throw new Error(`No JSON file found at "${url}" (tried extensions: ${extensions.join(", ")})`);
}
