export type GameMode = "tutorial" | "endless";
export type GameStatus =
    | "menu"
    | "playing"
    | "betweenWaves"
    | "trader"
    | "boss"
    | "levelComplete"
    | "won"
    | "gameOver";
export type Ability = "heal" | "shield" | "chargeBeam";

export class GameState {
    static mode: GameMode | null = null;
    static level = 1;
    static wave = 1;
    static kills = 0;
    static readonly quota = [6, 8, 10];
    static readonly specialWaveDuration = 30;
    static specialWaveChance = 0.3;
    static specialWaveTimeRemaining = 0;
    static specialWave = false;
    static maxLives = 3;
    static lives = 3;
    static status: GameStatus = "menu";
    static readonly abilities = new Set<Ability>();

    static reset(): void {
        this.mode = null;
        this.level = 1;
        this.wave = 1;
        this.kills = 0;
        this.specialWaveChance = 0.3;
        this.specialWaveTimeRemaining = 0;
        this.specialWave = false;
        this.maxLives = 3;
        this.lives = 3;
        this.status = "menu";
        this.abilities.clear();
    }

    static startRun(mode: GameMode): void {
        this.mode = mode;
        this.level = 1;
        this.wave = 1;
        this.kills = 0;
        this.specialWaveChance = 0.3;
        this.specialWaveTimeRemaining = 0;
        this.specialWave = false;
        this.maxLives = 3;
        this.lives = 3;
        this.status = "playing";
        this.abilities.clear();
        this.beginWave();
    }

    static get isEndless(): boolean {
        return this.mode === "endless";
    }

    static addMaxLives(amount: number): void {
        this.maxLives += amount;
        this.lives = Math.min(this.maxLives, this.lives + amount);
    }

    static get target(): number {
        if (this.specialWave) {
            return 0;
        }

        if (this.isEndless) {
            return this.quota[(this.wave - 1) % this.quota.length];
        }

        return this.quota[this.wave - 1] ?? 0;
    }

    static get enemyHealthMultiplier(): number {
        return 1 + (this.level - 1) * 0.25;
    }

    static get enemyDamageMultiplier(): number {
        return 1 + (this.level - 1) * 0.2;
    }

    static beginWave(random: () => number = Math.random): void {
        this.specialWave = false;
        this.specialWaveTimeRemaining = 0;

        if (!this.isEndless) {
            return;
        }

        // New runs need the first three quota waves to earn their initial
        // upgrades. The first possible special wave is wave 4, after the
        // protected starter Trader visit.
        if (this.level === 1 && this.wave <= 3) {
            return;
        }

        if (random() < this.specialWaveChance) {
            this.specialWave = true;
            this.specialWaveTimeRemaining = this.specialWaveDuration;
            this.specialWaveChance = 0.3;
            return;
        }

        this.specialWaveChance = Math.min(1, this.specialWaveChance + 0.05);
    }

    static tickSpecialWave(deltaTime: number): boolean {
        if (!this.specialWave || this.status !== "playing") {
            return false;
        }

        this.specialWaveTimeRemaining = Math.max(
            0,
            this.specialWaveTimeRemaining - deltaTime
        );
        if (this.specialWaveTimeRemaining > 0) {
            return false;
        }

        this.status = "betweenWaves";
        return true;
    }

    static has(ability: Ability): boolean {
        return this.abilities.has(ability);
    }

    static enemyDefeated(): void {
        if (this.status !== "playing" || this.specialWave) {
            return;
        }

        this.kills += 1;

        if (this.kills >= this.target) {
            this.status = "betweenWaves";
        }
    }

    static unlockWaveReward(): void {
        if (this.wave === 1) this.abilities.add("heal");
        if (this.wave === 2) this.abilities.add("shield");
        if (this.wave === 3) this.abilities.add("chargeBeam");
    }

    static bossDefeated(): void {
        this.status = this.isEndless ? "levelComplete" : "won";
    }

    static startNextLevel(): void {
        this.level += 1;
        this.wave = 1;
        this.kills = 0;
        this.specialWave = false;
        this.specialWaveTimeRemaining = 0;
        this.status = "playing";
        this.beginWave();
    }
}
