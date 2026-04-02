import { describe, it, expect } from 'vitest';
import { ClaudeTransformer } from '../../src/domain/claude-transformer';
import type { CanonicalFrontmatter } from '../../src/types/skill';

const canonical: CanonicalFrontmatter = {
	name: 'Test Skill',
	description: 'A skill for testing',
	aliases: ['test', 'tester'],
	date_created: '2026-01-01',
	date_modified: '2026-04-02',
	tags: ['ai', 'tools'],
};

describe('ClaudeTransformer', () => {
	const transformer = new ClaudeTransformer();

	it('pass-through: output equals input for all canonical fields', () => {
		const result = transformer.transform(canonical);
		expect(result.frontmatter['name']).toBe(canonical.name);
		expect(result.frontmatter['description']).toBe(canonical.description);
		expect(result.frontmatter['aliases']).toEqual(canonical.aliases);
		expect(result.frontmatter['date_created']).toBe(canonical.date_created);
		expect(result.frontmatter['tags']).toEqual(canonical.tags);
	});

	it('validate: missing name returns isValid=false', () => {
		const result = { frontmatter: { description: 'desc' }, isValid: true, errors: [] as string[] };
		const validation = transformer.validate(result);
		expect(validation.isValid).toBe(false);
		expect(validation.errors).toContain('name required');
	});

	it('validate: valid result returns isValid=true', () => {
		const result = transformer.transform(canonical);
		const validation = transformer.validate(result);
		expect(validation.isValid).toBe(true);
		expect(validation.errors).toHaveLength(0);
	});
});
