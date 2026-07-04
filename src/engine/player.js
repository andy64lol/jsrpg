import { debug, warn } from "./debug.js";

const MODULE = "Player";

export default class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.facing = "right";
        this.lastTilePosition = null;
        debug(MODULE, `Player created at tile (${x}, ${y})`);
    }

    move(dx, dy, logic, definitions) {
        const nx = this.x + dx;
        const ny = this.y + dy;

        debug(MODULE, `Intentando move desde (${this.x}, ${this.y}) a (${nx}, ${ny}) [dx=${dx}, dy=${dy}]`);

        if (!logic[ny] || logic[ny][nx] === undefined) {
            debug(MODULE, `Move blocked: out-of-bounds at (${nx}, ${ny})`);
            return;
        }
        
        if (dx < 0) {this.facing = "left";}
        if (dx > 0) {this.facing = "right";}
        debug(MODULE, `Facing: "${this.facing}" (dx=${dx}, dy=${dy})`);

        const id = logic[ny][nx];
        const def = definitions.collisions[id];

        if (!def) {
            warn(MODULE, `No collision definition found for tile id ${id} at (${nx}, ${ny}) — treating as solido`);
            return;
        }

        debug(MODULE, `Tile at (${nx}, ${ny}): id=${id}, type="${def.type}"${def.solid ? ", solid=true" : ""}`);

        if (def.type === "solid" || def.solid === true) {
            debug(MODULE, `Move blocked: tile (${nx}, ${ny}) is solid`);
            return;
        }

        this.x = nx;
        this.y = ny;
        debug(MODULE, `Move accepted → player now at (${this.x}, ${this.y})`);

        if (def.type === "door") {
            debug(MODULE, `Door tile stepped on — warping to map "${def.target_map}" at (${def.target_tile.x - 1}, ${def.target_tile.y - 1})`);
            return {
                type: "warp",
                toMap: def.target_map,
                toX: def.target_tile.x - 1,
                toY: def.target_tile.y - 1
            };
        }
    }
}
