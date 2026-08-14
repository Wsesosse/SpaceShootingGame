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

    emit(): void {
        // copy it so creating/destroying objects
        // while emitting doesn't mess with this frame
        const connections = [...this.connections];

        for (const connection of connections) {
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

    constructor() {
        GObject.UpdateSignal.connect(
            this,
            this.Update
        );
    }

    Update(): void {
        // overridden by children
    }

    destroy(): void {
        GObject.UpdateSignal.disconnectReceiver(this);
    }
}