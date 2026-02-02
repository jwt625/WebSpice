/**
 * Editor reducer - pure state transition function
 * Takes current state and action, returns new state
 */

import type { Schematic, Component, Wire, Junction, Point } from '../types';
import type { EditorState, SelectionState, ModeState } from './state';
import type { EditorAction, DeleteTarget } from './actions';
import { emptySelection } from './state';
import { COMPONENT_DEFS } from '../component-defs';
import { COMPONENT_PREFIX } from '$lib/netlist/types';
import { nextRotation } from '../component-renderer';
import { getWireSegments, snapToGrid as snapToGridUtil } from '../canvas/geometry';

/**
 * Schematic mutations that should be applied after state update
 */
export type SchematicMutation =
	| { type: 'ADD_COMPONENT'; component: Component }
	| { type: 'ADD_WIRE'; wire: Wire }
	| { type: 'ADD_JUNCTION'; junction: Junction }
	| { type: 'DELETE_COMPONENTS'; ids: string[] }
	| { type: 'DELETE_WIRES'; ids: string[] }
	| { type: 'DELETE_JUNCTIONS'; ids: string[] }
	| { type: 'DELETE_DIRECTIVES'; ids: string[] }
	| { type: 'MOVE_COMPONENTS'; ids: string[]; delta: Point }
	| { type: 'MOVE_WIRES'; ids: string[]; delta: Point }
	| { type: 'MOVE_DIRECTIVES'; ids: string[]; delta: Point }
	| { type: 'ROTATE_COMPONENTS'; ids: string[] }
	| { type: 'MIRROR_COMPONENTS'; ids: string[] };

/**
 * Result of reducer - new state plus optional schematic mutations
 */
export interface ReducerResult {
	state: EditorState;
	mutations: SchematicMutation[];
}

/**
 * Main reducer function
 */
export function editorReducer(
	state: EditorState,
	action: EditorAction,
	schematic: Schematic
): ReducerResult {
	switch (action.type) {
		// View actions
		case 'PAN':
			return {
				state: {
					...state,
					view: {
						...state.view,
						offsetX: state.view.offsetX + action.dx,
						offsetY: state.view.offsetY + action.dy
					}
				},
				mutations: []
			};

		case 'ZOOM': {
			const newScale = Math.max(0.1, Math.min(10, state.view.scale * action.factor));
			return {
				state: {
					...state,
					view: {
						...state.view,
						offsetX: action.center.x - (action.center.x - state.view.offsetX) * (newScale / state.view.scale),
						offsetY: action.center.y - (action.center.y - state.view.offsetY) * (newScale / state.view.scale),
						scale: newScale
					}
				},
				mutations: []
			};
		}

		case 'RESET_VIEW':
			return {
				state: {
					...state,
					view: {
						offsetX: action.canvasWidth / 2,
						offsetY: action.canvasHeight / 2,
						scale: 1
					}
				},
				mutations: []
			};

		case 'TOGGLE_GRID':
			return {
				state: {
					...state,
					grid: { ...state.grid, visible: !state.grid.visible }
				},
				mutations: []
			};

		case 'UPDATE_MOUSE_POS':
			return {
				state: {
					...state,
					mousePos: action.screenPos,
					schematicPos: action.schematicPos
				},
				mutations: []
			};

		// Mode actions
		case 'SET_MODE':
			return {
				state: {
					...state,
					modeState: getModeStateForMode(action.mode),
					selection: emptySelection()
				},
				mutations: []
			};

		case 'START_PLACING':
			return {
				state: {
					...state,
					modeState: {
						type: 'placing',
						componentType: action.componentType,
						rotation: 0,
						mirror: false
					},
					selection: emptySelection()
				},
				mutations: []
			};

		case 'CANCEL':
			return {
				state: {
					...state,
					modeState: { type: 'idle' },
					selection: emptySelection()
				},
				mutations: []
			};

		// Selection actions
		case 'SELECT':
			return handleSelect(state, action.target, action.additive);

		case 'CLEAR_SELECTION':
			return {
				state: { ...state, selection: emptySelection() },
				mutations: []
			};

		// Placement actions
		case 'ROTATE_PLACING':
			return handleRotatePlacing(state);

		case 'MIRROR_PLACING':
			return handleMirrorPlacing(state);

		case 'PLACE_COMPONENT':
			return handlePlaceComponent(state, schematic);

		// Selected item actions
		case 'ROTATE_SELECTED':
			return handleRotateSelected(state);

		case 'MIRROR_SELECTED':
			return handleMirrorSelected(state);

		case 'DELETE_SELECTED':
			return handleDeleteSelected(state);

		case 'DELETE_AT':
			return handleDeleteAt(state, action.target);

		// Wire drawing actions
		case 'START_WIRE':
			return {
				state: {
					...state,
					modeState: {
						type: 'drawing-wire',
						startPoint: action.point,
						direction: 'horizontal-first'
					}
				},
				mutations: []
			};

		case 'COMMIT_WIRE_SEGMENT':
			return handleCommitWireSegment(state, action.endPoint);

		case 'TOGGLE_WIRE_DIRECTION':
			return handleToggleWireDirection(state);

		// Move actions
		case 'START_MOVE':
			return {
				state: {
					...state,
					modeState: { type: 'moving', startPos: action.startPos }
				},
				mutations: []
			};

		case 'MOVE_SELECTED':
			return handleMoveSelected(state, action.delta);

		case 'END_MOVE':
			return {
				state: {
					...state,
					modeState: { type: 'idle' }
				},
				mutations: []
			};

		// View dragging
		case 'START_VIEW_DRAG':
			return {
				state: {
					...state,
					modeState: { type: 'dragging-view', startScreenPos: action.screenPos }
				},
				mutations: []
			};

		case 'END_VIEW_DRAG':
			return {
				state: {
					...state,
					modeState: { type: 'idle' }
				},
				mutations: []
			};

		// Duplicate
		case 'DUPLICATE_AT':
			return handleDuplicateAt(state, action.pos, schematic, action.componentId, action.wireId);

		// Probe actions
		case 'PROBE_START':
			return {
				state: {
					...state,
					modeState: {
						type: 'probing',
						phase: action.componentId ? 'idle' : 'holding-first',
						firstNode: action.pos,
						firstNodeName: action.nodeName ?? undefined,
						targetComponentId: action.componentId
					}
				},
				mutations: []
			};

		case 'PROBE_COMPLETE':
			return {
				state: {
					...state,
					modeState: { type: 'probing', phase: 'idle' }
				},
				mutations: []
			};

		// Junction
		case 'CREATE_JUNCTION':
			return {
				state,
				mutations: [{
					type: 'ADD_JUNCTION',
					junction: { id: crypto.randomUUID(), x: action.pos.x, y: action.pos.y }
				}]
			};

		default:
			return { state, mutations: [] };
	}
}

