import { debug, info, warn } from "./debug.js";

const MODULE = "Entity";
// tipos que una entidad puede pisar (igual que el jugador mas o menos)
const WALKABLE_TYPES = new Set(["air", "player_spawn"]);

export class Entity {
    constructor(instanceId, x, y, template, spawnDef) {
        this.instanceId = instanceId;
        this.type     = template.name ?? instanceId;
        this.sprite   = template.sprite ?? null;
        this.x = x;
        this.y = y;
        this.health    = Number(template.health   ?? 3);
        this.maxHealth = this.health;
        this.damage    = Number(template.damage   ?? 1);
        this.speed     = Number(template.speed    ?? 1);
        this.moveInterval  = 1 / Math.max(0.1, this.speed);
        this.behavior      = template.behavior    ?? "patrol";
        this.chaseRadius   = Number(template.chaseRadius ?? 3);

        // si no hay patrol en el spawn definition se genera uno por defecto
        const rawPatrol = spawnDef.patrol;
        this.patrol = Array.isArray(rawPatrol) && rawPatrol.length >= 2
            ? rawPatrol
            : [[x, y], [x + 2, y]];

        this.patrolIndex   = 0;
        this.patrolForward = true;
        this.moveTimer      = Math.random() * this.moveInterval;
        this.damageCooldown = 0;
        this.dead   = false;
        this.facing = "right";

    // posicion visual para la animacion de caminar (igual que el jugador)
        this.vx           = x;
        this.vy           = y;
        this.animFrom     = { x, y };
        this.animProgress = 1; // 1 = ya llego, sin animacion pendiente

        debug(MODULE, `Entity "${instanceId}" creada en (${x},${y}), behavior="${this.behavior}"`);
    }

    // Actualiza la entidad un frame.
     // Devuelve el daño que le hace al jugador este tick (0 si nada)
    update(dt, map, playerX, playerY) {
        if (this.dead) { return 0; }

      // avanza la animacion de caminar
        if (this.animProgress < 1) {
            this.animProgress = Math.min(1,  this.animProgress + dt / this.moveInterval);
            const ease = this.animProgress * (2 - this.animProgress); // ease-out cuadratico, igual que el jugador
            this.vx = this.animFrom.x + (this.x - this.animFrom.x) * ease;
            this.vy = this.animFrom.y + (this.y - this.animFrom.y) * ease;
        }

        if (this.damageCooldown > 0) {
            this.damageCooldown = Math.max(0, this.damageCooldown - dt);
        }

        this.moveTimer += dt;
        if (this.moveTimer >= this.moveInterval) {
            this.moveTimer -= this.moveInterval;

            const playerCerca = this.isPlayerInRange(playerX, playerY);
            if (this.behavior === "chase" || (this.behavior === "patrol" && playerCerca)) {
                this.doChase(map, playerX, playerY);
            } else {
                this.doPatrol(map, playerX, playerY);
            }
        }

        // daño cuando estan adyacentes (no encima) -- manhattan dist == 1
        const dist = Math.abs(this.x - playerX) + Math.abs(this.y - playerY);
        if (dist === 1 && this.damageCooldown <= 0) {
            this.damageCooldown = 1.5;
            debug(MODULE, `"${this.instanceId}" adyacente al jugador — hace ${this.damage} daño`);
            return this.damage;
        }
        return 0;
    }

    isPlayerInRange(playerX, playerY) {
        return Math.abs(this.x - playerX) + Math.abs(this.y - playerY) <= this.chaseRadius;
    }

