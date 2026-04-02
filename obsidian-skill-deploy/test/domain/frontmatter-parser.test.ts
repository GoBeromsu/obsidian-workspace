import { describe, it, expect } from 'vitest';
import { parseFrontmatter, serializeFrontmatter } from '../../src/domain/frontmatter-parser';

describe('parseFrontmatter', () => {
	it('extracts name, description, aliases, dates, tags from valid YAML', () => {
		const content = `---
name: My Skill
description: A test skill
aliases:
  - skill-a
  - skill-b
date_created: 2026-01-01
date_modified: 2026-04-02
tags:
  - ai
  - tools
---
Body content here.`;

		const result = parseFrontmatter(content);
		expect(result.frontmatter.name).toBe('My Skill');
		expect(result.frontmatter.description).toBe('A test skill');
		expect(result.frontmatter.aliases).toEqual(['skill-a', 'skill-b']);
		expect(result.frontmatter.date_created).toBe('2026-01-01');
		expect(result.frontmatter.date_modified).toBe('2026-04-02');
		expect(result.frontmatter.tags).toEqual(['ai', 'tools']);
		expect(result.body).toBe('Body content here.');
	});

	it('preserves unknown fields in canonical format', () => {
		const content = `---
name: Skill
description: Desc
custom_field: hello
another: 42
---
Body`;

		const result = parseFrontmatter(content);
		expect(result.frontmatter['custom_field']).toBe('hello');
		expect(result.frontmatter['another']).toBe(42);
	});

	it('throws when no frontmatter found', () => {
		expect(() => parseFrontmatter('No frontmatter here')).toThrow('No YAML frontmatter found');
	});

	it('throws when name is missing', () => {
		const content = `---
description: Desc only
---
Body`;
		expect(() => parseFrontmatter(content)).toThrow('name');
	});

	it('throws when description is missing', () => {
		const content = `---
name: Skill
---
Body`;
		expect(() => parseFrontmatter(content)).toThrow('description');
	});
});

describe('serializeFrontmatter', () => {
	it('round-trips parse → serialize → parse', () => {
		const original = `---
name: My Skill
description: A test skill
tags:
  - ai
  - tools
---
Body content here.`;

		const parsed = parseFrontmatter(original);
		const serialized = serializeFrontmatter(parsed.frontmatter as Record<string, unknown>, parsed.body);
		const reparsed = parseFrontmatter(serialized);

		expect(reparsed.frontmatter.name).toBe(parsed.frontmatter.name);
		expect(reparsed.frontmatter.description).toBe(parsed.frontmatter.description);
		expect(reparsed.frontmatter.tags).toEqual(parsed.frontmatter.tags);
		expect(reparsed.body).toBe(parsed.body);
	});
});