// Helper functions

function getModeStateForMode(mode: string): ModeState {
	switch (mode) {
		case 'wire':
			return { type: 'drawing-wire', startPoint: { x: 0, y: 0 }, direction: 'horizontal-first' };
		case 'move':
			return { type: 'moving', startPos: { x: 0, y: 0 } };
		case 'probe':
			return { type: 'probing', phase: 'idle' };
		case 'delete':
			return { type: 'delete' };
		case 'duplicate':
			return { type: 'duplicate' };
		default:
			return { type: 'idle' };
	}
}

function handleSelect(
	state: EditorState,
	target: { componentId?: string; wireId?: string; directiveId?: string },
	additive: boolean
): ReducerResult {
	let newSelection: SelectionState;

	if (additive) {
		newSelection = {
			componentIds: new Set(state.selection.componentIds),
			wireIds: new Set(state.selection.wireIds),
			directiveIds: new Set(state.selection.directiveIds)
		};
		if (target.componentId) {
			if (newSelection.componentIds.has(target.componentId)) {
				newSelection.componentIds.delete(target.componentId);
			} else {
				newSelection.componentIds.add(target.componentId);
			}
		}
		if (target.wireId) {
			if (newSelection.wireIds.has(target.wireId)) {
				newSelection.wireIds.delete(target.wireId);
			} else {
				newSelection.wireIds.add(target.wireId);
			}
		}
		if (target.directiveId) {
			if (newSelection.directiveIds.has(target.directiveId)) {
				newSelection.directiveIds.delete(target.directiveId);
			} else {
				newSelection.directiveIds.add(target.directiveId);
			}
		}
	} else {
		newSelection = {
			componentIds: target.componentId ? new Set([target.componentId]) : new Set(),
			wireIds: target.wireId ? new Set([target.wireId]) : new Set(),
			directiveIds: target.directiveId ? new Set([target.directiveId]) : new Set()
		};
	}

	return { state: { ...state, selection: newSelection }, mutations: [] };
}

