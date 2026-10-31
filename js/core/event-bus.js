
class EventBus {
    constructor() {
        this.events = new Map();
    }

    on(eventName, callback) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, new Set());
        }

        this.events.get(eventName).add(callback);

        return () => this.off(eventName, callback);
    }

    off(eventName, callback) {
        this.events.get(eventName)?.delete(callback);
    }

    emit(eventName, data = null) {
        const listeners = this.events.get(eventName);

        if (!listeners) return;

        for (const callback of listeners) {
            callback(data);
        }
    }
}

export const eventBus = new EventBus();
