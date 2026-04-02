import type { CanonicalFrontmatter } from '../types/skill';
import type { ProviderTransformer, TransformResult, ValidationResult } from '../types/provider';

export class ClaudeTransformer implements ProviderTransformer {
	readonly providerId = 'claude-code' as const;

	transform(canonical: CanonicalFrontmatter): TransformResult {
		const frontmatter: Record<string, unknown> = { ...canonical };
		return { frontmatter, isValid: true, errors: [] };
	}

	validate(result: TransformResult): ValidationResult {
		const errors: string[] = [];
		if (!result.frontmatter['name']) errors.push('name required');
		if (!result.frontmatter['description']) errors.push('description required');
		return { isValid: errors.length === 0, errors };
	}
}
