# JSRPG
---
This is a small browser RPG template that uses 8x8 tiles.

![Screenshot](./screenshot.png)

Start the game by opening `src/index.html` in a web server or browser.

Controls:
- Arrow keys and WASD to move the player. Try to avoid the spikes.
- Walk into an enemy to attack it. They hit back.

Enemies show a health bar above their sprite — green when healthy, orange when hurt, red when nearly dead. Each hit knocks them one tile back. They do the same to you.

The game loads `map1` first and supports map warp by stepping on door tiles defined in `definitions.jsonc`.