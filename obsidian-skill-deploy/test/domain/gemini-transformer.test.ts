import { describe, it, expect } from 'vitest';
import { GeminiTransformer } from '../../src/domain/gemini-transformer';
import type { CanonicalFrontmatter } from '../../src/types/skill';

const canonical: CanonicalFrontmatter = {
	name: 'Test Skill',
	description: 'A skill for testing',
	aliases: ['test'],
	tags: ['ai'],
};

describe('GeminiTransformer', () => {
	const transformer = new GeminiTransformer();

	it('pass-through: output equals input', () => {
		const result = transformer.transform(canonical);
		expect(result.frontmatter['name']).toBe(canonical.name);
		expect(result.frontmatter['description']).toBe(canonical.description);
		expect(result.frontmatter['aliases']).toEqual(canonical.aliases);
		expect(result.frontmatter['tags']).toEqual(canonical.tags);
	});

	it('validate: valid result returns isValid=true', () => {
		const result = transformer.transform(canonical);
		const validation = transformer.validate(result);
		expect(validation.isValid).toBe(true);
	});
});
