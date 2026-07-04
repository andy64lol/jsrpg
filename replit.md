# JSRPG

A small browser-based RPG template using 8×8 pixel tiles, written in vanilla JavaScript.

## How to run

The workflow `Start application` starts a Python HTTP server on port 8000:

```
python server.py
```

Open the preview to play. The game serves from `src/index.html`.

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrow keys | Move player |
| F | Interact with tile in front of player |
| E | Use selected inventory item |
| [ / ] | Cycle inventory selection |

## Debug mode

Open the browser console and run:

```js
window.__JSRPG_DEBUG = true
```

This enables verbose `[JSRPG]` prefixed logs from all engine modules.

## Stack

- Vanilla JS ES modules (no bundler)
- Python `http.server` for local serving (no caching)
- ESLint (`eslint.config.js`) for linting

## Linting

```
npx eslint src/engine/*.js
```

## Project structure

```
src/
  index.html          — Entry point
  engine/
    debug.js          — Centralized debug/info/warn/error logging
    index.js          — Main Game class (game loop, rendering, input)
    map.js            — Map loader and validator
    player.js         — Player movement and collision logic
    save_load.js      — localStorage save/load
    config.jsonc      — Player speed, tile size, viewport config
    items.jsonc       — Item definitions (consumables etc.)
  assets/             — Sprites, tiles, UI images, sounds
  maps/
    map1/             — Dungeon map with heal fountain and door
    map2/             — Dungeon map connecting map1 and map3
    map3/             — Dungeon map with spikes and chest
```

## User preferences

- Branch: `dev` (rebased from `origin/dev`)
- Keep project structure and vanilla-JS stack as-is
- Debug messages use `window.__JSRPG_DEBUG = true` flag (silent by default)
- ESLint enforced: `prefer-const`, `no-var`, `eqeqeq`, `curly`
