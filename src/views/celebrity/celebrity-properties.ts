import type { EditablePropertyContext } from '../../ui/editable-properties';
import { createCardPropertyRenderer } from '../shared/card-properties';

export type CelebrityPropertyContext = EditablePropertyContext;

const renderer = createCardPropertyRenderer<CelebrityPropertyContext>('mbv-celebrity-card-body');

export const getCelebrityDetailsSignature = renderer.getSignature;
export const updateCelebrityDetails = renderer.update;
