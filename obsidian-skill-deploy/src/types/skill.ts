export interface SkillManifest {
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly frontmatter: CanonicalFrontmatter;
	readonly bodyContent: string;
	readonly files: SkillFile[];
}

export interface CanonicalFrontmatter {
	readonly name: string;
	readonly description: string;
	readonly aliases?: string[];
	readonly date_created?: string;
	readonly date_modified?: string;
	readonly tags?: string[];
	readonly [key: string]: unknown;
}

export interface SkillFile {
	readonly relativePath: string;
	readonly content: string;
}
