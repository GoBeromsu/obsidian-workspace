---
type: pattern
date: 2026-03-20
plugin: open-connections
tags: [state-management, redux, pure-functions]
confidence: high
---

# State Machine — Pure Reducer + Store Pattern

## What it solves

Complex async workflows (like embedding pipelines) need predictable state transitions. A pure reducer function takes `(prevState, event) => nextState` — no side effects, fully testable. The store holds the state and dispatches events.

## When to use

- Multi-phase async workflows with progress tracking (embedding, sync)
- State with many transitions that are easy to get wrong
- When you need time-travel debugging or state snapshots

## When NOT to use

- Simple on/off toggles — just use a boolean
- CRUD operations without complex state transitions
- Small plugins with 1-2 states

## Code example

```typescript
// domain/kernel/types.ts — Pure types
export type EmbedPhase = 'idle' | 'loading' | 'embedding' | 'complete' | 'error';
export interface EmbedState { phase: EmbedPhase; progress: number; error?: string; }
export type EmbedEvent =
  | { type: 'START' }
  | { type: 'PROGRESS'; value: number }
  | { type: 'COMPLETE' }
  | { type: 'ERROR'; message: string };

// domain/kernel/reducer.ts — PURE state transition (domain/)
export function embedReducer(state: EmbedState, event: EmbedEvent): EmbedState {
  switch (event.type) {
    case 'START': return { phase: 'embedding', progress: 0 };
    case 'PROGRESS': return { ...state, progress: event.value };
    case 'COMPLETE': return { phase: 'complete', progress: 100 };
    case 'ERROR': return { phase: 'error', progress: state.progress, error: event.message };
    default: return state;
  }
}

// domain/kernel/selectors.ts — PURE derived queries (domain/)
export function isEmbedding(state: EmbedState): boolean {
  return state.phase === 'embedding';
}

// ui/kernel/store.ts — Stateful store (ui/ since it has side effects)
export class EmbedStore {
  private state: EmbedState = { phase: 'idle', progress: 0 };
  private listeners: Array<(state: EmbedState) => void> = [];

  dispatch(event: EmbedEvent): void {
    this.state = embedReducer(this.state, event);
    this.listeners.forEach(fn => fn(this.state));
  }

  getState(): EmbedState { return this.state; }
  subscribe(fn: (state: EmbedState) => void): () => void { ... }
}
```

## Which plugins use it

- **open-connections**: Embedding kernel (`kernel/reducer.ts`, `kernel/store.ts`, `kernel/selectors.ts`)
