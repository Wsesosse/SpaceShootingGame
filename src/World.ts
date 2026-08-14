import { Entity } from "./Entity.js";

export class World {
    static entities: Entity[] = [];

    static add(entity: Entity): void {
        this.entities.push(entity);
    }

    static reset(): void {
        for (const entity of this.entities) {
            entity.destroy();
        }

        this.entities = [];
    }

    static clean(): void {
        this.entities =
            this.entities.filter(
                entity => entity.alive
            );
    }
}
