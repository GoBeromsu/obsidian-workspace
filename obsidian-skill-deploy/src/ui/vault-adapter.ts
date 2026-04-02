import { App, TFile, TFolder } from 'obsidian';
import type { SkillFile } from '../types/skill';
import type { VaultFileListing } from '../domain/skill-discovery';

export class VaultAdapter {
	constructor(private readonly app: App) {}

	async listSkillFolders(rootPath: string): Promise<VaultFileListing[]> {
		const root = this.app.vault.getAbstractFileByPath(rootPath);
		if (!root || !(root instanceof TFolder)) return [];

		const results: VaultFileListing[] = [];

		for (const child of root.children) {
			if (!(child instanceof TFolder)) continue;
			const files = await this.readSkillFiles(child);
			results.push({
				folderPath: child.path,
				folderName: child.name,
				files,
			});
		}

		return results;
	}

	private async readSkillFiles(folder: TFolder): Promise<SkillFile[]> {
		const files: SkillFile[] = [];

		for (const child of folder.children) {
			if (!(child instanceof TFile)) continue;
			const content = await this.app.vault.read(child);
			files.push({
				relativePath: child.name,
				content,
			});
		}

		return files;
	}
}
