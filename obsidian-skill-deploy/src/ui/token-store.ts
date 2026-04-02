import type { TokenStore } from '../types/token-store';
import type { StoredTokens } from '../types/settings';
import type { PluginLogger } from '../shared/plugin-logger';

const CONFIG_DIR_NAME = '.obsidian-skill-deploy';
const TOKEN_FILE_NAME = 'tokens.json';

export class FileSystemTokenStore implements TokenStore {
	private readonly configDir: string;
	private readonly tokenPath: string;

	constructor(private readonly logger: PluginLogger) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- os must be loaded via require() in Obsidian's Node context
		const os = require('os') as { homedir: () => string };
		// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- path must be loaded via require() in Obsidian's Node context
		const path = require('path') as { join: (...args: string[]) => string };
		this.configDir = path.join(os.homedir(), CONFIG_DIR_NAME);
		this.tokenPath = path.join(this.configDir, TOKEN_FILE_NAME);
	}

	async save(tokens: StoredTokens): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- fs/promises must be loaded via require() in Obsidian's Node context
		const fs = require('fs/promises') as {
			mkdir: (path: string, opts: { recursive: boolean }) => Promise<void>;
			writeFile: (path: string, data: string, opts: { mode: number }) => Promise<void>;
		};
		await fs.mkdir(this.configDir, { recursive: true });
		await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), { mode: 0o600 });
		this.logger.debug('Tokens saved');
	}

	async load(): Promise<StoredTokens | null> {
		// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- fs/promises must be loaded via require() in Obsidian's Node context
		const fs = require('fs/promises') as {
			readFile: (path: string, encoding: string) => Promise<string>;
		};
		try {
			const data = await fs.readFile(this.tokenPath, 'utf-8');
			this.logger.debug('Tokens loaded');
			return JSON.parse(data) as StoredTokens;
		} catch {
			return null;
		}
	}

	async clear(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- fs/promises must be loaded via require() in Obsidian's Node context
		const fs = require('fs/promises') as {
			unlink: (path: string) => Promise<void>;
		};
		try {
			await fs.unlink(this.tokenPath);
			this.logger.debug('Tokens cleared');
		} catch {
			// File doesn't exist — that's fine
		}
	}
}
