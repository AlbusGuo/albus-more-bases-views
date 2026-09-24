import type { EditablePropertyContext } from '../../ui/editable-properties';
import { createCardPropertyRenderer } from '../shared/card-properties';

export type PaperPropertyContext = EditablePropertyContext;

const renderer = createCardPropertyRenderer<PaperPropertyContext>('mbv-paper-card-body');

export const getPaperDetailsSignature = renderer.getSignature;
export const updatePaperDetails = renderer.update;
