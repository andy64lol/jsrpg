import { load as loadMap } from "./map.js";
import Player from "./player.js";
import { saveGameState, loadGameState } from "./save_load.js";

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
    constructor(canvas, hudElement = null, inventoryElement = null, messageElement = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.hudElement = hudElement;
        this.inventoryElement = inventoryElement;
        this.messageElement = messageElement;
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
        this.cameraLerpSpeed = 18;
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
        this.visualPosition = { x: 0, y: 0 };
        this.inventory = [];
        this.selectedInventoryIndex = 0;
        this.itemDefinitions = {};
        this.mapChanges = [];
        this.messageTimeout = null;
        this.soundConfig = {
            BGM: {},
            player: {}
        };
        this.sounds = {
            damage: null,
            music: null
        };
    }

    async loadConfig() {
        const [config, soundConfig] = await Promise.all([
            loadJSONC(new URL("./config.jsonc", import.meta.url)),
            loadJSONC(new URL("../assets/sounds/soundconfig.jsonc", import.meta.url))
        ]);
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
        this.soundConfig = {
            ...this.soundConfig,
            ...soundConfig,
            BGM: {
                ...this.soundConfig.BGM,
                ...(soundConfig.BGM || {})
            },
            player: {
                ...this.soundConfig.player,
                ...(soundConfig.player || {})
            }
        };
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
        this.itemDefinitions = await loadJSONC(new URL("./items.jsonc", import.meta.url));
    }

    getStepInterval() {
        return 1 / Math.max(1, this.config.player.speed ?? 2);
    }

    getGlideDuration() {
        return this.config.player.gliding?.duration ?? 0.12;
    }

    async start(mapName) {
        await this.loadConfig();

        const savedState = loadGameState();
        const initialMap = savedState?.mapName || mapName;
        this.map = await loadMap(initialMap);

        if (!this.map.spawn) {
            throw new Error(`Start map '${initialMap}' must include a player_spawn tile.`);
        }

        if (savedState) {
            this.player = new Player(savedState.player.x, savedState.player.y);
            this.player.facing = savedState.player.facing || "right";
            this.player.lastTilePosition = savedState.player.lastTilePosition || { x: savedState.player.x, y: savedState.player.y };
            this.health = savedState.health ?? this.maxHealth;
            this.inventory = savedState.inventory || [];
            this.selectedInventoryIndex = savedState.selectedInventoryIndex ?? 0;
            this.mapChanges = savedState.mapChanges || [];
            this.restoreMapChanges(this.mapChanges);
        } else {
            this.player = new Player(this.map.spawn.x, this.map.spawn.y);
            this.player.lastTilePosition = { x: this.player.x, y: this.player.y };
            this.visualPosition = { x: this.player.x, y: this.player.y };
            this.isDead = false;
            this.health = this.maxHealth;
            this.selectedInventoryIndex = 0;
            this.mapChanges = [];
        }

        if (this.player) {
            this.visualPosition = { x: this.player.x, y: this.player.y };
        }

        await this.loadTextures();
        this.resizeCanvas();
        this.applyTileEffects(this.player.x, this.player.y);
        this.setupSoundsForCurrentMap();
        this.sounds.music?.play().catch(() => {});
        this.draw();
        return this;
    }

    async loadTextures() {
        const tileSources = Object.values(this.map.definitions.tiles);
        const itemSources = Object.values(this.itemDefinitions || {}).map(item => item.texture).filter(Boolean);
        const assetSources = new Set([
            ...tileSources,
            ...Object.values(PLAYER_SPRITES),
            ...Object.values(UI_SPRITES),
            ...itemSources
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

    updateCamera(deltaSeconds) {
        const target = this.getCamera();
        const t = Math.min(1, deltaSeconds * this.cameraLerpSpeed);
        this.camera.x += (target.x - this.camera.x) * t;
        this.camera.y += (target.y - this.camera.y) * t;
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

        this.updateCamera(deltaSeconds);
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
            this.saveState();

            this.animateMovement(this.player.x, this.player.y);
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
                this.sounds.damage.play().catch(() => {});
                if (this.health <= 0) {
                    this.die();
                }
                this.saveState();
            }
        }
    }

    saveState() {
        if (!this.map || !this.player) {
            return;
        }

        saveGameState({
            mapName: this.map.name,
            player: {
                x: this.player.x,
                y: this.player.y,
                facing: this.player.facing,
                lastTilePosition: this.player.lastTilePosition
            },
            health: this.health,
            inventory: this.inventory,
            selectedInventoryIndex: this.selectedInventoryIndex,
            mapChanges: this.mapChanges
        });
    }

    addItemToInventory(itemId) {
        if (!this.itemDefinitions[itemId]) {
            console.warn(`Unknown item id '${itemId}'`);
            return;
        }

        this.inventory.push(itemId);
        this.selectedInventoryIndex = this.inventory.length - 1;
        this.saveState();
    }

    getSelectedItem() {
        if (!this.inventory.length) {
            return null;
        }

        const itemId = this.inventory[this.selectedInventoryIndex] || this.inventory[0];
        return this.itemDefinitions[itemId] || null;
    }

    cycleInventory(offset) {
        if (!this.inventory.length) {
            return;
        }

        this.selectedInventoryIndex = (this.selectedInventoryIndex + offset + this.inventory.length) % this.inventory.length;
        this.saveState();
    }

    useSelectedItem() {
        const item = this.getSelectedItem();
        if (!item) {
            return;
        }

        if (item.type === "consumable") {
            const amount = item.use?.amount ?? item.heals ?? 0;
            const action = item.use?.action ?? (item.heals ? "heal" : null);
            if (action === "heal" && amount > 0) {
                this.health = Math.min(this.maxHealth, this.health + Number(amount));
            }

            const removedIndex = this.selectedInventoryIndex;
            this.inventory.splice(removedIndex, 1);
            if (this.inventory.length === 0) {
                this.selectedInventoryIndex = 0;
            } else if (this.selectedInventoryIndex >= this.inventory.length) {
                this.selectedInventoryIndex = this.inventory.length - 1;
            }
            this.saveState();
        }
    }

    isInteractInRange(def, x, y) {
        const dx = Math.abs(this.player.x - x);
        const dy = Math.abs(this.player.y - y);
        const radius = Number(def.interactRequirements?.player_in_radius ?? def.interactRequirements?.player_max_position ?? 1);
        const minRadius = Number(def.interactRequirements?.player_min_position ?? 0);
        const diagonalAllowed = def.interactRequirements?.diagonal !== false;

        if (!diagonalAllowed && dx > 0 && dy > 0) {
            return false;
        }

        const dist = dx + dy;
        if (dist < minRadius) {
            return false;
        }

        return dist <= radius;
    }

    interactAt(tileX, tileY) {
        if (!this.map || this.isDead) {
            return;
        }

        if (tileX < 0 || tileX >= this.map.width || tileY < 0 || tileY >= this.map.height) {
            return;
        }

        const id = this.map.logic[tileY]?.[tileX];
        if (id === undefined) {
            return;
        }

        const def = this.map.definitions.collisions[id];
        if (!def || def.interactType !== "click") {
            return;
        }

        if (!this.isInteractInRange(def, tileX, tileY)) {
            return;
        }

        if (def.type === "heal") {
            const healAmount = Number(def.heals || 0);
            this.health = Math.min(this.maxHealth, this.health + healAmount);
            if (!def.infinity) {
                this.applyMapChange(tileX, tileY, Number(def.afterOpeningCollision ?? 0), def.afterOpeningTile ? Number(def.afterOpeningTile) : undefined);
            }
            if (def.afterInteractText) {
                this.showMessage(def.afterInteractText);
            }
            this.saveState();
        }

        if (def.type === "chest") {
            if (def.contains) {
                this.addItemToInventory(def.contains);
            }
            this.applyMapChange(tileX, tileY, Number(def.afterOpeningCollision ?? 0), def.afterOpeningTile ? Number(def.afterOpeningTile) : undefined);
            if (def.afterInteractText) {
                this.showMessage(def.afterInteractText);
            } else {
                this.showMessage("You opened the chest.");
            }
            this.saveState();
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

    animateMovement(targetX, targetY) {
        this.visualPosition = { x: targetX, y: targetY };
        this.isAnimating = false;
    }

    getInteractionTarget() {
        const target = { x: this.player.x, y: this.player.y };
        if (this.player.facing === "left") target.x -= 1;
        if (this.player.facing === "right") target.x += 1;
        if (this.player.facing === "up") target.y -= 1;
        if (this.player.facing === "down") target.y += 1;
        return target;
    }

    interactForward() {
        const target = this.getInteractionTarget();
        this.interactAt(target.x, target.y);
    }

    resolveSoundUrl(filename) {
        if (!filename) {
            return null;
        }
        return new URL(`../assets/sounds/${filename}`, import.meta.url).href;
    }

    createAudio(filename, options = {}) {
        const url = this.resolveSoundUrl(filename);
        if (!url) {
            return null;
        }
        const audio = new Audio(url);
        if (options.loop) {
            audio.loop = true;
        }
        if (options.volume !== undefined) {
            audio.volume = options.volume;
        }
        return audio;
    }

    setupSoundsForCurrentMap() {
        const mapName = this.map?.name;
        if (!mapName) {
            return;
        }

        const musicFile = this.soundConfig?.BGM?.[mapName] || Object.values(this.soundConfig?.BGM || {})[0];
        if (musicFile) {
            if (!this.sounds.music || this.sounds.music.src !== this.resolveSoundUrl(musicFile)) {
                this.sounds.music?.pause();
                this.sounds.music = this.createAudio(musicFile, { loop: true });
            }
        }

        const damageFile = this.soundConfig?.player?.receive_damage;
        if (damageFile) {
            if (!this.sounds.damage || this.sounds.damage.src !== this.resolveSoundUrl(damageFile)) {
                this.sounds.damage = this.createAudio(damageFile);
            }
        }
    }

    toggleMusic() {
        if (!this.sounds.music) {
            this.setupSoundsForCurrentMap();
        }

        if (!this.sounds.music) {
            return;
        }

        if (this.sounds.music.paused) {
            this.sounds.music.play().catch(() => {});
        } else {
            this.sounds.music.pause();
        }
    }

    clearSave() {
        localStorage.removeItem("jsrpg_save");
    }

    applyMapChange(tileX, tileY, newLogic, newMapTile) {
        if (!this.map) {
            return;
        }
        this.map.logic[tileY][tileX] = newLogic;
        if (newMapTile !== undefined) {
            this.map.map[tileY][tileX] = newMapTile;
        }
        const existingIndex = this.mapChanges.findIndex(change => change.x === tileX && change.y === tileY);
        const change = { x: tileX, y: tileY, logic: newLogic };
        if (newMapTile !== undefined) {
            change.map = newMapTile;
        }
        if (existingIndex >= 0) {
            this.mapChanges[existingIndex] = change;
        } else {
            this.mapChanges.push(change);
        }
    }

    restoreMapChanges(changes) {
        if (!this.map || !Array.isArray(changes)) {
            return;
        }

        for (const change of changes) {
            if (typeof change.x !== "number" || typeof change.y !== "number") {
                continue;
            }
            if (change.logic !== undefined) {
                this.map.logic[change.y][change.x] = change.logic;
            }
            if (change.map !== undefined) {
                this.map.map[change.y][change.x] = change.map;
            }
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
        this.player.lastTilePosition = null;
        await this.loadTextures();
        this.resizeCanvas();
        this.applyTileEffects(this.player.x, this.player.y);
        this.saveState();
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
        const renderX = this.visualPosition?.x ?? this.player.x;
        const renderY = this.visualPosition?.y ?? this.player.y;

        ctx.drawImage(
            playerSprite,
            (renderX - camera.x) * this.tileSize,
            (renderY - camera.y) * this.tileSize,
            this.tileSize,
            this.tileSize
        );

        this.drawHealthUI();
        this.drawInventoryUI();

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
        const heartSize = Math.max(24, this.tileSize * 3);
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

    drawInventoryUI() {
        if (!this.inventoryElement) {
            return;
        }

        if (!this.inventory.length) {
            this.inventoryElement.innerHTML = "<div class='inventory-empty'>Inventory empty</div>";
            return;
        }

        const inventoryHtml = this.inventory.map((itemId, index) => {
            const item = this.itemDefinitions[itemId];
            const label = item ? item.display_name : itemId;
            const classes = ["inventory-slot", index === this.selectedInventoryIndex ? "selected" : ""].join(" ");
            return `<div class="${classes}">${label}</div>`;
        }).join("");

        this.inventoryElement.innerHTML = `<div class="inventory-bar">${inventoryHtml}</div>`;
    }

    showMessage(message = "") {
        if (!this.messageElement) {
            return;
        }

        this.messageElement.textContent = message;
        this.messageElement.style.opacity = "1";
        clearTimeout(this.messageTimeout);
        this.messageTimeout = setTimeout(() => {
            this.messageElement.style.opacity = "0";
        }, 2000);
    }
}