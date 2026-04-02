export const GITHUB_OAUTH = {
	AUTHORIZATION_ENDPOINT: 'https://github.com/login/oauth/authorize',
	TOKEN_ENDPOINT: 'https://github.com/login/oauth/access_token',
	USER_ENDPOINT: 'https://api.github.com/user',
	SCOPES: 'repo',
	CALLBACK_PORT: 27549,
	CALLBACK_PATH: '/auth/callback',
	get REDIRECT_URI() { return `http://localhost:${this.CALLBACK_PORT}${this.CALLBACK_PATH}`; },
} as const;
