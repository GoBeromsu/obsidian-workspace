import { GITHUB_OAUTH } from '../domain/github-oauth-config';

type HttpServer = {
	close: () => void;
	listen: (port: number, host: string, callback: () => void) => void;
	on: (event: string, callback: (err: Error) => void) => void;
};

type HttpResponse = {
	writeHead: (statusCode: number, headers?: Record<string, string>) => void;
	end: (data?: string) => void;
};

type HttpRequest = {
	url?: string;
};

export interface OAuthCallbackResponse {
	code: string;
	state: string;
}

export class OAuthCallbackServer {
	private server: HttpServer | null = null;
	private resolveCallback: ((response: OAuthCallbackResponse) => void) | null = null;
	private rejectCallback: ((error: Error) => void) | null = null;

	constructor(private readonly logger: { info: (msg: string) => void; warn: (msg: string) => void }) {}

	async waitForCallback(expectedState: string, timeoutMs: number = 300000): Promise<OAuthCallbackResponse> {
		// eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- http must be loaded via require() in Obsidian's Node context
		const http = require('http') as {
			createServer: (handler: (req: HttpRequest, res: HttpResponse) => void) => HttpServer;
		};

		return new Promise((resolve, reject) => {
			this.resolveCallback = resolve;
			this.rejectCallback = reject;

			const timeout = setTimeout(() => {
				this.stop();
				reject(new Error('OAuth callback timeout — no response received'));
			}, timeoutMs);

			this.server = http.createServer((req: HttpRequest, res: HttpResponse) => {
				this.handleRequest(req, res, expectedState, timeout);
			});

			this.server.on('error', (err: Error) => {
				clearTimeout(timeout);
				this.stop();
				if ((err as Error & { code?: string }).code === 'EADDRINUSE') {
					reject(new Error(`Port ${GITHUB_OAUTH.CALLBACK_PORT} is already in use. Close any application using this port.`));
				} else {
					reject(err);
				}
			});

			this.server.listen(GITHUB_OAUTH.CALLBACK_PORT, '127.0.0.1', () => {
				this.logger.info(`OAuth callback server listening on port ${GITHUB_OAUTH.CALLBACK_PORT}`);
			});
		});
	}

	private handleRequest(
		req: HttpRequest,
		res: HttpResponse,
		expectedState: string,
		timeout: ReturnType<typeof setTimeout>,
	): void {
		const url = new URL(req.url ?? '/', `http://localhost:${GITHUB_OAUTH.CALLBACK_PORT}`);

		if (url.pathname !== GITHUB_OAUTH.CALLBACK_PATH) {
			res.writeHead(404);
			res.end('Not Found');
			return;
		}

		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		const error = url.searchParams.get('error');
		const errorDescription = url.searchParams.get('error_description');

		if (error) {
			clearTimeout(timeout);
			this.sendErrorResponse(res, `OAuth error: ${error} — ${errorDescription ?? 'Unknown error'}`);
			this.rejectCallback?.(new Error(`OAuth error: ${error} — ${errorDescription ?? 'Unknown error'}`));
			this.stop();
			return;
		}

		if (state !== expectedState) {
			clearTimeout(timeout);
			this.sendErrorResponse(res, 'Invalid state parameter — possible CSRF attack');
			this.rejectCallback?.(new Error('Invalid state parameter — possible CSRF attack'));
			this.stop();
			return;
		}

		if (!code) {
			clearTimeout(timeout);
			this.sendErrorResponse(res, 'No authorization code received');
			this.rejectCallback?.(new Error('No authorization code received'));
			this.stop();
			return;
		}

		clearTimeout(timeout);
		this.sendSuccessResponse(res);
		this.resolveCallback?.({ code, state });
		this.stop();
	}

	private sendSuccessResponse(res: HttpResponse): void {
		const html = `<!DOCTYPE html><html><head><title>Authorization Successful</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}.container{text-align:center;background:white;padding:40px 60px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.2)}h1{color:#22c55e;margin-bottom:10px}p{color:#666}</style>
</head><body><div class="container"><h1>Authorization Successful!</h1><p>You can close this window and return to Obsidian.</p></div></body></html>`;
		res.writeHead(200, { 'Content-Type': 'text/html' });
		res.end(html);
	}

	private sendErrorResponse(res: HttpResponse, message: string): void {
		const safeMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
		const html = `<!DOCTYPE html><html><head><title>Authorization Failed</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:linear-gradient(135deg,#f87171 0%,#dc2626 100%)}.container{text-align:center;background:white;padding:40px 60px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.2)}h1{color:#dc2626;margin-bottom:10px}p{color:#666}</style>
</head><body><div class="container"><h1>Authorization Failed</h1><p>${safeMessage}</p><p>Please close this window and try again.</p></div></body></html>`;
		res.writeHead(400, { 'Content-Type': 'text/html' });
		res.end(html);
	}

	stop(): void {
		if (this.server) {
			this.server.close();
			this.server = null;
			this.logger.info('OAuth callback server stopped');
		}
	}
}
