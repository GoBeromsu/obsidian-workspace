# TypeScript & ESLint Conventions

Rules enforced by ObsidianReviewBot at the language/tooling level — not specific to the Obsidian API.
These apply to any TypeScript project, but the bot enforces them strictly on community plugin submissions.

---

## Console methods

Only `console.warn`, `console.error`, and `console.debug` are allowed.
`console.log` and `console.info` are banned.

```typescript
// ❌ Bad
console.log('Loaded')
console.info('Processing...')

// ✅ Good
console.debug('Loaded')          // verbose, development
console.warn('Retrying...')      // user-visible warning
console.error('Failed:', err)    // errors only
```

**Cannot disable**: `no-console` cannot be disabled via `eslint-disable`. Replace `console.*` calls with a plugin logger.

---

## eslint-disable comments need descriptions

Every `eslint-disable` directive must explain *why* the rule is suppressed.

```typescript
// ❌ Bad
// eslint-disable-next-line @typescript-eslint/no-explicit-any

// ✅ Good
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- third-party API returns untyped response
```

Bot message: `"Unexpected undescribed directive comment. Include descriptions to explain why the comment is necessary."`

---

## Remove unused eslint-disable directives

If an `eslint-disable` directive no longer suppresses any actual violation, remove it.

```typescript
// ❌ Bad — no-console rule doesn't fire here, so this is stale
// eslint-disable-next-line no-console
this.logger.debug('...')

// ✅ Good — just remove it
this.logger.debug('...')
```

Bot message: `"Unused eslint-disable directive (no problems were reported from 'rule-name')."`

---

## Async methods must have await

A method declared `async` must contain at least one `await` expression. If not, remove `async`.

```typescript
// ❌ Bad — async with no await
async onClose(): Promise<void> {
  this.container.empty();
}

// ✅ Good
onClose(): void {
  this.container.empty();
}
```

Bot message: `"Async method 'X' has no 'await' expression."`

**⚠️ Exception — `ItemView.onOpen` / `onClose`**:
Obsidian's `ItemView` base class declares these as `Promise<void>`, so TypeScript requires `async` even with no `await`.
Keep `async` and use `/skip` on the bot comment:
```
/skip onOpen and onClose must be async because ItemView declares them as Promise<void>
```

### Variant: delegate pass-through

A method that only forwards to another async method without awaiting is also flagged.

```typescript
// ❌ Bad — async but only delegates; no await needed
async doThing(): Promise<void> {
  return this.service.doThing();
}

// ✅ Good — the returned Promise propagates automatically
doThing(): Promise<void> {
  return this.service.doThing();
}
```

### Variant: base class stub

An empty `async` method body (e.g., in a base class or optional lifecycle hook) is flagged even though it compiles fine.

```typescript
// ❌ Bad — empty async body triggers the rule
async init(): Promise<void> {}

// ✅ Good — explicit Promise resolves the rule
init(): Promise<void> {
  return Promise.resolve();
}
```

---

## Handle floating promises

Unawaited async calls must be explicitly marked with `void` or chained with `.catch()`.

```typescript
// ❌ Bad
this.loadData();           // returns Promise, not awaited

// ✅ Good — fire-and-forget
void this.loadData();

// ✅ Good — with error handling
void this.loadData().catch(err => this.logger.error('Load failed', err));

// ✅ Good — if you need the result
await this.loadData();
```

Bot message: `"Promises must be awaited, end with a call to .catch, end with a call to .then with a rejection handler or be explicitly marked as ignored with the void operator."`

---

## No unknown/object in template literals

Variables typed as `unknown`, `object`, or a non-primitive type will produce `[object Object]` when interpolated in template literals.

**⚠️ Critical**: `String(unknownValue)` does **NOT** satisfy this rule. The rule fires on the *input type*, not the output. You must narrow to a primitive type with `typeof` before any string conversion.

```typescript
// ❌ Bad — bare interpolation of unknown
`Failed: ${error}`

// ❌ Bad — String() on unknown STILL triggers the rule
`Result: ${String(value)}`

// ❌ Bad — String() on Record value STILL triggers the rule
`ID: ${String((item as Record<string, unknown>).id ?? '')}`

// ✅ Good — errors: instanceof + cast to primitive
`Failed: ${error instanceof Error ? error.message : String(error as string | number | boolean | bigint | symbol)}`

// ✅ Good — unknown values: typeof narrowing first
const v = someUnknown;
typeof v === 'string' ? v : String(v as string | number | boolean | bigint | symbol)

// ✅ Good — Record fields from JSON (e.g. in object mapping)
const row = item as Record<string, unknown>;
return {
  id: typeof row.id === 'string' ? row.id : '',
  name: typeof row.name === 'string' ? row.name : '',
};

// ✅ Good — plugin-logger pattern: extract to typed string variable
const repr: string = typeof error === 'object'
  ? JSON.stringify(error as Record<string, unknown>)
  : String(error as string | number | boolean | bigint | symbol);
suffix = ` | ${repr}`;

// ✅ Good — template interpolation with Record<string, unknown> values
// (null/undefined already handled above with early return)
return typeof value === 'object'
  ? JSON.stringify(value as Record<string, unknown>)
  : String(value as string | number | boolean | bigint | symbol);
```

