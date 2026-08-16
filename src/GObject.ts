export type Slot = () => void;

type Connection = {
    receiver: GObject;
    slot: Slot;
};

export class Signal {
    private connections: Connection[] = [];

    connect(
        receiver: GObject,
        slot: Slot
    ): void {
        this.connections.push({
            receiver,
            slot
        });
    }

    emit(shouldContinue?: () => boolean): void {
        // copy it so creating/destroying objects
        // while emitting doesn't mess with this frame
        const connections = [...this.connections];

        for (const connection of connections) {
            if (shouldContinue && !shouldContinue()) {
                return;
            }
            connection.slot.call(
                connection.receiver
            );
        }
    }

    disconnectReceiver(
        receiver: GObject
    ): void {
        this.connections =
            this.connections.filter(
                connection =>
                    connection.receiver !== receiver
            );
    }
}

export class GObject {
    static UpdateSignal = new Signal();
    /**
     * Emitted instead of UpdateSignal while Game is paused.  Only objects
     * that override UpdatePaused() (for example UI, Renderer, and the
     * session's resume input) receive work during a pause.
     */
    static PauseSignal = new Signal();

    constructor() {
        GObject.UpdateSignal.connect(
            this,
            this.Update
        );
        GObject.PauseSignal.connect(
            this,
            this.UpdatePaused
        );
    }

    Update(): void {
        // overridden by children
    }

    /**
     * Override only when an object must remain active while the simulation is
     * frozen. The default deliberately does nothing.
     */
    UpdatePaused(): void {
        // overridden by children that render or handle resume input
    }

    destroy(): void {
        GObject.UpdateSignal.disconnectReceiver(this);
        GObject.PauseSignal.disconnectReceiver(this);
    }
}
