import { requestUrl } from 'obsidian';
import type { PluginLogger } from '../shared/plugin-logger';

export interface AtomicCommitResult {
	commitSha: string;
	treeSha: string;
}

export class DeployConflictError extends Error {
	constructor(message: string, public readonly orphanedCommitSha?: string) {
		super(message);
		this.name = 'DeployConflictError';
	}
}

export class GitHubApiClient {
	private readonly baseUrl = 'https://api.github.com';

	constructor(private readonly logger: PluginLogger) {}

	async getUser(token: string): Promise<string> {
		const resp = await this.request('GET', '/user', token);
		this.logRateLimit(resp.headers);
		const data = JSON.parse(resp.text) as { login: string };
		return data.login;
	}

	async getRef(owner: string, repo: string, branch: string, token: string): Promise<{ sha: string; treeSha: string }> {
		const resp = await this.request('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
		this.logRateLimit(resp.headers);
		const data = JSON.parse(resp.text) as { object: { sha: string } };
		const commitSha = data.object.sha;

		const commitResp = await this.request('GET', `/repos/${owner}/${repo}/git/commits/${commitSha}`, token);
		this.logRateLimit(commitResp.headers);
		const commitData = JSON.parse(commitResp.text) as { tree: { sha: string } };

		return { sha: commitSha, treeSha: commitData.tree.sha };
	}

	async getTreeShaForPath(owner: string, repo: string, path: string, branch: string, token: string): Promise<string | null> {
		try {
			const resp = await this.request('GET', `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, token);
			this.logRateLimit(resp.headers);
			// For directories, GitHub returns an array. We need the tree SHA from git trees API.
			const ref = await this.getRef(owner, repo, branch, token);
			const treeResp = await this.request('GET', `/repos/${owner}/${repo}/git/trees/${ref.treeSha}?recursive=1`, token);
			this.logRateLimit(treeResp.headers);
			const treeData = JSON.parse(treeResp.text) as { tree: Array<{ path: string; sha: string; type: string }> };
			const entry = treeData.tree.find(e => e.path === path && e.type === 'tree');
			return entry?.sha ?? null;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes('404')) return null; // Path doesn't exist yet
			throw err; // Re-throw auth, network, rate-limit errors
		}
	}

	async createAtomicCommit(
		owner: string,
		repo: string,
		branch: string,
		files: Array<{ path: string; content: string }>,
		message: string,
		token: string,
	): Promise<AtomicCommitResult> {
		// Step 0: Read current ref
		const ref = await this.getRef(owner, repo, branch, token);
		const parentCommitSha = ref.sha;
		const baseTreeSha = ref.treeSha;

		// Step 1: Create blobs for each file
		const blobShas: Array<{ path: string; sha: string }> = [];
		for (const file of files) {
			const blobResp = await this.request('POST', `/repos/${owner}/${repo}/git/blobs`, token, {
				content: file.content,
				encoding: 'utf-8',
			});
			this.logRateLimit(blobResp.headers);
			const blobData = JSON.parse(blobResp.text) as { sha: string };
			blobShas.push({ path: file.path, sha: blobData.sha });
		}

		// Step 2: Create tree with base_tree
		const treeResp = await this.request('POST', `/repos/${owner}/${repo}/git/trees`, token, {
			base_tree: baseTreeSha,
			tree: blobShas.map(b => ({
				path: b.path,
				mode: '100644',
				type: 'blob',
				sha: b.sha,
			})),
		});
		this.logRateLimit(treeResp.headers);
		const treeData = JSON.parse(treeResp.text) as { sha: string };
		const newTreeSha = treeData.sha;

		// Step 3: Create commit
		const commitResp = await this.request('POST', `/repos/${owner}/${repo}/git/commits`, token, {
			message,
			tree: newTreeSha,
			parents: [parentCommitSha],
		});
		this.logRateLimit(commitResp.headers);
		const commitData = JSON.parse(commitResp.text) as { sha: string };
		const newCommitSha = commitData.sha;

		// Step 4: Update ref (fast-forward)
		try {
			const refResp = await this.request('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
				sha: newCommitSha,
			});
			this.logRateLimit(refResp.headers);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('422') || message.includes('fast-forward')) {
				throw new DeployConflictError(
					`Conflict: branch was updated during deploy. Orphaned commit: ${newCommitSha}`,
					newCommitSha,
				);
			}
			throw err;
		}

		return { commitSha: newCommitSha, treeSha: newTreeSha };
	}

	private async request(
		method: string,
		path: string,
		token: string,
		body?: unknown,
	): Promise<{ text: string; headers: Record<string, string>; status: number }> {
		const resp = await requestUrl({
			url: `${this.baseUrl}${path}`,
			method,
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
				...(body ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});

		if (resp.status >= 400) {
			throw new Error(`GitHub API ${method} ${path} failed with ${resp.status}: ${resp.text}`);
		}

		return { text: resp.text, headers: resp.headers, status: resp.status };
	}

	private logRateLimit(headers: Record<string, string>): void {
		const remaining = headers['x-ratelimit-remaining'];
		if (remaining) {
			this.logger.info('GitHub API rate limit', { remaining });
		}
	}
}
