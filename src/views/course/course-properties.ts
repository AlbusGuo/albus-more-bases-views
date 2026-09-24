import type { EditablePropertyContext } from '../../ui/editable-properties';
import { createCardPropertyRenderer } from '../shared/card-properties';

export type CoursePropertyContext = EditablePropertyContext;

const renderer = createCardPropertyRenderer<CoursePropertyContext>('mbv-course-card-body');

export const getCourseDetailsSignature = renderer.getSignature;
export const updateCourseDetails = renderer.update;
