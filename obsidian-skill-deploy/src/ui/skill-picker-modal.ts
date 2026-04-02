import { App, FuzzySuggestModal } from 'obsidian';
import type { SkillManifest } from '../types/skill';

export class SkillPickerModal extends FuzzySuggestModal<SkillManifest> {
	private onChooseCallback: ((skill: SkillManifest) => void) | null = null;

	constructor(app: App, private readonly skills: SkillManifest[]) {
		super(app);
		this.setPlaceholder('Select a skill to deploy...');
	}

	getItems(): SkillManifest[] {
		return this.skills;
	}

	getItemText(skill: SkillManifest): string {
		return `${skill.name} (${skill.id})`;
	}

	onChooseItem(skill: SkillManifest): void {
		this.onChooseCallback?.(skill);
	}

	onSelect(callback: (skill: SkillManifest) => void): SkillPickerModal {
		this.onChooseCallback = callback;
		return this;
	}
}
