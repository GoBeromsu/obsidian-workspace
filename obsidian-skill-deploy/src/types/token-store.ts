import type { StoredTokens } from './settings';

export interface TokenStore {
	save(tokens: StoredTokens): Promise<void>;
	load(): Promise<StoredTokens | null>;
	clear(): Promise<void>;
}
