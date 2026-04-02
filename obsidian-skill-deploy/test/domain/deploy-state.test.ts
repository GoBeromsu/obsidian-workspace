import { describe, it, expect } from 'vitest';
import { hasConflict, isFirstDeploy } from '../../src/domain/deploy-state';

describe('hasConflict', () => {
	it('no conflict when remote SHA equals lastDeploy SHA', () => {
		expect(hasConflict('abc123', 'abc123')).toBe(false);
	});

	it('conflict when remote SHA differs from lastDeploy SHA', () => {
		expect(hasConflict('abc123', 'def456')).toBe(true);
	});

	it('conflict when both changed (remote !== lastDeploy)', () => {
		expect(hasConflict('remote-changed', 'last-known')).toBe(true);
	});

	it('no conflict when local changed but remote unchanged', () => {
		// Remote still matches our last known SHA — safe to deploy
		expect(hasConflict('same-sha', 'same-sha')).toBe(false);
	});
});

describe('isFirstDeploy', () => {
	it('returns true when lastDeployTreeSha is empty', () => {
		expect(isFirstDeploy('')).toBe(true);
	});

	it('returns true when lastDeployTreeSha is null', () => {
		expect(isFirstDeploy(null)).toBe(true);
	});

	it('returns true when lastDeployTreeSha is undefined', () => {
		expect(isFirstDeploy(undefined)).toBe(true);
	});

	it('returns false when lastDeployTreeSha has a value', () => {
		expect(isFirstDeploy('abc123')).toBe(false);
	});
});
