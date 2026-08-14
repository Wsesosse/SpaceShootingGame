import { Entity, Vector2 } from "./Entity.js";
import { Game } from "./Game.js";
import { GameFrame } from "./GameFrame.js";

export class EnemyBullet extends Entity {
    constructor(
        position: Vector2,
        private velocity: Vector2,
        readonly damage = 1,
        readonly beam = false
    ) {
        super(position, beam ? { x: 10, y: 30 } : { x: 8, y: 12 });
    }

    override Update(): void {
        this.position.x += this.velocity.x * Game.deltaTime;
        this.position.y += this.velocity.y * Game.deltaTime;

        if (
            this.position.x < -30 ||
            this.position.x > GameFrame.width + 30 ||
            this.position.y < -30 ||
            this.position.y > GameFrame.height + 30
        ) {
            this.kill();
        }
    }
}
