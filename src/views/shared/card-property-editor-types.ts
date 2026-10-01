import type {
	BasesEntry,
	BasesPropertyId,
} from 'obsidian';
import type { InteractiveCardController } from './card-interaction';

export type CardPropertyFieldKind =
	| 'text'
	| 'number'
	| 'date'
	| 'datetime'
	| 'image'
	| 'pdf'
	| 'list'
	| 'boolean'
	| 'reading-status'
	| 'select';

export interface CardPropertyEditorField<Options> {
	id: string;
	name: string;
	description?: string;
	placeholder?: string;
	kind?: CardPropertyFieldKind;
	options?: readonly string[];
	normalize?: (value: unknown) => string;
	property: (options: Options) => BasesPropertyId | null;
	filenameFallback?: boolean;
}

export interface CardPropertyEditorDefinition<Options> {
	title: string;
	fields: readonly CardPropertyEditorField<Options>[];
}

export interface CardPropertyPreviewController {
	element: HTMLElement;
	update: (entry: BasesEntry) => void;
	destroy?: () => void;
	interactive?: InteractiveCardController;
}

export type CardPropertyPreviewFactory = (
	ownerEl: HTMLElement,
	entry: BasesEntry,
) => CardPropertyPreviewController;
