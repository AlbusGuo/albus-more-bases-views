import type { EditablePropertyContext } from '../../ui/editable-properties';
import { createCardPropertyRenderer } from '../shared/card-properties';

export type MediaPropertyContext = EditablePropertyContext;

const renderer = createCardPropertyRenderer<MediaPropertyContext>('mbv-media-card-body');

export const getMediaDetailsSignature = renderer.getSignature;
export const updateMediaDetails = renderer.update;
