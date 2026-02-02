/**
 * Editor actions - all possible state transitions
 * Uses discriminated union for type-safe action handling
 */

import type { Point, ComponentType, Rotation, WireDirection, Component, Wire, Junction } from '../types';

/**
 * Selection target - what was clicked
 */
export interface SelectionTarget {
	componentId?: string;
	wireId?: string;
	directiveId?: string;
}

/**
 * Items to delete
 */
export interface DeleteTarget {
	componentIds: string[];
	wireIds: string[];
	junctionIds: string[];
	directiveIds: string[];
}

/**
 * All possible editor actions
 */
export type EditorAction =
	// View actions
	| { type: 'PAN'; dx: number; dy: number }
	| { type: 'ZOOM'; factor: number; center: Point }
	| { type: 'RESET_VIEW'; canvasWidth: number; canvasHeight: number }
	| { type: 'TOGGLE_GRID' }

	// Mouse position update
	| { type: 'UPDATE_MOUSE_POS'; screenPos: Point; schematicPos: Point }

	// Mode actions
	| { type: 'SET_MODE'; mode: 'select' | 'wire' | 'delete' | 'duplicate' | 'move' | 'probe' }
	| { type: 'START_PLACING'; componentType: ComponentType }
	| { type: 'CANCEL' }

	// Selection actions
	| { type: 'SELECT'; target: SelectionTarget; additive: boolean }
	| { type: 'CLEAR_SELECTION' }

	// Placement actions
	| { type: 'ROTATE_PLACING' }
	| { type: 'MIRROR_PLACING' }
	| { type: 'PLACE_COMPONENT' }

	// Selected item actions
	| { type: 'ROTATE_SELECTED' }
	| { type: 'MIRROR_SELECTED' }
	| { type: 'DELETE_SELECTED' }
	| { type: 'DELETE_AT'; target: DeleteTarget }

	// Wire drawing actions
	| { type: 'START_WIRE'; point: Point }
	| { type: 'COMMIT_WIRE_SEGMENT'; endPoint: Point }
	| { type: 'TOGGLE_WIRE_DIRECTION' }

	// Move actions
	| { type: 'START_MOVE'; startPos: Point }
	| { type: 'MOVE_SELECTED'; delta: Point }
	| { type: 'END_MOVE' }

	// View dragging
	| { type: 'START_VIEW_DRAG'; screenPos: Point }
	| { type: 'END_VIEW_DRAG' }

	// Duplicate action
	| { type: 'DUPLICATE_AT'; pos: Point; componentId?: string; wireId?: string }

	// Probe actions
	| { type: 'PROBE_START'; pos: Point; nodeName: string | null; componentId?: string }
	| { type: 'PROBE_COMPLETE'; pos: Point; nodeName: string | null }

	// Junction actions
	| { type: 'CREATE_JUNCTION'; pos: Point };

/**
 * Type guard helpers for action categories
 */
export function isViewAction(action: EditorAction): boolean {
	return ['PAN', 'ZOOM', 'RESET_VIEW', 'TOGGLE_GRID'].includes(action.type);
}

export function isSelectionAction(action: EditorAction): boolean {
	return ['SELECT', 'CLEAR_SELECTION'].includes(action.type);
}

export function isModeAction(action: EditorAction): boolean {
	return ['SET_MODE', 'START_PLACING', 'CANCEL'].includes(action.type);
}

export function isSchematicMutation(action: EditorAction): boolean {
	return [
		'PLACE_COMPONENT',
		'DELETE_SELECTED',
		'DELETE_AT',
		'COMMIT_WIRE_SEGMENT',
		'MOVE_SELECTED',
		'ROTATE_SELECTED',
		'MIRROR_SELECTED',
		'DUPLICATE_AT',
		'CREATE_JUNCTION'
	].includes(action.type);
}

