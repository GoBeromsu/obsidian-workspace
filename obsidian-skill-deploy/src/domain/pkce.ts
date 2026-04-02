export interface PKCEPair {
	codeVerifier: string;
	codeChallenge: string;
}

export function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return base64UrlEncode(new Uint8Array(digest));
}

export function generateState(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

export async function generatePKCEChallenge(): Promise<PKCEPair> {
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	return { codeVerifier, codeChallenge };
}

function base64UrlEncode(buffer: Uint8Array): string {
	const base64 = btoa(String.fromCharCode(...buffer));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
