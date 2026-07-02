import { load as loadMap } from "./map.js";
import Player from "./player.js";

const DEFAULT_TILE_SIZE = 8;
const PLAYER_SPRITES = {
    left: "assets/sprites/player/left.png",
    right: "assets/sprites/player/right.png"
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
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.map = null;
        this.player = null;
        this.imageCache = {};
        this.tileImages = {};
        this.playerImages = {};
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
        await this.loadTextures();
        this.resizeCanvas();
        this.draw();
        return this;
    }

    async loadTextures() {
        const tileSources = Object.values(this.map.definitions.tiles);
        const assetSources = new Set([...tileSources, ...Object.values(PLAYER_SPRITES)]);

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
            right: this.imageCache[PLAYER_SPRITES.right]
        };
    }

    resizeCanvas() {
        this.canvas.width = this.map.width * this.tileSize;
        this.canvas.height = this.map.height * this.tileSize;
    }

    setMoveKey(key, active) {
        if (this.transition) {
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
        if (this.isAnimating || this.transition) {
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
        await this.loadTextures();
        this.resizeCanvas();
        if (this.transition) {
            this.transition.phase = "fade-in";
            this.transition.timer = 0;
            this.transition.loading = false;
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let y = 0; y < this.map.height; y++) {
            for (let x = 0; x < this.map.width; x++) {
                const id = this.map.map[y][x];
                const src = this.map.definitions.tiles[id];
                const tileImage = this.tileImages[src];

                if (tileImage) {
                    ctx.drawImage(tileImage, x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
                }
            }
        }

        const playerSprite = this.playerImages[this.player.facing] || this.playerImages.right;
        let renderX = this.player.x;
        let renderY = this.player.y;

        if (this.animation) {
            const progress = Math.min(1, this.animation.progress);
            const ease = progress * (2 - progress);
            renderX = this.animation.fromX + (this.animation.toX - this.animation.fromX) * ease;
            renderY = this.animation.fromY + (this.animation.toY - this.animation.fromY) * ease;
        }

        ctx.drawImage(playerSprite, renderX * this.tileSize, renderY * this.tileSize, this.tileSize, this.tileSize);

        if (this.transition) {
            const alpha = this.transition.phase === "fade-out"
                ? Math.min(1, this.transition.timer / this.transition.duration)
                : Math.max(0, 1 - this.transition.timer / this.transition.duration);
            ctx.fillStyle = `rgba(0,0,0,${alpha})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
}