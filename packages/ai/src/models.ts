import { MODELS } from "./models.generated.js";
import type { Api, KnownProvider, Model, Usage } from "./types.js";

const modelRegistry: Map<string, Map<string, Model<Api>>> = new Map();

// Initialize registry from MODELS on module load
for (const [provider, models] of Object.entries(MODELS)) {
	const providerModels = new Map<string, Model<Api>>();
	for (const [id, model] of Object.entries(models)) {
		providerModels.set(id, model as Model<Api>);
	}
	modelRegistry.set(provider, providerModels);
}

interface ModelFallbackAlias {
	provider: "minimax" | "minimax-cn";
	id: string;
	name: string;
}

const MINIMAX_FALLBACK_SOURCE_IDS = ["MiniMax-M2.5", "MiniMax-M2.1", "MiniMax-M2"] as const;

const MINIMAX_FALLBACK_ALIASES: readonly ModelFallbackAlias[] = [
	{ provider: "minimax", id: "MiniMax-M2.7", name: "MiniMax-M2.7" },
	{ provider: "minimax-cn", id: "MiniMax-M2.7", name: "MiniMax-M2.7" },
];

function registerModelFallbackAliases(): void {
	for (const alias of MINIMAX_FALLBACK_ALIASES) {
		const providerModels = modelRegistry.get(alias.provider);
		if (!providerModels || providerModels.has(alias.id)) {
			continue;
		}

		const sourceModel = MINIMAX_FALLBACK_SOURCE_IDS
			.map((modelId) => providerModels.get(modelId))
			.find((model): model is Model<Api> => model !== undefined);

		if (!sourceModel) {
			continue;
		}

		providerModels.set(alias.id, {
			...sourceModel,
			id: alias.id,
			name: alias.name,
		});
	}
}

registerModelFallbackAliases();

type ModelApi<
	TProvider extends KnownProvider,
	TModelId extends keyof (typeof MODELS)[TProvider],
> = (typeof MODELS)[TProvider][TModelId] extends { api: infer TApi } ? (TApi extends Api ? TApi : never) : never;

export function getModel<TProvider extends KnownProvider, TModelId extends keyof (typeof MODELS)[TProvider]>(
	provider: TProvider,
	modelId: TModelId,
): Model<ModelApi<TProvider, TModelId>> {
	const providerModels = modelRegistry.get(provider);
	return providerModels?.get(modelId as string) as Model<ModelApi<TProvider, TModelId>>;
}

export function getProviders(): KnownProvider[] {
	return Array.from(modelRegistry.keys()) as KnownProvider[];
}

export function getModels<TProvider extends KnownProvider>(
	provider: TProvider,
): Model<ModelApi<TProvider, keyof (typeof MODELS)[TProvider]>>[] {
	const models = modelRegistry.get(provider);
	return models ? (Array.from(models.values()) as Model<ModelApi<TProvider, keyof (typeof MODELS)[TProvider]>>[]) : [];
}

export function calculateCost<TApi extends Api>(model: Model<TApi>, usage: Usage): Usage["cost"] {
	usage.cost.input = (model.cost.input / 1000000) * usage.input;
	usage.cost.output = (model.cost.output / 1000000) * usage.output;
	usage.cost.cacheRead = (model.cost.cacheRead / 1000000) * usage.cacheRead;
	usage.cost.cacheWrite = (model.cost.cacheWrite / 1000000) * usage.cacheWrite;
	usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
	return usage.cost;
}

/**
 * Check if a model supports xhigh thinking level.
 *
 * Supported today:
 * - GPT-5.2 / GPT-5.3 / GPT-5.4 model families
 * - Opus 4.6 models (xhigh maps to adaptive effort "max" on Anthropic-compatible providers)
 */
export function supportsXhigh<TApi extends Api>(model: Model<TApi>): boolean {
	if (model.id.includes("gpt-5.2") || model.id.includes("gpt-5.3") || model.id.includes("gpt-5.4")) {
		return true;
	}

	if (model.id.includes("opus-4-6") || model.id.includes("opus-4.6")) {
		return true;
	}

	return false;
}

/**
 * Check if two models are equal by comparing both their id and provider.
 * Returns false if either model is null or undefined.
 */
export function modelsAreEqual<TApi extends Api>(
	a: Model<TApi> | null | undefined,
	b: Model<TApi> | null | undefined,
): boolean {
	if (!a || !b) return false;
	return a.id === b.id && a.provider === b.provider;
}
