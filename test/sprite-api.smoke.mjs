import assert from "node:assert/strict";

import { Entity } from "../dist/Entity.js";
import { Enemy } from "../dist/Enemy.js";
import { GameState } from "../dist/GameState.js";
import { Renderer } from "../dist/Renderer.js";
import { WaveManager } from "../dist/WaveManager.js";
import { World } from "../dist/World.js";

class LoadedImage {
    static instances = 0;

    complete = true;
    naturalWidth = 160;
    naturalHeight = 160;
    src = "";
    onerror = undefined;

    constructor() {
        LoadedImage.instances += 1;
    }
}

const drawCalls = [];
const fillCalls = [];
const context = {
    drawImage: (...args) => drawCalls.push(args),
    fillRect: (...args) => fillCalls.push(args)
};
const canvas = {
    width: 800,
    height: 600,
    getContext: () => context
};

globalThis.Image = LoadedImage;

const renderer = new Renderer(canvas);
const sourceSize = { x: 20, y: 30 };
const defaultSpriteEntity = new Entity({ x: 0, y: 0 }, sourceSize);
sourceSize.x = 999;
assert.deepEqual(defaultSpriteEntity.sprite, { x: 20, y: 30 });

const imageEntity = new Entity(
    { x: 100, y: 200 },
    { x: 20, y: 30 },
    "/assets/bosses/prisma.png"
);
assert.deepEqual(renderer.drawSprite(imageEntity), {
    x: 30,
    y: 135,
    width: 160,
    height: 160
});
assert.equal(LoadedImage.instances, 1);
assert.deepEqual(drawCalls.at(-1).slice(1), [30, 135, 160, 160]);
assert.equal(drawCalls.at(-1)[0].src, "/assets/bosses/prisma.png");

const samePathEntity = new Entity(
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    "/assets/bosses/prisma.png"
);
assert.ok(renderer.drawSprite(samePathEntity));
assert.equal(LoadedImage.instances, 1);

const rectangleEntity = new Entity(
    { x: 50, y: 50 },
    { x: 20, y: 20 },
    { x: 60, y: 40 }
);
renderer.drawSpriteFallback(rectangleEntity);
assert.deepEqual(fillCalls.at(-1), [50, 50, 60, 40]);

defaultSpriteEntity.destroy();
imageEntity.destroy();
samePathEntity.destroy();
rectangleEntity.destroy();
renderer.destroy();

World.reset();
GameState.reset();
GameState.status = "boss";
const waveManager = new WaveManager({});
waveManager.Update();
const boss = World.entities.find(entity => entity instanceof Enemy);
assert.ok(boss instanceof Enemy);
assert.deepEqual(boss.size, { x: 120, y: 80 });
assert.equal(boss.sprite, "/assets/bosses/prisma.png");
World.reset();
waveManager.destroy();

console.log("Sprite API smoke test passed");
