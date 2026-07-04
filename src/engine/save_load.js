const SAVE_KEY = "jsrpg_save";

function saveGameState(state) {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error("Unable to save game state:", error);
    }
}

function loadGameState() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error("Unable to load game state:", error);
        return null;
    }
}

function clearGameState() {
    localStorage.removeItem(SAVE_KEY);
}

export { saveGameState, loadGameState, clearGameState };
