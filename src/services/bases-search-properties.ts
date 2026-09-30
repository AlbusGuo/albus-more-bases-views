import type {
	BasesEntry,
	BasesPropertyId,
	QueryController,
} from 'obsidian';

type ApplySearchQuery = (
	entries: BasesEntry[],
	properties: BasesPropertyId[],
) => BasesEntry[];

interface InternalQueryController extends QueryController {
	applySearchQuery?: ApplySearchQuery;
}

interface SearchPatchState {
	original: ApplySearchQuery;
	hadOwnMethod: boolean;
	providers: Array<() => unknown>;
	wrapper: ApplySearchQuery;
}

const PROPERTY_ID_PATTERN = /^(?:note|file|formula)\./u;
const FILE_NAME_PROPERTY = 'file.basename' as BasesPropertyId;
const patches = new WeakMap<InternalQueryController, SearchPatchState>();

export function attachBasesSearchProperties<Options>(
	controller: QueryController,
	getOptions: () => Options,
): () => void {
	const internal = controller as InternalQueryController;
	let state = patches.get(internal);
	if (!state) {
		const original = internal.applySearchQuery;
		if (typeof original !== 'function') return () => {};
		const providers: Array<() => unknown> = [];
		const wrapper: ApplySearchQuery = (entries, visibleProperties) => {
			let searchProperties = visibleProperties;
			const provider = providers[providers.length - 1];
			if (provider) {
				try {
					searchProperties = mergeSearchProperties(
						visibleProperties,
						provider(),
					);
				} catch {
					// Preserve official search when a view is between config states.
				}
			}
			return original.call(internal, entries, searchProperties);
		};
		state = {
			original,
			hadOwnMethod: Object.prototype.hasOwnProperty.call(
				internal,
				'applySearchQuery',
			),
			providers,
			wrapper,
		};
		patches.set(internal, state);
		internal.applySearchQuery = wrapper;
	}
	state.providers.push(getOptions);
	return () => {
		const current = patches.get(internal);
		if (!current) return;
		const index = current.providers.lastIndexOf(getOptions);
		if (index >= 0) current.providers.splice(index, 1);
		if (current.providers.length) return;
		patches.delete(internal);
		if (internal.applySearchQuery !== current.wrapper) return;
		if (current.hadOwnMethod) internal.applySearchQuery = current.original;
		else delete internal.applySearchQuery;
	};
}

export function getContentSearchProperties(options: unknown): BasesPropertyId[] {
	const properties = new Set<BasesPropertyId>();
	collectOptionPropertyIds(options, properties, new Set<object>());
	if (usesFilenameAsTitle(options)) properties.add(FILE_NAME_PROPERTY);
	return [...properties];
}

function mergeSearchProperties(
	visibleProperties: readonly BasesPropertyId[],
	options: unknown,
): BasesPropertyId[] {
	return [...new Set([
		...visibleProperties,
		...getContentSearchProperties(options),
	])];
}

function collectOptionPropertyIds(
	value: unknown,
	properties: Set<BasesPropertyId>,
	seen: Set<object>,
): void {
	if (!value || typeof value !== 'object' || seen.has(value)) return;
	seen.add(value);
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (key.endsWith('Property')) {
			addPropertyId(item, properties);
		} else if (key === 'properties' && item && typeof item === 'object') {
			for (const property of Object.values(item as Record<string, unknown>)) {
				addPropertyId(property, properties);
			}
		} else if (item && typeof item === 'object' && !Array.isArray(item)) {
			collectOptionPropertyIds(item, properties, seen);
		}
	}
}

function addPropertyId(
	value: unknown,
	properties: Set<BasesPropertyId>,
): void {
	if (typeof value === 'string' && PROPERTY_ID_PATTERN.test(value)) {
		properties.add(value as BasesPropertyId);
	}
}

function usesFilenameAsTitle(options: unknown): boolean {
	if (!options || typeof options !== 'object') return true;
	const record = options as Record<string, unknown>;
	if ('titleProperty' in record) return record.titleProperty === null;
	if ('nameProperty' in record) return record.nameProperty === null;
	const properties = record.properties;
	if (properties && typeof properties === 'object' && 'title' in properties) {
		return (properties as Record<string, unknown>).title === null;
	}
	return true;
}
