import { load as loadMap } from "./map.js";
import Player from "./player.js";

const DEFAULT_TILE_SIZE = 8;
const PLAYER_SPRITES = {
    left: "assets/sprites/player/left.png",
    right: "assets/sprites/player/right.png",
    leftDead: "assets/sprites/player/left_dead.png",
    rightDead: "assets/sprites/player/right_dead.png"
};

const UI_SPRITES = {
    heart: "assets/UI/heart.png",
    brokenHeart: "assets/UI/broken_heart.png"
};

const KEY_DIRECTIONS = {
    w: { dx: 0, dy: -1 },
    arrowup: { dx: 0, dy: -1 },
    s: { dx: 0, dy: 1 },
    arrowdown: { dx: 0, dy: 1 },
    a: { dx: -1, dy: 0 },
    arrowleft: { dx: -1, dy: 0 },
    d: { dx: 1, dy: 0 },
    arrowright: { dx: 1, dy: 0 }
};

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
    });
}

async function loadJSONC(url) {
    const response = await fetch(url);
    const text = await response.text();
    return JSON.parse(text.replace(/\/\/.*$/gm, ""));
}

export default class Game {
    constructor(canvas, hudElement = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.hudElement = hudElement;
        this.map = null;
        this.player = null;
        this.imageCache = {};
        this.tileImages = {};
        this.playerImages = {};
        this.uiImages = {};
        this.config = {
            player: {
                speed: 2,
                gliding: {
                    enabled: true,
                    duration: 0.12
                }
            },
            map: {
                tile_size: DEFAULT_TILE_SIZE
            }
        };
        this.tileSize = DEFAULT_TILE_SIZE;
        this.viewportWidth = 7;
        this.viewportHeight = 7;
        this.camera = { x: 0, y: 0 };
        this.health = 0;
        this.maxHealth = 0;
        this.isDead = false;
        this.lastUpdate = null;
        this.moveStepTimer = 0;
        this.activeMoveKeys = new Set();
        this.moveOrder = [];
        this.currentDirection = { dx: 0, dy: 0 };
        this.animation = null;
        this.isAnimating = false;
        this.transition = null;
    }

    async loadConfig() {
        const config = await loadJSONC(new URL("./config.jsonc", import.meta.url));
        this.config = {
            ...this.config,
            ...config,
            player: {
                ...this.config.player,
                ...(config.player || {})
            },
            map: {
                ...this.config.map,
                ...(config.map || {})
            }
        };
        this.tileSize = this.config.map.tile_size ?? this.tileSize;
        this.viewportWidth = this.config.map.viewport_width ?? this.viewportWidth;
        this.viewportHeight = this.config.map.viewport_height ?? this.viewportHeight;
        this.maxHealth = (this.config.player.hearts ?? this.maxHealth) || 10;
        this.health = this.maxHealth;
    }

    getStepInterval() {
        return 1 / Math.max(1, this.config.player.speed ?? 2);
    }

    getGlideDuration() {
        return this.config.player.gliding?.duration ?? 0.12;
    }

    async start(mapName) {
        await this.loadConfig();
        this.map = await loadMap(mapName);

        if (!this.map.spawn) {
            throw new Error(`Start map '${mapName}' must include a player_spawn tile.`);
        }

        this.player = new Player(this.map.spawn.x, this.map.spawn.y);
        this.player.lastTilePosition = { x: this.player.x, y: this.player.y };
        this.isDead = false;
        this.health = this.maxHealth;

        await this.loadTextures();
        this.resizeCanvas();
        this.applyTileEffects(this.player.x, this.player.y);
        this.draw();
        return this;
    }

    async loadTextures() {
        const tileSources = Object.values(this.map.definitions.tiles);
        const assetSources = new Set([
            ...tileSources,
            ...Object.values(PLAYER_SPRITES),
            ...Object.values(UI_SPRITES)
        ]);

        for (const src of assetSources) {
            if (!this.imageCache[src]) {
                this.imageCache[src] = await loadImage(src);
            }
        }

        this.tileImages = Object.fromEntries(
            tileSources.map(src => [src, this.imageCache[src]])
        );

        this.playerImages = {
            left: this.imageCache[PLAYER_SPRITES.left],
            right: this.imageCache[PLAYER_SPRITES.right],
            leftDead: this.imageCache[PLAYER_SPRITES.leftDead],
            rightDead: this.imageCache[PLAYER_SPRITES.rightDead]
        };

        this.uiImages = {
            heart: this.imageCache[UI_SPRITES.heart],
            brokenHeart: this.imageCache[UI_SPRITES.brokenHeart]
        };
    }

