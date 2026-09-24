import type { EditablePropertyContext } from '../../ui/editable-properties';
import { createCardPropertyRenderer } from '../shared/card-properties';

export type ProjectPropertyContext = EditablePropertyContext;

const renderer = createCardPropertyRenderer<ProjectPropertyContext>('mbv-project-card-body');

export const getProjectDetailsSignature = renderer.getSignature;
export const updateProjectDetails = renderer.update;
