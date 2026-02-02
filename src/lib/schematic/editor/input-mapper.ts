/**
 * Input mapper - translates DOM events into editor actions
 */

import type { Point, Component, Wire, Junction, SpiceDirective } from '../types';
import type { EditorState } from './state';
import type { EditorAction } from './actions';
import { MODE_SHORTCUTS, getModeName } from '../types';
import { getComponentByShortcut } from '../component-defs';

/**
 * Hit test result - what's under the cursor
 */
export interface HitTestResult {
	component?: Component;
	wire?: Wire;
	junction?: Junction;
	directive?: SpiceDirective;
}

/**
 * Map mouse down event to actions
 */
export function mapMouseDown(
	e: MouseEvent,
	state: EditorState,
	schematicPos: Point,
	snappedPos: Point,
	hitTest: HitTestResult
): EditorAction[] {
	const actions: EditorAction[] = [];

	if (e.button === 0) { // Left click
		const modeType = state.modeState.type;

		// Wire mode
		if (modeType === 'drawing-wire') {
			if (state.modeState.type === 'drawing-wire' && state.modeState.startPoint.x === 0 && state.modeState.startPoint.y === 0) {
				// First click - start wire
				actions.push({ type: 'START_WIRE', point: snappedPos });
			} else {
				// Subsequent click - commit segment
				actions.push({ type: 'COMMIT_WIRE_SEGMENT', endPoint: snappedPos });
			}
			return actions;
		}

		// Idle mode with delete intent (mode set to delete via keyboard)
		if (modeType === 'idle') {
			// Check for selection
			if (hitTest.directive) {
				actions.push({
					type: 'SELECT',
					target: { directiveId: hitTest.directive.id },
					additive: e.shiftKey
				});
			} else if (hitTest.component) {
				actions.push({
					type: 'SELECT',
					target: { componentId: hitTest.component.id },
					additive: e.shiftKey
				});
			} else if (hitTest.wire) {
				actions.push({
					type: 'SELECT',
					target: { wireId: hitTest.wire.id },
					additive: e.shiftKey
				});
			} else if (!e.shiftKey) {
				actions.push({ type: 'CLEAR_SELECTION' });
			}
			// Prepare for potential view drag
			actions.push({ type: 'START_VIEW_DRAG', screenPos: { x: e.offsetX, y: e.offsetY } });
			return actions;
		}

		// Placing mode
		if (modeType === 'placing') {
			actions.push({ type: 'PLACE_COMPONENT' });
			return actions;
		}

		// Moving mode
		if (modeType === 'moving') {
			// Select item under cursor and start move
			if (hitTest.component && !state.selection.componentIds.has(hitTest.component.id)) {
				actions.push({
					type: 'SELECT',
					target: { componentId: hitTest.component.id },
					additive: e.shiftKey
				});
			} else if (hitTest.wire && !state.selection.wireIds.has(hitTest.wire.id)) {
				actions.push({
					type: 'SELECT',
					target: { wireId: hitTest.wire.id },
					additive: e.shiftKey
				});
			} else if (hitTest.directive && !state.selection.directiveIds.has(hitTest.directive.id)) {
				actions.push({
					type: 'SELECT',
					target: { directiveId: hitTest.directive.id },
					additive: e.shiftKey
				});
			}
			actions.push({ type: 'START_MOVE', startPos: snappedPos });
			return actions;
		}

		// Probing mode
		if (modeType === 'probing') {
			const nodeName = null; // Will be resolved by caller
			if (hitTest.component && hitTest.component.type !== 'ground') {
				actions.push({
					type: 'PROBE_START',
					pos: snappedPos,
					nodeName,
					componentId: hitTest.component.id
				});
			} else if (hitTest.wire) {
				actions.push({
					type: 'PROBE_START',
					pos: snappedPos,
					nodeName
				});
			}
			return actions;
		}
	} else if (e.button === 1) { // Middle click - always pan
		actions.push({ type: 'START_VIEW_DRAG', screenPos: { x: e.offsetX, y: e.offsetY } });
	}

	return actions;
}

/**
 * Map mouse move event to actions
 */
export function mapMouseMove(
	e: MouseEvent,
	state: EditorState,
	schematicPos: Point,
	snappedPos: Point,
	screenDelta: Point,
	dpr: number
): EditorAction[] {
	const actions: EditorAction[] = [];

	// Always update mouse position
	actions.push({
		type: 'UPDATE_MOUSE_POS',
		screenPos: { x: e.offsetX, y: e.offsetY },
		schematicPos
	});

	// Handle view dragging
	if (state.modeState.type === 'dragging-view') {
		actions.push({
			type: 'PAN',
			dx: screenDelta.x * dpr,
			dy: screenDelta.y * dpr
		});
	}

	// Handle moving items
	if (state.modeState.type === 'moving' && state.modeState.startPos) {
		const delta = {
			x: snappedPos.x - state.modeState.startPos.x,
			y: snappedPos.y - state.modeState.startPos.y
		};
		if (delta.x !== 0 || delta.y !== 0) {
			actions.push({ type: 'MOVE_SELECTED', delta });
		}
	}

	return actions;
}

