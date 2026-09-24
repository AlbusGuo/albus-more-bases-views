import type { EditablePropertyContext } from '../../ui/editable-properties';
import { createCardPropertyRenderer } from '../shared/card-properties';

export type MoviePropertyContext = EditablePropertyContext;

const renderer = createCardPropertyRenderer<MoviePropertyContext>('mbv-movie-card-body');

export const getMovieDetailsSignature = renderer.getSignature;
export const updateMovieDetails = renderer.update;
