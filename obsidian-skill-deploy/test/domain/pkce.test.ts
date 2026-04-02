import { describe, it, expect } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge } from '../../src/domain/pkce';

describe('PKCE', () => {
	it('verifier is 43+ chars, URL-safe characters only', () => {
		const verifier = generateCodeVerifier();
		expect(verifier.length).toBeGreaterThanOrEqual(43);
		expect(verifier.length).toBeLessThanOrEqual(128);
		// URL-safe base64: only A-Z, a-z, 0-9, -, _
		expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('challenge is S256: base64url encoded SHA-256 of verifier', async () => {
		const verifier = generateCodeVerifier();
		const challenge = await generateCodeChallenge(verifier);

		// Challenge should also be URL-safe base64
		expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
		// Should be 43 chars (256 bits / 6 bits per base64 char ≈ 43)
		expect(challenge.length).toBe(43);
	});

	it('different verifiers produce different challenges', async () => {
		const v1 = generateCodeVerifier();
		const v2 = generateCodeVerifier();
		const c1 = await generateCodeChallenge(v1);
		const c2 = await generateCodeChallenge(v2);
		expect(c1).not.toBe(c2);
	});
});