function handleRotatePlacing(state: EditorState): ReducerResult {
	if (state.modeState.type !== 'placing') return { state, mutations: [] };
	return {
		state: {
			...state,
			modeState: {
				...state.modeState,
				rotation: nextRotation(state.modeState.rotation)
			}
		},
		mutations: []
	};
}

function handleMirrorPlacing(state: EditorState): ReducerResult {
	if (state.modeState.type !== 'placing') return { state, mutations: [] };
	return {
		state: {
			...state,
			modeState: {
				...state.modeState,
				mirror: !state.modeState.mirror
			}
		},
		mutations: []
	};
}

function handlePlaceComponent(state: EditorState, _schematic: Schematic): ReducerResult {
	if (state.modeState.type !== 'placing') return { state, mutations: [] };

	const { componentType, rotation, mirror } = state.modeState;
	const def = COMPONENT_DEFS[componentType];
	const snapped = snapToGridUtil(state.schematicPos, state.grid.size, state.grid.snapEnabled);

	// Generate instance name
	const prefix = COMPONENT_PREFIX[componentType] || '';
	const count = (state.componentCounters[componentType] || 0) + 1;
	const instName = prefix ? `${prefix}${count}` : '';

	const newComp: Component = {
		id: crypto.randomUUID(),
		type: componentType,
		x: snapped.x,
		y: snapped.y,
		rotation,
		mirror,
		attributes: {
			InstName: instName,
			Value: getDefaultValue(componentType)
		},
		pins: def.pins.map((p, i) => ({ ...p, id: `${i}` }))
	};

	return {
		state: {
			...state,
			componentCounters: {
				...state.componentCounters,
				[componentType]: count
			}
		},
		mutations: [{ type: 'ADD_COMPONENT', component: newComp }]
	};
}

function getDefaultValue(type: string): string {
	switch (type) {
		case 'resistor': return '1k';
		case 'capacitor': return '1u';
		case 'inductor': return '1m';
		case 'voltage': return 'DC 5';
		case 'current': return 'DC 1m';
		case 'diode': return 'D';
		case 'npn': case 'pnp': return '2N2222';
		case 'nmos': case 'pmos': return 'NMOS';
		default: return '';
	}
}

function handleRotateSelected(state: EditorState): ReducerResult {
	if (state.selection.componentIds.size === 0) return { state, mutations: [] };
	return {
		state,
		mutations: [{ type: 'ROTATE_COMPONENTS', ids: Array.from(state.selection.componentIds) }]
	};
}

function handleMirrorSelected(state: EditorState): ReducerResult {
	if (state.selection.componentIds.size === 0) return { state, mutations: [] };
	return {
		state,
		mutations: [{ type: 'MIRROR_COMPONENTS', ids: Array.from(state.selection.componentIds) }]
	};
}

function handleDeleteSelected(state: EditorState): ReducerResult {
	const mutations: SchematicMutation[] = [];
	if (state.selection.componentIds.size > 0) {
		mutations.push({ type: 'DELETE_COMPONENTS', ids: Array.from(state.selection.componentIds) });
	}
	if (state.selection.wireIds.size > 0) {
		mutations.push({ type: 'DELETE_WIRES', ids: Array.from(state.selection.wireIds) });
	}
	if (state.selection.directiveIds.size > 0) {
		mutations.push({ type: 'DELETE_DIRECTIVES', ids: Array.from(state.selection.directiveIds) });
	}
	return {
		state: { ...state, selection: emptySelection() },
		mutations
	};
}

function handleDeleteAt(state: EditorState, target: DeleteTarget): ReducerResult {
	const mutations: SchematicMutation[] = [];
	if (target.componentIds.length > 0) {
		mutations.push({ type: 'DELETE_COMPONENTS', ids: target.componentIds });
	}
	if (target.wireIds.length > 0) {
		mutations.push({ type: 'DELETE_WIRES', ids: target.wireIds });
	}
	if (target.junctionIds.length > 0) {
		mutations.push({ type: 'DELETE_JUNCTIONS', ids: target.junctionIds });
	}
	if (target.directiveIds.length > 0) {
		mutations.push({ type: 'DELETE_DIRECTIVES', ids: target.directiveIds });
	}
	return { state, mutations };
}

