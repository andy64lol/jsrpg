import Game from "./engine/index.js";


const canvas = document.getElementById("game");
const game = new Game(canvas);

async function init() {
    try {
        await game.start("map1");
        // renderizar
        requestAnimationFrame(loop);
    } catch (error) {
        console.error(error);
    }
}

function handleMove(dx, dy) {
    game.movePlayer(dx, dy).catch(error => console.error(error));
}

window.addEventListener("keydown", event => {
    if (event.defaultPrevented) return;

    let move = null;

    switch (event.key) {
        case "ArrowUp":
        case "w":
        case "W":
            move = { dx: 0, dy: -1 };
            break;
        case "ArrowDown":
        case "s":
        case "S":
            move = { dx: 0, dy: 1 };
            break;
        case "ArrowLeft":
        case "a":
        case "A":
            move = { dx: -1, dy: 0 };
            break;
        case "ArrowRight":
        case "d":
        case "D":
            move = { dx: 1, dy: 0 };
            break;
    }

    if (move) {
        event.preventDefault();
        handleMove(move.dx, move.dy);
    }
});

init();

function loop(now) {
    game.update(now);
    game.draw();
    requestAnimationFrame(loop);
}
