import { debug, info, warn, error } from "./debug.js";

const MODULE = "SaveLoad";
const SAVE_KEY = "jsrpg_save";

function saveGameState(state) {
    debug(MODULE, "Saving game state...", {
        map: state?.mapName,
        playerPos: state?.player ? `(${state.player.x}, ${state.player.y})` : "n/a",
        health: state?.health,
        inventoryCount: state?.inventory?.length ?? 0,
        mapChanges: state?.mapChanges?.length ?? 0
    });

    try {
        const serialized = JSON.stringify(state);
        localStorage.setItem(SAVE_KEY, serialized);
        debug(MODULE, `Game saved successfully (${serialized.length} bytes)`);
    } catch (err) {
        error(MODULE, "Unable to save game state:", err);
    }
}

function loadGameState() {
    debug(MODULE, "Attempting to load game state from localStorage...");

    try {
        const raw = localStorage.getItem(SAVE_KEY);

        if (!raw) {
            info(MODULE, "No save data found — starting fresh");
            return null;
        }

        const state = JSON.parse(raw);
        info(MODULE, "Save data found and parsed:", {
            map: state?.mapName,
            playerPos: state?.player ? `(${state.player.x}, ${state.player.y})` : "n/a",
            health: state?.health,
            inventoryCount: state?.inventory?.length ?? 0,
            mapChanges: state?.mapChanges?.length ?? 0
        });
        return state;
    } catch (err) {
        error(MODULE, "Unable to load game state (corrupted save?):", err);
        warn(MODULE, "Clearing corrupted save data");
        clearGameState();
        return null;
    }
}

function clearGameState() {
    info(MODULE, "Clearing saved game state from localStorage");
    localStorage.removeItem(SAVE_KEY);
}

export { saveGameState, loadGameState, clearGameState };