function handleCommitWireSegment(state: EditorState, endPoint: Point): ReducerResult {
	if (state.modeState.type !== 'drawing-wire') return { state, mutations: [] };

	const { startPoint, direction } = state.modeState;
	const segments = getWireSegments(startPoint, endPoint, direction);
	const mutations: SchematicMutation[] = [];

	for (const seg of segments) {
		if (seg.x1 !== seg.x2 || seg.y1 !== seg.y2) {
			const newWire: Wire = {
				id: crypto.randomUUID(),
				x1: seg.x1,
				y1: seg.y1,
				x2: seg.x2,
				y2: seg.y2
			};
			mutations.push({ type: 'ADD_WIRE', wire: newWire });
		}
	}

	return {
		state: {
			...state,
			modeState: {
				type: 'drawing-wire',
				startPoint: endPoint,
				direction
			}
		},
		mutations
	};
}

function handleToggleWireDirection(state: EditorState): ReducerResult {
	if (state.modeState.type !== 'drawing-wire') return { state, mutations: [] };
	return {
		state: {
			...state,
			modeState: {
				...state.modeState,
				direction: state.modeState.direction === 'horizontal-first' ? 'vertical-first' : 'horizontal-first'
			}
		},
		mutations: []
	};
}

function handleMoveSelected(state: EditorState, delta: Point): ReducerResult {
	const mutations: SchematicMutation[] = [];

	if (state.selection.componentIds.size > 0) {
		mutations.push({
			type: 'MOVE_COMPONENTS',
			ids: Array.from(state.selection.componentIds),
			delta
		});
	}
	if (state.selection.wireIds.size > 0) {
		mutations.push({
			type: 'MOVE_WIRES',
			ids: Array.from(state.selection.wireIds),
			delta
		});
	}
	if (state.selection.directiveIds.size > 0) {
		mutations.push({
			type: 'MOVE_DIRECTIVES',
			ids: Array.from(state.selection.directiveIds),
			delta
		});
	}

	// Update move start position for next delta calculation
	if (state.modeState.type === 'moving') {
		return {
			state: {
				...state,
				modeState: {
					...state.modeState,
					startPos: {
						x: state.modeState.startPos.x + delta.x,
						y: state.modeState.startPos.y + delta.y
					}
				}
			},
			mutations
		};
	}

	return { state, mutations };
}

function handleDuplicateAt(
	state: EditorState,
	pos: Point,
	schematic: Schematic,
	componentId?: string,
	wireId?: string
): ReducerResult {
	const mutations: SchematicMutation[] = [];
	const gridSize = state.grid.size;
	const offset = gridSize * 2;

	if (componentId) {
		const comp = schematic.components.find(c => c.id === componentId);
		if (comp) {
			const snappedX = Math.round(pos.x / gridSize) * gridSize + offset;
			const snappedY = Math.round(pos.y / gridSize) * gridSize + offset;

			// Deep copy the component
			const newComp: Component = JSON.parse(JSON.stringify(comp));
			newComp.id = crypto.randomUUID();
			newComp.x = snappedX;
			newComp.y = snappedY;

			// Fix pins from component definition (in case they were corrupted)
			const def = COMPONENT_DEFS[comp.type];
			if (def) {
				newComp.pins = def.pins.map((p, i) => ({ ...p, id: `${i}` }));
			}

			// Generate new instance name - increment number or add '1'
			const oldName = comp.attributes['InstName'] || '';
			const match = oldName.match(/^(.+?)(\d+)$/);
			if (match) {
				// Has number suffix - increment it
				const prefix = match[1];
				const num = parseInt(match[2], 10) + 1;
				newComp.attributes['InstName'] = `${prefix}${num}`;
			} else if (oldName) {
				// No number suffix - add '1'
				newComp.attributes['InstName'] = `${oldName}1`;
			}

			mutations.push({
				type: 'ADD_COMPONENT',
				component: newComp
			});

			return { state, mutations };
		}
	}

	if (wireId) {
		const wire = schematic.wires.find(w => w.id === wireId);
		if (wire) {
			mutations.push({
				type: 'ADD_WIRE',
				wire: {
					id: crypto.randomUUID(),
					x1: wire.x1 + offset,
					y1: wire.y1 + offset,
					x2: wire.x2 + offset,
					y2: wire.y2 + offset
				}
			});

			return { state, mutations };
		}
	}

	return { state, mutations: [] };
}
