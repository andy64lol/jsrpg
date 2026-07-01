import { load as loadMap } from "./map.js";
import Player from "./player.js";

const TILE_SIZE = 8;
const PLAYER_SPRITES = {
    left: "assets/sprites/player/left.png",
    right: "assets/sprites/player/right.png"
};

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
    });
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
    }

    async start(mapName) {
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
        this.canvas.width = this.map.width * TILE_SIZE;
        this.canvas.height = this.map.height * TILE_SIZE;
    }

    async movePlayer(dx, dy) {
        const result = this.player.move(dx, dy, this.map.logic, this.map.definitions);

        if (result?.type === "warp") {
            const newMap = await loadMap(result.toMap);
            this.map = newMap;
            this.player.x = result.toX;
            this.player.y = result.toY;
            await this.loadTextures();
            this.resizeCanvas();
        }

        this.draw();
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
                    ctx.drawImage(tileImage, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        const playerSprite = this.playerImages[this.player.facing] || this.playerImages.right;
        ctx.drawImage(playerSprite, this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
}