/**
 * Map mouse up event to actions
 */
export function mapMouseUp(
	e: MouseEvent,
	state: EditorState,
	schematicPos: Point,
	snappedPos: Point
): EditorAction[] {
	const actions: EditorAction[] = [];

	// End view drag
	if (state.modeState.type === 'dragging-view') {
		actions.push({ type: 'END_VIEW_DRAG' });
	}

	// End move
	if (state.modeState.type === 'moving') {
		actions.push({ type: 'END_MOVE' });
	}

	// Complete probe
	if (state.modeState.type === 'probing' && state.modeState.phase === 'holding-first') {
		actions.push({
			type: 'PROBE_COMPLETE',
			pos: snappedPos,
			nodeName: null // Will be resolved by caller
		});
	}

	return actions;
}

/**
 * Map wheel event to actions
 */
export function mapWheel(
	e: WheelEvent,
	dpr: number
): EditorAction[] {
	const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
	return [{
		type: 'ZOOM',
		factor: zoomFactor,
		center: { x: e.offsetX * dpr, y: e.offsetY * dpr }
	}];
}

/**
 * Map key down event to actions
 */
export function mapKeyDown(
	e: KeyboardEvent,
	state: EditorState,
	canvasWidth: number,
	canvasHeight: number
): EditorAction[] {
	const actions: EditorAction[] = [];

	// Escape cancels current operation
	if (e.key === 'Escape') {
		actions.push({ type: 'CANCEL' });
		return actions;
	}

	// Mode shortcuts (number keys)
	if (!e.ctrlKey && !e.metaKey && !e.altKey) {
		const modeKey = MODE_SHORTCUTS[e.key];
		if (modeKey) {
			actions.push({ type: 'SET_MODE', mode: modeKey as 'select' | 'wire' | 'delete' | 'duplicate' | 'move' | 'probe' });
			return actions;
		}

		// W key for wire mode
		if (e.key === 'w' || e.key === 'W') {
			actions.push({ type: 'SET_MODE', mode: 'wire' });
			return actions;
		}

		// Component shortcuts
		const compDef = getComponentByShortcut(e.key);
		if (compDef) {
			actions.push({ type: 'START_PLACING', componentType: compDef.type });
			return actions;
		}
	}

	// Space toggles wire direction
	if (e.key === ' ' && state.modeState.type === 'drawing-wire') {
		actions.push({ type: 'TOGGLE_WIRE_DIRECTION' });
		return actions;
	}

	// Ctrl+R to rotate
	if ((e.key === 'r' || e.key === 'R') && (e.ctrlKey || e.metaKey)) {
		if (state.modeState.type === 'placing') {
			actions.push({ type: 'ROTATE_PLACING' });
		} else if (state.selection.componentIds.size > 0) {
			actions.push({ type: 'ROTATE_SELECTED' });
		}
		return actions;
	}

	// Ctrl+E to mirror
	if ((e.key === 'e' || e.key === 'E') && (e.ctrlKey || e.metaKey)) {
		if (state.modeState.type === 'placing') {
			actions.push({ type: 'MIRROR_PLACING' });
		} else if (state.selection.componentIds.size > 0) {
			actions.push({ type: 'MIRROR_SELECTED' });
		}
		return actions;
	}

	// Delete selected
	if (e.key === 'Delete' || e.key === 'Backspace') {
		actions.push({ type: 'DELETE_SELECTED' });
		return actions;
	}

	// Grid toggle
	if ((e.key === 'g' || e.key === 'G') && (e.ctrlKey || e.shiftKey)) {
		actions.push({ type: 'TOGGLE_GRID' });
		return actions;
	}

	// View controls
	if (e.key === 'Home' || (e.key === 'f' && state.modeState.type !== 'placing')) {
		actions.push({ type: 'RESET_VIEW', canvasWidth, canvasHeight });
		return actions;
	}
	if (e.key === '+' || e.key === '=') {
		actions.push({ type: 'ZOOM', factor: 1.2, center: { x: canvasWidth / 2, y: canvasHeight / 2 } });
		return actions;
	}
	if (e.key === '-' || e.key === '_') {
		actions.push({ type: 'ZOOM', factor: 1 / 1.2, center: { x: canvasWidth / 2, y: canvasHeight / 2 } });
		return actions;
	}

	return actions;
}

