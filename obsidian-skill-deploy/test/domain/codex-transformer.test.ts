import { describe, it, expect } from 'vitest';
import { CodexTransformer } from '../../src/domain/codex-transformer';
import type { CanonicalFrontmatter } from '../../src/types/skill';

const canonical: CanonicalFrontmatter = {
	name: 'Test Skill',
	description: 'A skill for testing',
	aliases: ['test'],
	date_created: '2026-01-01',
	date_modified: '2026-04-02',
	tags: ['ai'],
};

describe('CodexTransformer', () => {
	const transformer = new CodexTransformer();

	it('strips all fields except name and description', () => {
		const result = transformer.transform(canonical);
		expect(result.frontmatter['name']).toBe('Test Skill');
		expect(result.frontmatter['description']).toBe('A skill for testing');
		expect(result.frontmatter['aliases']).toBeUndefined();
		expect(result.frontmatter['date_created']).toBeUndefined();
		expect(result.frontmatter['date_modified']).toBeUndefined();
		expect(result.frontmatter['tags']).toBeUndefined();
	});

	it('validate: missing description returns isValid=false', () => {
		const result = { frontmatter: { name: 'Test' }, isValid: true, errors: [] as string[] };
		const validation = transformer.validate(result);
		expect(validation.isValid).toBe(false);
		expect(validation.errors).toContain('description required');
	});
});