Bot message: `"'X' will use Object's default stringification format ('[object Object]') when stringified."`

**Note — local lint gap**: This rule (`@typescript-eslint/no-base-to-string`) is NOT enabled in the default local ESLint config. `pnpm lint` passes locally even when the bot rejects. See the section below.

---

## No `any` types

**⚠️ The `@typescript-eslint/no-explicit-any` disable directive is BANNED** — same as `no-console`. You cannot suppress this rule; you must fix the actual type.

```typescript
// ❌ Bad
function process(data: any): any { ... }

// ❌ Bad — eslint-disable is also rejected by the bot
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason
const result = response as any;

// ✅ Good
function process(data: unknown): string { ... }

// ✅ Good — typed interface for third-party API
interface ApiResponse { status: number; body: string }
function process(data: ApiResponse): string { ... }

// ✅ Good — unknown double-cast for internal/private shapes
(settings as unknown as { _myPrivateField?: string })._myPrivateField

// ✅ Good — Record cast for JSON-parsed data
const row = raw as Record<string, unknown>;
```

Bot message: `"Unexpected any. Specify a different type."`

### Obsidian workspace events — module augmentation pattern

Custom `workspace.on/trigger` calls use event names not in Obsidian's types, leading to `as any` casts. **Never cast the event name as any.** Instead, declare typed overloads in `src/types/obsidian-augments.d.ts`:

```typescript
// src/types/obsidian-augments.d.ts
import 'obsidian';

declare module 'obsidian' {
  interface Workspace {
    on(name: 'my-plugin:my-event', callback: (payload: MyPayload) => void, ctx?: unknown): EventRef;
    trigger(name: 'my-plugin:my-event', payload: MyPayload): void;
  }
}
```

This file is auto-included via `tsconfig.json`'s `src/**/*` include glob — no import needed. After adding it, all `as any` casts on event names can be removed cleanly.

---

## Remove unnecessary type assertions

If an `as Type` cast doesn't change the inferred type, remove it.

```typescript
// ❌ Bad — value is already string, cast is redundant
const name = getValue() as string;

// ✅ Good
const name = getValue();
```

Bot message: `"This assertion is unnecessary since it does not change the type of the expression."`

---

## Local lint vs bot scan divergence

The bot runs `@typescript-eslint/no-base-to-string` which is NOT enabled in the default local ESLint config. This means:

- `pnpm lint` passes locally with 0 errors
- Bot still rejects with `'X' will use Object's default stringification format`

**Do not trust local lint alone** for these patterns. The bot-specific manual checklist in SKILL.md must be checked even when lint is clean.

### Rule: `no-base-to-string` is stricter than `String()`

`String(unknownValue)` does NOT satisfy this rule. The rule fires on the TYPE of the input, not the output. Fix requires explicit `typeof` narrowing BEFORE the string conversion:

```typescript
// ❌ STILL fails — String() doesn't narrow the type
String((item as Record<string, unknown>).snippet ?? '')

// ✅ Correct
const v = (item as Record<string, unknown>).snippet;
typeof v === 'string' ? v : ''

// ✅ Correct for error objects in plugin-logger
const repr: string = typeof error === 'object'
  ? JSON.stringify(error as Record<string, unknown>)
  : String(error as string | number | boolean | bigint | symbol);
suffix = ` | ${repr}`;

// ✅ Correct for template interpolation with Record values
const value = params[key]; // unknown
// value null/undefined already handled above
return typeof value === 'object'
  ? JSON.stringify(value as Record<string, unknown>)
  : String(value as string | number | boolean | bigint | symbol);
```

---

## eslint.config.js — deprecated `config()` (known false positive)

Bot message: `` "`config` is deprecated. ESLint core now provides this functionality via `defineConfig()`." ``

**⚠️ False positive**: `tseslint.defineConfig()` does NOT exist in `typescript-eslint` 8.x.
`tseslint.config()` is the correct and only available API.

Use `/skip` with:
```
/skip tseslint.defineConfig() does not exist in typescript-eslint 8.x — tseslint.config() is the only available API
```
