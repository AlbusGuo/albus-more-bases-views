import type { EditablePropertyContext } from '../../ui/editable-properties';
import { createCardPropertyRenderer } from '../shared/card-properties';

export type GamePropertyContext = EditablePropertyContext;

const renderer = createCardPropertyRenderer<GamePropertyContext>('mbv-game-card-body');

export const getGameDetailsSignature = renderer.getSignature;
export const updateGameDetails = renderer.update;
