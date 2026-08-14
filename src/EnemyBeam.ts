import { Entity } from "./Entity.js";
import { Game } from "./Game.js";
import { GameFrame } from "./GameFrame.js";

// Game-space -Y means down the screen. Canvas coordinates use positive Y down.
export class EnemyBeam extends Entity {
    private remainingTime = 0.55;

    constructor(
        private readonly shooter: Entity,
        readonly damage = 30
    ) {
        super({ ...shooter.position }, { x: 14, y: GameFrame.height });
    }

    override Update(): void {
        this.position = {
            x: this.shooter.position.x + this.shooter.size.x / 2 - this.size.x / 2,
            y: this.shooter.position.y + this.shooter.size.y
        };
        this.size.y = Math.max(0, GameFrame.height - this.position.y);
        this.remainingTime -= Game.deltaTime;
        if (this.remainingTime <= 0 || !this.shooter.alive) this.kill();
    }
}
