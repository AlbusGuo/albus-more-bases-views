import type { EditablePropertyContext } from '../../ui/editable-properties';
import { createCardPropertyRenderer } from '../shared/card-properties';

export type OperatorPropertyContext = EditablePropertyContext;

const renderer = createCardPropertyRenderer<OperatorPropertyContext>('mbv-operator-card-body');

export const getOperatorDetailsSignature = renderer.getSignature;
export const updateOperatorDetails = renderer.update;
