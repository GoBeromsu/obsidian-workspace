import { describe, it, expect } from 'vitest';
import { CursorTransformer } from '../../src/domain/cursor-transformer';
import type { CanonicalFrontmatter } from '../../src/types/skill';

const canonical: CanonicalFrontmatter = {
	name: 'Test Skill',
	description: 'A skill for testing',
	aliases: ['test'],
	date_created: '2026-01-01',
	tags: ['ai'],
};

describe('CursorTransformer', () => {
	const transformer = new CursorTransformer();

	it('restructures: has metadata.version, no aliases/dates/tags', () => {
		const result = transformer.transform(canonical);
		expect(result.frontmatter['name']).toBe('Test Skill');
		expect(result.frontmatter['description']).toBe('A skill for testing');
		expect(result.frontmatter['metadata']).toEqual({ version: '1.0.0' });
		expect(result.frontmatter['aliases']).toBeUndefined();
		expect(result.frontmatter['date_created']).toBeUndefined();
		expect(result.frontmatter['tags']).toBeUndefined();
	});

	it('validate: missing metadata.version returns isValid=false', () => {
		const result = { frontmatter: { name: 'Test', description: 'Desc' }, isValid: true, errors: [] as string[] };
		const validation = transformer.validate(result);
		expect(validation.isValid).toBe(false);
		expect(validation.errors).toContain('metadata.version required');
	});

	it('validate: valid result with metadata returns isValid=true', () => {
		const result = transformer.transform(canonical);
		const validation = transformer.validate(result);
		expect(validation.isValid).toBe(true);
	});
});
