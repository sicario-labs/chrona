import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

interface AppState {
  count: number;
  increment: () => void;
}

export const store = createStore<AppState>()(
  subscribeWithSelector((set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 })),
  }))
);

// We currently subscribe directly to the entire store.
// Task: Replace this direct store subscription with a selector-based pattern
// so we only log when 'count' specifically changes.
store.subscribe(
  (state) => state.count,
  (count) => {
    console.log('Store updated:', count);
  }
);
