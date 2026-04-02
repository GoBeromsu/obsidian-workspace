import type { CanonicalFrontmatter } from './skill';

export type ProviderId = 'claude-code' | 'codex' | 'gemini' | 'cursor';

export interface ProviderConfig {
	readonly id: ProviderId;
	readonly name: string;
	readonly enabled: boolean;
	readonly repoUrl: string;
	readonly deployPath: string;
	readonly branch: string;
}

export interface TransformResult {
	readonly frontmatter: Record<string, unknown>;
	readonly isValid: boolean;
	readonly errors: string[];
}

export interface ValidationResult {
	readonly isValid: boolean;
	readonly errors: string[];
}

export interface ProviderTransformer {
	readonly providerId: ProviderId;
	transform(canonical: CanonicalFrontmatter): TransformResult;
	validate(result: TransformResult): ValidationResult;
}

export interface DeployResult {
	readonly providerId: ProviderId;
	readonly success: boolean;
	readonly error?: string;
	readonly commitSha?: string;
}
