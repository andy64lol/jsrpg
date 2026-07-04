import { debug, info, warn, error } from "./debug.js";

const MODULE = "Map";

function parseCSV(text) {
    debug(MODULE, "Parsing CSV data...");
    const rows = text
        .trim()
        .split("\n")
        .map(row => row.trim())
        .filter(Boolean)
        .map(row => row.split(",").map(value => Number(value.trim())));
    debug(MODULE, `CSV parsed: ${rows.length} rows x ${rows[0]?.length ?? 0} cols`);
    return rows;
}

function parseJSONC(text) {
    debug(MODULE, "Parsing JSONC (stripping comments)...");
    return JSON.parse(text.replace(/\/\/.*$/gm, ""));
}

async function load(mapName) {
    info(MODULE, `Loading map: "${mapName}"`);
    const base = `maps/${mapName}/`;

    debug(MODULE, `Fetching map files from: ${base}`);

    let mapCSVText, logicCSVText, defJSONCText;
    try {
        const [mapRes, logicRes, defRes] = await Promise.all([
            fetch(base + "map.csv"),
            fetch(base + "collisions.csv"),
            fetch(base + "definitions.jsonc")
        ]);

        debug(MODULE, `map.csv        → HTTP ${mapRes.status} ${mapRes.url}`);
        debug(MODULE, `collisions.csv → HTTP ${logicRes.status} ${logicRes.url}`);
        debug(MODULE, `definitions.jsonc → HTTP ${defRes.status} ${defRes.url}`);

        if (!mapRes.ok) {throw new Error(`Failed to fetch map.csv for "${mapName}" (status ${mapRes.status})`);}
        if (!logicRes.ok) {throw new Error(`Failed to fetch collisions.csv for "${mapName}" (status ${logicRes.status})`);}
        if (!defRes.ok) {throw new Error(`Failed to fetch definitions.jsonc for "${mapName}" (status ${defRes.status})`);}

        [mapCSVText, logicCSVText, defJSONCText] = await Promise.all([
            mapRes.text(),
            logicRes.text(),
            defRes.text()
        ]);
    } catch (err) {
        error(MODULE, `Error loading map files for "${mapName}":`, err);
        throw err;
    }

    debug(MODULE, "Parsing map layers...");
    const map = parseCSV(mapCSVText);
    const logic = parseCSV(logicCSVText);
    const definitions = parseJSONC(defJSONCText);

    debug(MODULE, `Map size: ${map[0]?.length ?? 0}w x ${map.length}h tiles`);
    debug(MODULE, `Tile definitions:`, Object.keys(definitions.tiles ?? {}));
    debug(MODULE, `Collision definitions:`, Object.keys(definitions.collisions ?? {}));

    debug(MODULE, "Validating map structure...");
    validateMapStructure(map, logic);

    debug(MODULE, "Validating map logic against definitions...");
    validateMapLogic(logic, definitions);

    const spawn = findSpawn(logic, definitions);
    if (spawn) {
        debug(MODULE, `Player spawn found at tile (${spawn.x}, ${spawn.y})`);
    } else {
        warn(MODULE, `No player_spawn tile found in map "${mapName}"`);
    }

    const result = {
        name: mapName,
        map,
        logic,
        definitions,
        spawn,
        width: map[0].length,
        height: map.length
    };

    info(MODULE, `Map "${mapName}" loaded successfully (${result.width}x${result.height})`);
    return result;
}

function validateMapStructure(map, logic) {
    debug(MODULE, "Checking row counts match between map and logic layers...");
    if (map.length !== logic.length) {
        throw new Error(`Map and collisions layer must have the same number of rows (map: ${map.length}, logic: ${logic.length}).`);
    }

    const width = map[0].length;
    debug(MODULE, `Expected row width: ${width}`);

    for (let y = 0; y < map.length; y++) {
        if (map[y].length !== width || logic[y].length !== width) {
            throw new Error(`Row ${y} has inconsistent width: map=${map[y].length}, logic=${logic[y].length}, expected=${width}.`);
        }
    }

    debug(MODULE, "Map structure validation passed.");
}

function validateMapLogic(logic, definitions) {
    let spawnCount = 0;
    const undefinedIds = new Set();

    for (let y = 0; y < logic.length; y++) {
        for (let x = 0; x < logic[y].length; x++) {
            const id = logic[y][x];
            const def = definitions.collisions[id];

            if (!def) {
                undefinedIds.add(id);
                throw new Error(`Missing collision definition for id ${id} at tile (${x}, ${y}).`);
            }

            if (def.type === "player_spawn") {
                spawnCount++;
                debug(MODULE, `Found player_spawn (count: ${spawnCount}) at (${x}, ${y})`);
            }
        }
    }

    if (undefinedIds.size > 0) {
        warn(MODULE, `Undefined collision IDs found: ${[...undefinedIds].join(", ")}`);
    }

    if (spawnCount > 1) {
        throw new Error(`Map must have at most 1 player_spawn, found ${spawnCount}.`);
    }

    debug(MODULE, `Logic validation passed. Spawn tiles: ${spawnCount}`);
}

function findSpawn(logic, definitions) {
    debug(MODULE, "Scanning for player_spawn tile...");
    for (let y = 0; y < logic.length; y++) {
        for (let x = 0; x < logic[y].length; x++) {
            const id = logic[y][x];
            const def = definitions.collisions[id];

            if (def && def.type === "player_spawn") {
                return { x, y };
            }
        }
    }

    return null;
}

export { load };
