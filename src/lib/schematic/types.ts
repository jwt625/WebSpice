/**
 * Schematic editor types
 */

/** 2D point in schematic coordinates */
export interface Point {
	x: number;
	y: number;
}

/** View transform state */
export interface ViewTransform {
	offsetX: number;  // Pan offset in screen pixels
	offsetY: number;
	scale: number;    // Zoom level (1 = 100%)
}

/** Grid settings */
export interface GridSettings {
	size: number;      // Grid spacing in schematic units (default: 10)
	snapEnabled: boolean;
	visible: boolean;
}

/**
 * Editor modes - mapped from LTSpice F-keys to number keys
 * F2 -> 2: Component (handled by component shortcuts)
 * F3 -> 3: Wire
 * F4 -> 4: Net label (future)
 * F5 -> 5: Delete
 * F6 -> 6: Duplicate
 * F7 -> 7: Move
 * F8 -> 8: Drag (move with wires, future)
 */
export type EditorMode =
	| 'select'    // Default mode - click to select
	| 'wire'      // 3 or W: Draw wires
	| 'delete'    // 5: Delete on click
	| 'duplicate' // 6: Duplicate selected items
	| 'move'      // 7: Move selected items
	| 'place'     // Placing a component
	| 'probe';    // P: Voltage/current probe mode

/** Mouse/interaction state */
export interface InteractionState {
	mode: EditorMode;
	isDragging: boolean;
	dragStart: Point | null;
	mousePos: Point;           // Screen coordinates
	schematicPos: Point;       // Schematic coordinates
	selectedIds: Set<string>;
}

/** Wire routing direction preference */
export type WireDirection = 'horizontal-first' | 'vertical-first';

/** Wire drawing state */
export interface WireDrawState {
	isDrawing: boolean;
	startPoint: Point | null;
	currentPoint: Point | null;
	direction: WireDirection;
	segments: Wire[];  // Completed segments in current wire chain
}

/** Component rotation (degrees, clockwise) */
export type Rotation = 0 | 90 | 180 | 270;

/** Component type identifiers */
export type ComponentType = 
	| 'resistor' | 'capacitor' | 'inductor'
	| 'voltage' | 'current' | 'ground'
	| 'diode' | 'npn' | 'pnp' | 'nmos' | 'pmos';

/** Pin on a component */
export interface Pin {
	id: string;
	x: number;  // Relative to component origin
	y: number;
	name: string;
}

/** Component instance in schematic */
export interface Component {
	id: string;
	type: ComponentType;
	x: number;
	y: number;
	rotation: Rotation;
	mirror: boolean;
	attributes: Record<string, string>;  // InstName, Value, etc.
	pins: Pin[];
}

/** Wire segment */
export interface Wire {
	id: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/**
 * Explicit junction - where wires are intentionally connected
 * Wires crossing visually are NOT connected unless a junction exists
 */
export interface Junction {
	id: string;
	x: number;
	y: number;
}

/** SPICE directive types */
export type DirectiveType = 'tran' | 'ac' | 'dc' | 'op' | 'param' | 'model' | 'other';

/** SPICE directive (simulation commands, parameters, models) */
export interface SpiceDirective {
	id: string;
	type: DirectiveType;
	text: string;           // Full directive text (e.g., ".tran 1u 10m")
	x?: number;             // Optional position for display on canvas
	y?: number;
}

/** SPICE model definition */
export interface SpiceModel {
	name: string;           // Model name (e.g., "D1N4148")
	type: string;           // Model type (e.g., "D", "NPN", "NMOS")
	params: string;         // Model parameters (e.g., "Is=2.52e-9 Rs=0.568 ...")
	description?: string;   // Optional description
}

/** Complete schematic state */
export interface Schematic {
	components: Component[];
	wires: Wire[];
	junctions: Junction[];  // Explicit wire-to-wire connections
	nodeLabels?: NodeLabel[];  // Node labels from netlist generation
	directives?: SpiceDirective[];  // SPICE directives (.tran, .ac, etc.)
	parameters?: Record<string, string>;  // .param definitions (name -> value)
	models?: SpiceModel[];  // .model definitions
}

/** Node label for display on schematic */
export interface NodeLabel {
	name: string;      // Node name (e.g., "0", "1", "in", "out")
	x: number;         // Position in schematic coordinates
	y: number;
	isGround: boolean;
}

/** Probe types */
export type ProbeType = 'voltage' | 'current' | 'voltage-diff';

/** Probe definition */
export interface Probe {
	id: string;
	type: ProbeType;
	node1: string;           // First node (or component for current)
	node2?: string;          // Second node for voltage-diff
	componentId?: string;    // Component ID for current probe
	label: string;           // Display label (e.g., "V(1)", "I(R1)")
}

/** Default values */
export const DEFAULT_GRID: GridSettings = {
	size: 10,
	snapEnabled: true,
	visible: true
};

export const DEFAULT_VIEW: ViewTransform = {
	offsetX: 0,
	offsetY: 0,
	scale: 1
};

export const DEFAULT_INTERACTION: InteractionState = {
	mode: 'select',
	isDragging: false,
	dragStart: null,
	mousePos: { x: 0, y: 0 },
	schematicPos: { x: 0, y: 0 },
	selectedIds: new Set()
};

export const DEFAULT_WIRE_DRAW: WireDrawState = {
	isDrawing: false,
	startPoint: null,
	currentPoint: null,
	direction: 'horizontal-first',
	segments: []
};

/** Keyboard shortcut mappings (LTSpice F-keys -> number keys) */
export const MODE_SHORTCUTS: Record<string, EditorMode> = {
	'3': 'wire',      // F3 -> Wire mode
	'5': 'delete',    // F5 -> Delete mode
	'6': 'duplicate', // F6 -> Duplicate mode
	'7': 'move',      // F7 -> Move mode
	'p': 'probe',     // P -> Probe mode
};

/** Get mode display name */
export function getModeName(mode: EditorMode): string {
	switch (mode) {
		case 'select': return 'Select';
		case 'wire': return 'Wire (3)';
		case 'delete': return 'Delete (5)';
		case 'duplicate': return 'Duplicate (6)';
		case 'move': return 'Move (7)';
		case 'place': return 'Place';
		case 'probe': return 'Probe (P)';
		default: return mode;
	}
}

