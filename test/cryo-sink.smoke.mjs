import assert from "node:assert/strict";
import { CollisionManager } from "../dist/CollisionManager.js";
import { CryoSink } from "../dist/CryoSink.js";
import { Enemy } from "../dist/Enemy.js";
import { EnemyBeam } from "../dist/EnemyBeam.js";
import { EnemyBullet } from "../dist/EnemyBullet.js";
import { Game } from "../dist/Game.js";
import { GameState } from "../dist/GameState.js";
import { Input } from "../dist/Input.js";
import { Player } from "../dist/Player.js";
import { World } from "../dist/World.js";

const close = (actual, expected, epsilon = 1e-6) => {
    assert.ok(
        Math.abs(actual - expected) < epsilon,
        `${actual} is not close to ${expected}`
    );
};

GameState.reset();
GameState.status = "playing";
Game.deltaTime = 0.1;
Input.clear();

const collision = new CollisionManager();
const player = new Player({ x: 200, y: 300 }, { x: 48, y: 48 });
const enemy = new Enemy({ x: 210, y: 340 }, { x: 32, y: 32 }, "basic");
const sink = new CryoSink(player);
const ordinaryBullet = new EnemyBullet({ x: 220, y: 350 }, { x: 0, y: 0 });
const beamLikeBullet = new EnemyBullet(
    { x: 220, y: 350 },
    { x: 0, y: 0 },
    1,
    true
);
const enemyBeam = new EnemyBeam(enemy);
const decayingEnemy = new Enemy({ x: 0, y: 0 }, { x: 32, y: 32 }, "basic");

try {
    World.add(player);
    World.add(sink);
    World.add(enemy);
    World.add(ordinaryBullet);
    World.add(beamLikeBullet);
    World.add(enemyBeam);

    // The sink spawns at the rear and then drifts down the playfield.
    close(sink.center.y, 354);
    sink.Update();
    close(sink.center.y, 361.2);

    collision.Update();
    assert.equal(ordinaryBullet.alive, false, "ordinary bullets are drained");
    assert.equal(beamLikeBullet.alive, true, "beam-like bullets are exempt");
    assert.equal(enemyBeam.alive, true, "EnemyBeam is exempt");
    assert.ok(
        enemy.cryoDrainLevel > 0 && enemy.cryoDrainLevel < 1,
        "enemies accumulate a visible drain level"
    );
    assert.ok(
        enemy.cryoTimeScale < 1 && enemy.cryoTimeScale > Enemy.minimumCryoTimeScale,
        "drain slows an enemy before it freezes"
    );
    enemy.Update();

    // 0.7 seconds of continuous exposure triggers one finite freeze.
    for (let index = 0; index < 6; index++) {
        collision.Update();
        enemy.Update();
    }
    assert.equal(enemy.isCryoFrozen, true, "sustained exposure freezes the enemy");
    assert.equal(enemy.cryoDrainLevel, 0, "a freeze consumes its drain charge");

    sink.kill();
    World.clean();
    for (let index = 0; index < 10; index++) {
        enemy.Update();
    }
    assert.equal(enemy.isCryoFrozen, false, "freeze is not refreshed forever");

    decayingEnemy.applyCryoExposure(0.35);
    decayingEnemy.Update();
    const levelBeforeDecay = decayingEnemy.cryoDrainLevel;
    decayingEnemy.Update();
    assert.ok(
        decayingEnemy.cryoDrainLevel < levelBeforeDecay,
        "drain decays after leaving the sink"
    );

    // The input path deploys the same sink and starts cooldown immediately.
    Input["pressed"].add("KeyI");
    player.Update();
    assert.equal(player.cryoSinkActive, true, "I deploys a Cryo Sink");
    assert.equal(
        player.cryoSinkCooldownRemaining,
        Player.cryoSinkCooldownDuration,
        "deployment starts the full cooldown"
    );
} finally {
    Input.clear();
    World.reset();
    decayingEnemy.destroy();
    collision.destroy();
}

console.log("Cryo Sink smoke test passed");
