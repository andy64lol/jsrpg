function parseCSV(text) {
    return text
        .trim()
        .split("\n")
        .map(row => row.trim())
        .filter(Boolean)
        .map(row => row.split(",").map(value => Number(value.trim())));
}

function parseJSONC(text) {
    return JSON.parse(text.replace(/\/\/.*$/gm, ""));
}

async function load(mapName) {
    const base = `maps/${mapName}/`;

    const [mapCSV, logicCSV, defJSONC] = await Promise.all([
        fetch(base + "map.csv").then(r => r.text()),
        fetch(base + "collisions.csv").then(r => r.text()),
        fetch(base + "definitions.jsonc").then(r => r.text())
    ]);

    const map = parseCSV(mapCSV);
    const logic = parseCSV(logicCSV);
    const definitions = parseJSONC(defJSONC);

    validateMapStructure(map, logic);
    validateMapLogic(logic, definitions);

    const spawn = findSpawn(logic, definitions);

    return {
        name: mapName,
        map,
        logic,
        definitions,
        spawn,
        width: map[0].length,
        height: map.length
    };
}

function validateMapStructure(map, logic) {
    if (map.length !== logic.length) {
        throw new Error("Map and collisions layer must have the same number of rows.");
    }

    const width = map[0].length;

    for (let y = 0; y < map.length; y++) {
        if (map[y].length !== width || logic[y].length !== width) {
            throw new Error("All map rows must have the same width.");
        }
    }
}

function validateMapLogic(logic, definitions) {
    let spawnCount = 0;

    for (let y = 0; y < logic.length; y++) {
        for (let x = 0; x < logic[y].length; x++) {
            const id = logic[y][x];
            const def = definitions.collisions[id];

            if (!def) {
                throw new Error(`Missing collision definition for id ${id} at ${x},${y}.`);
            }

            if (def.type === "player_spawn") {
                spawnCount++;
            }
        }
    }

    if (spawnCount > 1) {
        throw new Error(`Map must have at most 1 player_spawn, found ${spawnCount}.`);
    }
}

function findSpawn(logic, definitions) {
    for (let y = 0; y < logic.length; y++) {
        for (let x = 0; x < logic[y].length; x++) {
            const id = logic[y][x];
            const def = definitions.collisions[id];

            if (def.type === "player_spawn") {
                return { x, y };
            }
        }
    }

    return null;
}

export { load };