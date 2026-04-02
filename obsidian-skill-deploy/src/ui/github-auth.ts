import { Platform, requestUrl } from 'obsidian';
import { GITHUB_OAUTH } from '../domain/github-oauth-config';
import { generatePKCEChallenge, generateState } from '../domain/pkce';
import type { TokenStore } from '../types/token-store';
import type { StoredTokens } from '../types/settings';
import type { PluginLogger } from '../shared/plugin-logger';
import { OAuthCallbackServer } from './oauth-server';

export class GitHubAuth {
	private callbackServer: OAuthCallbackServer | null = null;
	private clientId: string = '';

	constructor(
		private readonly tokenStore: TokenStore,
		private readonly logger: PluginLogger,
	) {}

	async startAuthFlow(clientId: string): Promise<StoredTokens> {
		if (!Platform.isDesktop) {
			throw new Error('OAuth is only supported on desktop');
		}

		this.logger.info('Starting GitHub OAuth flow');
		this.clientId = clientId;

		const { codeVerifier, codeChallenge } = await generatePKCEChallenge();
		const state = generateState();

		this.callbackServer = new OAuthCallbackServer(this.logger);
		const callbackPromise = this.callbackServer.waitForCallback(state);

		const authUrl = new URL(GITHUB_OAUTH.AUTHORIZATION_ENDPOINT);
		authUrl.searchParams.set('client_id', clientId);
		authUrl.searchParams.set('redirect_uri', GITHUB_OAUTH.REDIRECT_URI);
		authUrl.searchParams.set('scope', GITHUB_OAUTH.SCOPES);
		authUrl.searchParams.set('state', state);
		authUrl.searchParams.set('code_challenge', codeChallenge);
		authUrl.searchParams.set('code_challenge_method', 'S256');

		this.logger.info('Opening browser for GitHub authorization');
		window.open(authUrl.toString());

		const { code } = await callbackPromise;
		this.logger.info('Authorization code received, exchanging for token');

		const tokens = await this.exchangeCodeForToken(clientId, code, codeVerifier);
		await this.tokenStore.save(tokens);
		this.logger.info('OAuth flow complete', { username: tokens.username });

		return tokens;
	}

	async isAuthenticated(): Promise<boolean> {
		const tokens = await this.tokenStore.load();
		if (!tokens) return false;
		return Date.now() < tokens.expiresAt;
	}

	async getToken(): Promise<string | null> {
		const tokens = await this.tokenStore.load();
		if (!tokens) return null;

		if (Date.now() >= tokens.expiresAt && tokens.refreshToken) {
			try {
				const refreshed = await this.refreshToken(tokens.refreshToken);
				return refreshed.accessToken;
			} catch {
				this.logger.warn('Token refresh failed, clearing tokens');
				await this.tokenStore.clear();
				return null;
			}
		}

		return tokens.accessToken;
	}

	async getUsername(): Promise<string | null> {
		const tokens = await this.tokenStore.load();
		return tokens?.username ?? null;
	}

	async logout(): Promise<void> {
		await this.tokenStore.clear();
		this.logger.info('Logged out');
	}

	stopServer(): void {
		this.callbackServer?.stop();
		this.callbackServer = null;
	}

	private async exchangeCodeForToken(clientId: string, code: string, codeVerifier: string): Promise<StoredTokens> {
		const resp = await requestUrl({
			url: GITHUB_OAUTH.TOKEN_ENDPOINT,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
			body: JSON.stringify({
				client_id: clientId,
				code,
				redirect_uri: GITHUB_OAUTH.REDIRECT_URI,
				code_verifier: codeVerifier,
			}),
		});

		const data = JSON.parse(resp.text) as {
			access_token?: string;
			refresh_token?: string;
			expires_in?: number;
			error?: string;
			error_description?: string;
		};

		if (data.error || !data.access_token) {
			throw new Error(`Token exchange failed: ${data.error_description ?? data.error ?? 'No access token'}`);
		}

		const username = await this.fetchUsername(data.access_token);

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token ?? '',
			expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : Date.now() + 8 * 60 * 60 * 1000,
			username,
		};
	}

	private async refreshToken(refreshToken: string): Promise<StoredTokens> {
		const resp = await requestUrl({
			url: GITHUB_OAUTH.TOKEN_ENDPOINT,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
			},
			body: JSON.stringify({
				client_id: this.clientId,
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
			}),
		});

		const data = JSON.parse(resp.text) as {
			access_token?: string;
			refresh_token?: string;
			expires_in?: number;
			error?: string;
		};

		if (data.error || !data.access_token) {
			throw new Error(`Token refresh failed: ${data.error ?? 'No access token'}`);
		}

		const username = await this.fetchUsername(data.access_token);
		const tokens: StoredTokens = {
			accessToken: data.access_token,
			refreshToken: data.refresh_token ?? refreshToken,
			expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : Date.now() + 8 * 60 * 60 * 1000,
			username,
		};

		await this.tokenStore.save(tokens);
		return tokens;
	}

	private async fetchUsername(token: string): Promise<string> {
		const resp = await requestUrl({
			url: GITHUB_OAUTH.USER_ENDPOINT,
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github+json',
			},
		});

		const data = JSON.parse(resp.text) as { login: string };
		return data.login;
	}
}
