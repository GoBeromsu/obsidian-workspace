import type { ProviderId, ProviderTransformer } from '../types/provider';

export class TransformerRegistry {
	private readonly transformers = new Map<ProviderId, ProviderTransformer>();

	register(transformer: ProviderTransformer): void {
		this.transformers.set(transformer.providerId, transformer);
	}

	get(id: ProviderId): ProviderTransformer | undefined {
		return this.transformers.get(id);
	}

	getAll(): ProviderTransformer[] {
		return [...this.transformers.values()];
	}
}
