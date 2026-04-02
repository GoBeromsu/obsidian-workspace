import type { SkillManifest, SkillFile } from '../types/skill';
import { parseFrontmatter } from './frontmatter-parser';

export interface VaultFileListing {
	readonly folderPath: string;
	readonly folderName: string;
	readonly files: SkillFile[];
}

export function discoverSkills(folders: VaultFileListing[]): SkillManifest[] {
	const skills: SkillManifest[] = [];

	for (const folder of folders) {
		const skillMd = folder.files.find(f => f.relativePath === 'SKILL.md');
		if (!skillMd) continue;

		try {
			const { frontmatter, body } = parseFrontmatter(skillMd.content);
			skills.push({
				id: folder.folderName,
				name: frontmatter.name,
				path: folder.folderPath,
				frontmatter,
				bodyContent: body,
				files: folder.files,
			});
		} catch {
			// Skip folders with invalid SKILL.md
		}
	}

	return skills;
}
