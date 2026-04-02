import { describe, it, expect } from 'vitest';
import { discoverSkills, type VaultFileListing } from '../../src/domain/skill-discovery';

const validSkillMd = `---
name: My Skill
description: Does something useful
tags:
  - ai
---
# My Skill

This is the body.`;

describe('discoverSkills', () => {
	it('finds folders containing SKILL.md', () => {
		const folders: VaultFileListing[] = [
			{
				folderPath: 'tools/my-skill',
				folderName: 'my-skill',
				files: [
					{ relativePath: 'SKILL.md', content: validSkillMd },
					{ relativePath: 'helper.md', content: '# Helper' },
				],
			},
		];

		const skills = discoverSkills(folders);
		expect(skills).toHaveLength(1);
		expect(skills[0]?.id).toBe('my-skill');
		expect(skills[0]?.name).toBe('My Skill');
		expect(skills[0]?.files).toHaveLength(2);
	});

	it('ignores non-skill folders (no SKILL.md)', () => {
		const folders: VaultFileListing[] = [
			{
				folderPath: 'tools/not-a-skill',
				folderName: 'not-a-skill',
				files: [
					{ relativePath: 'README.md', content: '# Readme' },
				],
			},
		];

		const skills = discoverSkills(folders);
		expect(skills).toHaveLength(0);
	});

	it('skips folders with invalid SKILL.md (no frontmatter)', () => {
		const folders: VaultFileListing[] = [
			{
				folderPath: 'tools/broken',
				folderName: 'broken',
				files: [
					{ relativePath: 'SKILL.md', content: 'No frontmatter here' },
				],
			},
		];

		const skills = discoverSkills(folders);
		expect(skills).toHaveLength(0);
	});
});
