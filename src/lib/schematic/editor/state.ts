/**
 * Editor state types for SchematicCanvas
 * Consolidates all editor state into a single, well-typed structure
 */

import type { Point, ViewTransform, GridSettings, ComponentType, Rotation, WireDirection } from '../types';

/**
 * Selection state - tracks what is currently selected
 */
export interface SelectionState {
	componentIds: Set<string>;
	wireIds: Set<string>;
	directiveIds: Set<string>;
}

/**
 * Mode-specific state using discriminated union
 * Each mode can have its own state shape
 */
export type ModeState =
	| { type: 'idle' }
	| { type: 'delete' }
	| { type: 'duplicate' }
	| { type: 'placing'; componentType: ComponentType; rotation: Rotation; mirror: boolean }
	| { type: 'drawing-wire'; startPoint: Point; direction: WireDirection }
	| { type: 'moving'; startPos: Point }
	| { type: 'probing'; phase: 'idle' | 'holding-first'; firstNode?: Point; firstNodeName?: string; targetComponentId?: string }
	| { type: 'dragging-view'; startScreenPos: Point };

/**
 * Consolidated editor state
 */
export interface EditorState {
	// View transform
	view: ViewTransform;
	grid: GridSettings;

	// Current mouse position (schematic coordinates)
	mousePos: Point;
	schematicPos: Point;

	// Selection
	selection: SelectionState;

	// Mode-specific state
	modeState: ModeState;

	// Component instance counters for generating unique IDs
	componentCounters: Record<string, number>;
}

/**
 * Create initial editor state
 */
export function createInitialEditorState(): EditorState {
	return {
		view: {
			offsetX: 0,
			offsetY: 0,
			scale: 1
		},
		grid: {
			size: 10,
			snapEnabled: true,
			visible: true
		},
		mousePos: { x: 0, y: 0 },
		schematicPos: { x: 0, y: 0 },
		selection: {
			componentIds: new Set(),
			wireIds: new Set(),
			directiveIds: new Set()
		},
		modeState: { type: 'idle' },
		componentCounters: {}
	};
}

/**
 * Get the current editor mode from mode state
 */
export function getEditorMode(modeState: ModeState): string {
	switch (modeState.type) {
		case 'idle':
			return 'select';
		case 'delete':
			return 'delete';
		case 'duplicate':
			return 'duplicate';
		case 'placing':
			return 'place';
		case 'drawing-wire':
			return 'wire';
		case 'moving':
			return 'move';
		case 'probing':
			return 'probe';
		case 'dragging-view':
			return 'select'; // Dragging view is a sub-state of select
		default:
			return 'select';
	}
}

/**
 * Check if any items are selected
 */
export function hasSelection(selection: SelectionState): boolean {
	return selection.componentIds.size > 0 ||
		selection.wireIds.size > 0 ||
		selection.directiveIds.size > 0;
}

/**
 * Get total selection count
 */
export function getSelectionCount(selection: SelectionState): number {
	return selection.componentIds.size +
		selection.wireIds.size +
		selection.directiveIds.size;
}

/**
 * Create empty selection
 */
export function emptySelection(): SelectionState {
	return {
		componentIds: new Set(),
		wireIds: new Set(),
		directiveIds: new Set()
	};
}

