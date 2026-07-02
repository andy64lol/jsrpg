import Game from "./engine/index.js";

const KEY_DIRECTIONS = {
    w: true,
    arrowup: true,
    s: true,
    arrowdown: true,
    a: true,
    arrowleft: true,
    d: true,
    arrowright: true
};

const canvas = document.getElementById("game");
const game = new Game(canvas);

async function init() {
    try {
        await game.start("map1");
        requestAnimationFrame(loop);
    } catch (error) {
        console.error(error);
    }
}

window.addEventListener("keydown", event => {
    if (event.defaultPrevented) return;

    const key = event.key.toLowerCase();
    if (KEY_DIRECTIONS[key]) {
        event.preventDefault();
        game.setMoveKey(key, true);
    }
});

window.addEventListener("keyup", event => {
    const key = event.key.toLowerCase();
    if (KEY_DIRECTIONS[key]) {
        event.preventDefault();
        game.setMoveKey(key, false);
    }
});

init();

function loop(now) {
    game.update(now);
    game.draw();
    requestAnimationFrame(loop);
}
