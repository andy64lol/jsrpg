export default class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.facing = "right";
    }

    move(dx, dy, logic, definitions) {
        const nx = this.x + dx;
        const ny = this.y + dy;

        if (!logic[ny] || logic[ny][nx] === undefined) {
            return;
        }

        if (dx < 0) this.facing = "left";
        if (dx > 0) this.facing = "right";

        const id = logic[ny][nx];
        const def = definitions.collisions[id];

        if (def.type === "solid") {
            return;
        }

        this.x = nx;
        this.y = ny;

        if (def.type === "door") {
            return {
                type: "warp",
                toMap: def.target_map,
                toX: def.target_tile.x - 1,
                toY: def.target_tile.y - 1
            };
        }
    }
}