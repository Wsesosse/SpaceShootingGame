import { Entity } from "./Entity.js";
import { Bullet } from "./Bullet.js";
import { Input } from "./Input.js";
import { Game } from "./Game.js";
import { World } from "./World.js";
import { GameFrame } from "./GameFrame.js";
import { GameState } from "./GameState.js";
import { ChargeBeam } from "./ChargeBeam.js";
import { MAX_PENETRATION_STACKS } from "./TraderItem.js";
import { CryoSink } from "./CryoSink.js";

export class Player extends Entity {
    static readonly maxBeamChargeTime = 5;
    static readonly beamWidthStepInterval = 0.5;
    static readonly beamWidthPerStep = 2;
    static readonly beamFireCooldownDuration = 0.2;
    static readonly cryoSinkCooldownDuration = 7;

    speed: number = 300;
    maxHealth = 100;
    private health = this.maxHealth;

    private shootCooldown: number = 0;
    private iframeTime = 0;
    private healCooldown = 0;
    private shield = 5;
    private maxShield = 5;
    private shieldToggled = false;
    private chargeTime = 0;
    private beamWidth = 18;
    private beamToggleEnabled = false;
    private beamCharging = false;
    private beamFireCooldown = 0;
    private cryoSinkCooldown = 0;
    private activeCryoSink?: CryoSink;
    private bulletDamage = 10;
    private bulletPenetration = 0;
    private homingLevel = 0;

    get invulnerable(): boolean {
        return this.iframeTime > 0;
    }

    get shieldPower(): number {
        return this.shield;
    }

    get maxShieldPower(): number {
        return this.maxShield;
    }

    get shieldUnlocked(): boolean {
        return GameState.has("shield");
    }

    /** Whether the shield is currently consuming hits instead of regenerating. */
    get shieldActive(): boolean {
        return this.shieldUnlocked && this.shieldToggled && this.shield > 0;
    }

    get currentHealth(): number {
        return this.health;
    }

    get healCooldownRemaining(): number {
        return this.healCooldown;
    }

    get chargeLevel(): number {
        return this.chargeTime;
    }

    get maxChargeTime(): number {
        return Player.maxBeamChargeTime;
    }

    get baseChargeBeamWidth(): number {
        return this.beamWidth;
    }

    /** Includes the +2 width gained for every completed half-second of charge. */
    get chargeBeamWidth(): number {
        return this.effectiveChargeBeamWidth;
    }

    get toggleChargeEnabled(): boolean {
        return this.beamToggleEnabled;
    }

    get isChargingBeam(): boolean {
        return this.beamCharging;
    }

    get beamCooldownRemaining(): number {
        return this.beamFireCooldown;
    }

    get cryoSinkCooldownRemaining(): number {
        return this.cryoSinkCooldown;
    }

    get cryoSinkActive(): boolean {
        return this.activeCryoSink?.alive ?? false;
    }

    get cryoSinkDurationRemaining(): number {
        return this.cryoSinkActive ? this.activeCryoSink!.remainingTime : 0;
    }

    get currentBulletDamage(): number {
        return this.bulletDamage;
    }

    get currentBulletPenetration(): number {
        return this.bulletPenetration;
    }

    get homingEnabled(): boolean {
        return this.homingLevel > 0;
    }

    get currentHomingLevel(): number {
        return this.homingLevel;
    }

    /** First stack restores the original 7/s turn rate; later stacks sharpen it. */
    get homingTurnRate(): number {
        return this.homingEnabled ? 4 + this.homingLevel * 3 : 0;
    }

    increaseMaxHealth(amount: number): void {
        this.maxHealth += amount;
        this.health += amount;
    }

    increaseMaxLives(amount: number): void {
        GameState.addMaxLives(amount);
    }

    increaseShieldArmor(amount: number): void {
        this.maxShield += amount;
        this.shield += amount;
    }

    increaseBeamWidth(amount: number): void {
        this.beamWidth += amount;
    }

    enableToggleCharge(): void {
        this.beamToggleEnabled = true;
    }

    increaseBulletDamage(amount: number): void {
        this.bulletDamage += amount;
    }

    enableHomingBullets(): void {
        this.homingLevel += 1;
    }

    increaseBulletPenetration(amount: number): void {
        this.bulletPenetration = Math.max(
            0,
            Math.min(
                MAX_PENETRATION_STACKS,
                this.bulletPenetration + amount
            )
        );
    }

    override Update(): void {
        if (
            GameState.status !== "playing" &&
            GameState.status !== "boss"
        ) {
            return;
        }

        this.movement();
        this.shooting();
        this.abilities();
    }

    takeHit(damage: number): void {
        if (
            this.invulnerable ||
            (GameState.status !== "playing" && GameState.status !== "boss")
        ) return;

        if (this.shieldActive) {
            this.shield = Math.max(0, this.shield - damage);
            if (this.shield === 0) {
                this.shieldToggled = false;
            }
            this.iframeTime = 0.6;
            return;
        }

        this.health = Math.max(0, this.health - damage);
        this.iframeTime = 1.2;

        if (this.health === 0) {
            GameState.lives -= 1;

            if (GameState.lives <= 0) {
                GameState.status = "gameOver";
                return;
            }

            this.clearWorldAfterLifeLoss();
            this.health = this.maxHealth;
            this.position = { x: 376, y: 520 };
            this.iframeTime = 2;
            this.shieldToggled = false;
        }
    }

