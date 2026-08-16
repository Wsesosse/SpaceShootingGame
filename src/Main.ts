import { CollisionManager } from "./CollisionManager.js";
import { Game } from "./Game.js";
import { GameFrame } from "./GameFrame.js";
import { Input } from "./Input.js";
import { Renderer } from "./Renderer.js";
import { ScoreSystem } from "./ScoreSystem.js";
import { UI } from "./UI.js";
import { GameState } from "./GameState.js";
import { SessionManager } from "./SessionManager.js";

const canvas = document.querySelector<HTMLCanvasElement>("#game");

if (!canvas) {
    throw new Error("Missing #game canvas");
}

canvas.width = GameFrame.width;
canvas.height = GameFrame.height;

Input.initialize(canvas);
ScoreSystem.reset();
GameState.reset();

// Register pause input first, so it can stop the frame before collision or
// simulation objects receive their normal update.
new SessionManager();
new CollisionManager();
new Renderer(canvas);
new UI(canvas);

Game.start();
