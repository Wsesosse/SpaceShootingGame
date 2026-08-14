export class ScoreSystem {
    private static value = 0;

    /**
     * Economy tuning for Endless. Special waves are a survival challenge,
     * not a high-yield farming phase, so their enemies pay much less.
     */
    static readonly normalEnemyReward = 40;
    static readonly specialWaveEnemyReward = 5;
    static readonly bossReward = 400;

    static reset(): void {
        this.value = 0;
    }

    static add(points: number): void {
        this.value += points;
    }

    static spend(points: number): boolean {
        if (points > this.value) {
            return false;
        }

        this.value -= points;
        return true;
    }

    static get score(): number {
        return this.value;
    }
}
