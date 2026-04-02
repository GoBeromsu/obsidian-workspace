import type { CanonicalFrontmatter } from '../types/skill';
import type { ProviderTransformer, TransformResult, ValidationResult } from '../types/provider';

export class CursorTransformer implements ProviderTransformer {
	readonly providerId = 'cursor' as const;

	transform(canonical: CanonicalFrontmatter): TransformResult {
		const frontmatter: Record<string, unknown> = {
			name: canonical.name,
			description: canonical.description,
			metadata: { version: '1.0.0' },
		};
		return { frontmatter, isValid: true, errors: [] };
	}

	validate(result: TransformResult): ValidationResult {
		const errors: string[] = [];
		if (!result.frontmatter['name']) errors.push('name required');
		if (!result.frontmatter['description']) errors.push('description required');
		const metadata = result.frontmatter['metadata'] as Record<string, unknown> | undefined;
		if (!metadata?.['version']) errors.push('metadata.version required');
		return { isValid: errors.length === 0, errors };
	}
}
