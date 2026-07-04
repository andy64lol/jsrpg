/**
 * Centralized debug logging for JSRPG.
 * Set window.__JSRPG_DEBUG = true in the browser console to enable verbose logs.
 * All debug() calls are silent in production unless the flag is set.
 */

const PREFIX = "[JSRPG]";

export function debug(module, ...args) {
    if (typeof window !== "undefined" && window.__JSRPG_DEBUG) {
        console.debug(`${PREFIX} [${module}]`, ...args);
    }
}

export function info(module, ...args) {
    console.info(`${PREFIX} [${module}]`, ...args);
}

export function warn(module, ...args) {
    console.warn(`${PREFIX} [${module}]`, ...args);
}

export function error(module, ...args) {
    console.error(`${PREFIX} [${module}]`, ...args);
}