    resizeCanvas() {
        this.camera.x = 0;
        this.camera.y = 0;
        const width = Math.min(this.map.width, this.viewportWidth);
        const height = Math.min(this.map.height, this.viewportHeight);
        this.canvas.width = width * this.tileSize;
        this.canvas.height = height * this.tileSize;
    }

    getCamera() {
        const halfWidth = Math.floor(this.viewportWidth / 2);
        const halfHeight = Math.floor(this.viewportHeight / 2);
        let x = this.player.x - halfWidth;
        let y = this.player.y - halfHeight;

        x = Math.max(0, Math.min(x, this.map.width - this.viewportWidth));
        y = Math.max(0, Math.min(y, this.map.height - this.viewportHeight));

        return { x, y };
    }

    setMoveKey(key, active) {
        if (this.transition || this.isDead) {
            return;
        }

        const normalizedKey = key.toLowerCase();
        if (!KEY_DIRECTIONS[normalizedKey]) {
            return;
        }

        if (active) {
            if (!this.activeMoveKeys.has(normalizedKey)) {
                this.activeMoveKeys.add(normalizedKey);
                this.moveOrder.push(normalizedKey);
                if (!this.isAnimating) {
                    this.moveStepTimer = this.getStepInterval();
                }
            }
        } else {
            if (this.activeMoveKeys.delete(normalizedKey)) {
                this.moveOrder = this.moveOrder.filter(item => item !== normalizedKey);
            }
        }
    }

    getActiveDirection() {
        for (let i = this.moveOrder.length - 1; i >= 0; i--) {
            const key = this.moveOrder[i];
            const direction = KEY_DIRECTIONS[key];
            if (direction) {
                return direction;
            }
        }

        return { dx: 0, dy: 0 };
    }

    update(now) {
        if (!this.map) {
            return;
        }

        const deltaSeconds = this.lastUpdate ? (now - this.lastUpdate) / 1000 : 0;
        this.lastUpdate = now;

        if (this.transition) {
            this.transition.timer += deltaSeconds;

            if (this.transition.phase === "fade-out" && this.transition.timer >= this.transition.duration && !this.transition.loading) {
                this.transition.loading = true;
                this.performWarp(this.transition.warp);
            }

            if (this.transition.phase === "fade-in" && this.transition.timer >= this.transition.duration) {
                this.transition = null;
            }

            return;
        }

        if (this.isAnimating && this.animation) {
            this.animation.progress += deltaSeconds / this.getGlideDuration();
            if (this.animation.progress >= 1) {
                this.animation = null;
                this.isAnimating = false;
            }
        }

        const direction = this.getActiveDirection();
        const isMoving = direction.dx !== 0 || direction.dy !== 0;
        const stepInterval = this.getStepInterval();
        const directionChanged = direction.dx !== this.currentDirection.dx || direction.dy !== this.currentDirection.dy;

        if (directionChanged) {
            this.currentDirection = direction;
            if (!this.isAnimating) {
                this.moveStepTimer = stepInterval;
            }
        }

        if (isMoving && !this.isAnimating) {
            this.moveStepTimer += deltaSeconds;
            if (this.moveStepTimer >= stepInterval) {
                this.moveStepTimer -= stepInterval;
                this.movePlayer(direction.dx, direction.dy);
            }
        } else if (!isMoving) {
            this.moveStepTimer = 0;
        }
    }

    async movePlayer(dx, dy) {
        if (this.isAnimating || this.transition || this.isDead) {
            return;
        }

        if (dx === 0 && dy === 0) {
            return;
        }

        const originX = this.player.x;
        const originY = this.player.y;
        const result = this.player.move(dx, dy, this.map.logic, this.map.definitions);

        if (result?.type === "warp") {
            this.startTransition(result);
            return;
        }

        if (this.player.x !== originX || this.player.y !== originY) {
            this.applyTileEffects(this.player.x, this.player.y);

            this.animation = {
                fromX: originX,
                fromY: originY,
                toX: this.player.x,
                toY: this.player.y,
                progress: 0
            };
            this.isAnimating = true;
        }
    }

