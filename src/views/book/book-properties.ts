import type { EditablePropertyContext } from '../../ui/editable-properties';
import { createCardPropertyRenderer } from '../shared/card-properties';

export type BookPropertyContext = EditablePropertyContext;

const renderer = createCardPropertyRenderer<BookPropertyContext>('mbv-book-card-body');

export const getVisibleTitle = renderer.getTitle;
export const getDetailsSignature = renderer.getSignature;
export const updateBookDetails = renderer.update;
