import type { EditablePropertyContext } from '../../ui/editable-properties';
import { createCardPropertyRenderer } from '../shared/card-properties';

export type CardPropertyContext = EditablePropertyContext;

const renderer = createCardPropertyRenderer<CardPropertyContext>(
	'mbv-collectible-card-details',
);

export const getCardDetailsSignature = renderer.getSignature;
export const updateCardDetails = renderer.update;