    applyTileEffects(x, y) {
        if (!this.map || this.isDead) {
            return;
        }

        if (this.player.lastTilePosition && this.player.lastTilePosition.x === x && this.player.lastTilePosition.y === y) {
            return;
        }

        const id = this.map.logic[y][x];
        const def = this.map.definitions.collisions[id];

        this.player.lastTilePosition = { x, y };

        if (def?.type === "player_damage") {
            const damage = Number(def.damage || 1);
            if (damage > 0) {
                this.health = Math.max(0, this.health - damage);
                if (this.health <= 0) {
                    this.die();
                }
            }
        }
    }

    die() {
        if (this.isDead) {
            return;
        }

        this.isDead = true;
        this.activeMoveKeys.clear();
        this.moveOrder = [];
        this.isAnimating = false;
        this.animation = null;
    }

    startTransition(warp) {
        this.activeMoveKeys.clear();
        this.moveOrder = [];
        this.transition = {
            phase: "fade-out",
            timer: 0,
            duration: this.config.player.gliding?.duration ?? 0.12,
            warp,
            loading: false
        };
    }

    async performWarp(warp) {
        const newMap = await loadMap(warp.toMap);
        this.map = newMap;
        this.player.x = warp.toX;
        this.player.y = warp.toY;
        this.player.lastTilePosition = null;
        await this.loadTextures();
        this.resizeCanvas();
        this.applyTileEffects(this.player.x, this.player.y);
        if (this.transition) {
            this.transition.phase = "fade-in";
            this.transition.timer = 0;
            this.transition.loading = false;
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const camera = this.getCamera();
        const viewWidth = Math.min(this.viewportWidth, this.map.width);
        const viewHeight = Math.min(this.viewportHeight, this.map.height);

        for (let y = camera.y; y < camera.y + viewHeight; y++) {
            for (let x = camera.x; x < camera.x + viewWidth; x++) {
                const id = this.map.map[y][x];
                const src = this.map.definitions.tiles[id];
                const tileImage = this.tileImages[src];

                if (tileImage) {
                    ctx.drawImage(
                        tileImage,
                        (x - camera.x) * this.tileSize,
                        (y - camera.y) * this.tileSize,
                        this.tileSize,
                        this.tileSize
                    );
                }
            }
        }

        const playerSprite = this.isDead
            ? this.playerImages[this.player.facing === "left" ? "leftDead" : "rightDead"]
            : this.playerImages[this.player.facing] || this.playerImages.right;
        let renderX = this.player.x;
        let renderY = this.player.y;

        if (this.animation) {
            const progress = Math.min(1, this.animation.progress);
            const ease = progress * (2 - progress);
            renderX = this.animation.fromX + (this.animation.toX - this.animation.fromX) * ease;
            renderY = this.animation.fromY + (this.animation.toY - this.animation.fromY) * ease;
        }

        ctx.drawImage(
            playerSprite,
            (renderX - camera.x) * this.tileSize,
            (renderY - camera.y) * this.tileSize,
            this.tileSize,
            this.tileSize
        );

        this.drawHealthUI();

        if (this.isDead) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = "#ffffff";
            ctx.font = `${Math.max(12, this.tileSize * 1.25)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("you died...", this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        if (this.transition) {
            const alpha = this.transition.phase === "fade-out"
                ? Math.min(1, this.transition.timer / this.transition.duration)
                : Math.max(0, 1 - this.transition.timer / this.transition.duration);
            ctx.fillStyle = `rgba(0,0,0,${alpha})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    drawHealthUI() {
        if (!this.hudElement) {
            return;
        }

        const totalHearts = Math.ceil(this.maxHealth / 2);
        const heartSize = this.tileSize;
        const heartHtml = [];

        for (let index = 0; index < totalHearts; index++) {
            const heartNumber = index + 1;
            const heartMaxHp = heartNumber * 2;
            const heartMinHp = heartMaxHp - 1;
            const isFull = this.health >= heartMaxHp;
            const isHalf = this.health === heartMinHp;
            const src = (isFull || isHalf) ? this.uiImages.heart?.src : this.uiImages.brokenHeart?.src;
            let transform = "";

            if (isHalf && !this.isDead) {
                const jitterX = (Math.random() * 4 - 2).toFixed(2);
                const jitterY = (Math.random() * 4 - 2).toFixed(2);
                transform = `transform: translate(${jitterX}px, ${jitterY}px);`;
            }

            heartHtml.push(`
                <img
                    class="hud-heart"
                    src="${src || ""}"
                    style="width: ${heartSize}px; height: ${heartSize}px; ${transform}"
                    aria-hidden="true"
                />
            `);
        }

        this.hudElement.innerHTML = heartHtml.join("");
    }
}