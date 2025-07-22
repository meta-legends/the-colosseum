// A simple event bus for cross-component communication

type EventHandler = (data?: any) => void;

const events = new Map<string, EventHandler[]>();

export const eventBus = {
  on(event: string, handler: EventHandler) {
    let handlers = events.get(event);
    if (!handlers) {
      handlers = [];
      events.set(event, handlers);
    }
    handlers.push(handler);
  },

  off(event: string, handler: EventHandler) {
    const handlers = events.get(event);
    if (handlers) {
      events.set(event, handlers.filter(h => h !== handler));
    }
  },

  emit(event: string, data?: any) {
    const handlers = events.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  },
}; 