    private abilities(): void {
        this.iframeTime = Math.max(0, this.iframeTime - Game.deltaTime);
        this.healCooldown = Math.max(0, this.healCooldown - Game.deltaTime);
        this.beamFireCooldown = Math.max(0, this.beamFireCooldown - Game.deltaTime);
        this.cryoSinkCooldown = Math.max(0, this.cryoSinkCooldown - Game.deltaTime);

        if (Input.consumePress("KeyL") && this.shieldUnlocked && this.shield > 0) {
            this.shieldToggled = !this.shieldToggled;
        }

        if (!this.shieldActive) {
            this.shield = Math.min(this.maxShield, this.shield + Game.deltaTime);
        }

        if (Input.consumePress("KeyK") && GameState.has("heal") && this.healCooldown === 0) {
            this.health = Math.min(this.maxHealth, this.health + 35);
            this.healCooldown = 8;
        }

        if (Input.consumePress("KeyI") && this.cryoSinkCooldown === 0) {
            this.activeCryoSink = new CryoSink(this);
            World.add(this.activeCryoSink);
            this.cryoSinkCooldown = Player.cryoSinkCooldownDuration;
        }

        if (GameState.has("chargeBeam")) {
            this.chargeBeam();
        } else {
            // Do not leave a pre-unlock key press queued for the first frame
            // after Charge Beam becomes available.
            Input.consumePress("KeyJ");
            Input.consumeRelease("KeyJ");
        }
    }

    private chargeBeam(): void {
        if (this.beamToggleEnabled) {
            if (Input.consumePress("KeyJ")) {
                if (this.beamCharging) {
                    this.fireChargeBeam();
                } else if (this.beamFireCooldown === 0) {
                    this.beamCharging = true;
                }
            }

            if (this.beamCharging) {
                this.chargeTime = Math.min(
                    Player.maxBeamChargeTime,
                    this.chargeTime + Game.deltaTime
                );
            }
            return;
        }

        if (Input.down("KeyJ") && this.beamFireCooldown === 0) {
            this.beamCharging = true;
            this.chargeTime = Math.min(
                Player.maxBeamChargeTime,
                this.chargeTime + Game.deltaTime
            );
        }

        if (Input.consumeRelease("KeyJ") && this.chargeTime > 0) {
            if (!this.fireChargeBeam()) {
                this.chargeTime = 0;
                this.beamCharging = false;
            }
        } else if (!Input.down("KeyJ") && this.chargeTime === 0) {
            this.beamCharging = false;
        }
    }

    private fireChargeBeam(): boolean {
        if (this.chargeTime <= 0 || this.beamFireCooldown > 0) {
            return false;
        }

        World.add(new ChargeBeam(
            this,
            { x: 0, y: -1 },
            this.chargeTime,
            this.effectiveChargeBeamWidth
        ));
        this.chargeTime = 0;
        this.beamCharging = false;
        this.beamFireCooldown = Player.beamFireCooldownDuration;
        return true;
    }

    private movement(): void {
        if (
            Input.down("KeyA") ||
            Input.down("ArrowLeft")
        ) {
            this.position.x -=
                this.speed * Game.deltaTime;
        }

        if (
            Input.down("KeyD") ||
            Input.down("ArrowRight")
        ) {
            this.position.x +=
                this.speed * Game.deltaTime;
        }

        if (
            Input.down("KeyW") ||
            Input.down("ArrowUp")
        ) {
            this.position.y -=
                this.speed * Game.deltaTime;
        }

        if (
            Input.down("KeyS") ||
            Input.down("ArrowDown")
        ) {
            this.position.y +=
                this.speed * Game.deltaTime;
        }

        this.position.x = Math.max(
            0,
            Math.min(
                this.position.x,
                GameFrame.width - this.size.x
            )
        );

        this.position.y = Math.max(
            0,
            Math.min(
                this.position.y,
                GameFrame.height - this.size.y
            )
        );
    }

    private shooting(): void {
        this.shootCooldown -= Game.deltaTime;

        if (
            Input.down("Space") &&
            this.shootCooldown <= 0
        ) {
            this.shoot();

            this.shootCooldown = 0.2;
        }
    }

    private shoot(): void {
        const bullet =
            new Bullet(
                {
                    x:
                        this.position.x +
                        this.size.x / 2 - 3,

                    y: this.position.y
                },

                {
                    x: 6,
                    y: 16
                },
                {
                    damage: this.bulletDamage,
                    penetration: this.bulletPenetration,
                    homing: this.homingEnabled,
                    homingTurnRate: this.homingTurnRate
                }
            );

        World.add(bullet);
    }

    private get effectiveChargeBeamWidth(): number {
        const widthSteps = Math.floor(
            this.chargeTime / Player.beamWidthStepInterval
        );
        return this.beamWidth + widthSteps * Player.beamWidthPerStep;
    }

    /** Clears the current battlefield before a surviving player respawns. */
    private clearWorldAfterLifeLoss(): void {
        for (const entity of World.entities) {
            if (entity !== this) {
                entity.kill();
            }
        }
        World.clean();
        this.activeCryoSink = undefined;
    }
}