    doPatrol(map, playerX, playerY) {
        if (this.patrol.length < 2) { return; }
        const [tx, ty] = this.patrol[this.patrolIndex];

        if (this.x === tx && this.y === ty) {
            if (this.patrolForward) {
                if (this.patrolIndex < this.patrol.length - 1) {
                    this.patrolIndex++;
                } else {
                    this.patrolForward = false;
                    this.patrolIndex = Math.max(0, this.patrol.length - 2);
                }
            } else {
                if (this.patrolIndex > 0) {
                    this.patrolIndex--;
                } else {
                    this.patrolForward  = true;
                    this.patrolIndex = Math.min(1, this.patrol.length - 1);
                }
            }
            return;
        }

        const dx = Math.sign(tx - this.x);
        const dy = Math.sign(ty - this.y);

        if (dx !== 0 && this.tryMove(this.x + dx, this.y,    map, playerX, playerY)) { return; }
        if (dy !== 0 && this.tryMove(this.x,       this.y+dy, map, playerX, playerY)) { return; }

        // si no puede avanzar cambia de direccion
        this.patrolIndex = this.patrolForward
            ? Math.min(this.patrolIndex + 1, this.patrol.length - 1)
            : Math.max(this.patrolIndex - 1, 0);
    }

    doChase(map, playerX, playerY) {
        if (this.x === playerX && this.y === playerY) { return; }
        const dx = Math.sign(playerX - this.x);
        const dy = Math.sign(playerY - this.y);
        // intenta moverse horizontal primero, luego vertical
        if (dx !== 0 && this.tryMove(this.x + dx, this.y,    map, playerX, playerY)) { return; }
        if (dy !== 0 && this.tryMove(this.x,       this.y+dy, map, playerX, playerY)) { return; }
    }

    tryMove(nx, ny, map, playerX, playerY) {
        if (ny < 0 || ny >= map.height || nx < 0 || nx >= map.width) { return false; }

        // no puede pisar al jugador
        if (nx === playerX && ny === playerY) { return false; }

        const id  = map.logic[ny]?.[nx];
        if (id === undefined) { return false; }
        const def = map.definitions.collisions[id];
        if (!def || !WALKABLE_TYPES.has(def.type)) { return false; }

        if (nx > this.x) { this.facing = "right"; }
        else if (nx < this.x) { this.facing = "left"; }

        // arranca la animacion desde la posicion actual antes de mover
        this.animFrom     = { x: this.x, y: this.y };
        this.animProgress = 0;

        this.x = nx;
        this.y = ny;
        return true;
    }

    /** Recibe daño. Devuelve true si ya murio */
    takeDamage(amount) {
        if (this.dead) { return true; }
        this.health = Math.max(0, this.health - amount);
        debug(MODULE, `"${this.instanceId}" recibio ${amount} daño — ${this.health}/${this.maxHealth} HP`);
        if (this.health <= 0) {
            this.dead = true;
            info(MODULE, `"${this.instanceId}" murio`);
        }
        return this.dead;
    }
}

 //Escanea el grid logico buscando tiles entity_spawn.
 // Crea instancias de Entity y reemplaza los spawn tiles con suelo.
export function spawnEntities(map) {
    const entities   = [];
    let   counter    = 0;
    const entityDefs = map.definitions.entities ?? {};
    const airId      = findAirId(map.definitions.collisions);

    for (let y = 0; y < map.height; y++) {
        for (let x = 0;  x < map.width; x++) {
            const id  = map.logic[y][x];
            const def = map.definitions.collisions[id];
            if (!def || def.type !== "entity_spawn") { continue; }

            const templateName = def.entity;
            const template     = entityDefs[templateName];

            // borra el spawn del grid para que sea pisable
            map.logic[y][x] = def.floorCollision ?? airId;

            if (!template) {
                warn(MODULE, `Template "${templateName}" no existe en definitions.entities — skip (${x},${y})`);
                continue;
            }

            const entity = new Entity(
                `${templateName}_${counter++}`,
                x, y,
                { ...template, name: templateName },
                def
            );
            entities.push(entity);
            info(MODULE, `Spawned "${entity.instanceId}" (${templateName}) en (${x},${y})`);
        }
    }

    info(MODULE, `Total entidades en "${map.name}": ${entities.length}`);
    return entities;
}

function findAirId(collisions) {
    for (const [id, def] of Object.entries(collisions)) {
        if (def.type === "air") { return Number(id); }
    }
    return 0;
}


