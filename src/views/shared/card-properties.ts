import type { EditablePropertyContext } from '../../ui/editable-properties';
import {
	getVisiblePropertiesSignature,
	getVisiblePropertyTitle,
	updateEditableProperties,
} from '../../ui/editable-properties';

export interface CardPropertyRenderer<Context extends EditablePropertyContext> {
	getTitle: (context: Context) => string;
	getSignature: (context: Context) => string;
	update: (cardEl: HTMLElement, context: Context) => void;
}

export function createCardPropertyRenderer<
	Context extends EditablePropertyContext,
>(bodyClass: string): CardPropertyRenderer<Context> {
	const classes = {
		body: `${bodyClass} mbv-card-details`,
		title: 'mbv-card-property-title',
		list: 'mbv-card-properties',
		property: 'mbv-card-property',
		editable: 'mbv-card-property-editable',
	};
	return {
		getTitle: (context) => getVisiblePropertyTitle(context),
		getSignature: (context) => getVisiblePropertiesSignature(context),
		update: (cardEl, context) => updateEditableProperties(cardEl, context, classes),
	};
}
