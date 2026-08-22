export interface Store<T> {
  getState: () => T;
  setState: (fn: (prev: T) => T) => void;
  subscribe: (listener: (state: T) => void) => () => void;
}

export function createStore<T>(initialState: T): Store<T> {
  let state = initialState;
  const listeners = new Set<(s: T) => void>();

  return {
    getState: () => state,
    setState: (fn) => {
      state = fn(state);
      for (const l of listeners) l(state);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
