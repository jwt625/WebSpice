<script lang="ts">
	import { onMount } from 'svelte';
	import type { ViewTransform, GridSettings, Point, Schematic, Component, ComponentType, Rotation, EditorMode, WireDrawState, Wire, Junction, ProbeType } from './types';
	import { DEFAULT_VIEW, DEFAULT_GRID, DEFAULT_WIRE_DRAW, MODE_SHORTCUTS, getModeName } from './types';
	import { renderComponent, nextRotation } from './component-renderer';
	import { COMPONENT_DEFS, getComponentByShortcut } from './component-defs';
	import { COMPONENT_PREFIX } from '$lib/netlist/types';

	import {
		screenToSchematic as screenToSchematicUtil,
		schematicToScreen as schematicToScreenUtil,
		snapToGrid as snapToGridUtil,
		getWireSegments,
		getAllPinPositions,
		findComponentAt as findComponentAtUtil,
		findWireAt as findWireAtUtil,
		findJunctionAt as findJunctionAtUtil,
		findDirectiveAtPos as findDirectiveAtPosUtil,
		drawVoltageProbe as drawVoltageProbeUtil,
		drawCurrentClamp as drawCurrentClampUtil,
		findNodeForWire as findNodeForWireUtil
	} from './canvas';

	interface ProbeEvent {
		type: ProbeType;
		node1: string;
		node2?: string;
		componentId?: string;
		label: string;
	}

	let {
		schematic = $bindable({ components: [], wires: [], junctions: [] }),
		onprobe,
		oneditcomponent,
		oneditdirectives
	}: {
		schematic: Schematic;
		onprobe?: (event: ProbeEvent) => void;
		oneditcomponent?: (component: Component) => void;
		oneditdirectives?: () => void;
	} = $props();

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;

	let view: ViewTransform = $state({ ...DEFAULT_VIEW });
	let grid: GridSettings = $state({ ...DEFAULT_GRID });
	let isDragging = $state(false);
	let dragStart: Point | null = null;
	let mousePos: Point = $state({ x: 0, y: 0 });
	let schematicPos: Point = $state({ x: 0, y: 0 });

	// Editor mode (select, wire, delete, move, place)
	let mode: EditorMode = $state('select');

	// Selection state
	let selectedIds: Set<string> = $state(new Set());
	let selectedWireIds: Set<string> = $state(new Set());
	let selectedDirectiveIds: Set<string> = $state(new Set());

	// Move operation state
	let isMoving = $state(false);
	let moveStartSchematicPos: Point | null = null;

	// Component placement state
	let placingType: ComponentType | null = $state(null);
	let placingRotation: Rotation = $state(0);
	let placingMirror: boolean = $state(false);

	// Wire drawing state
	let wireDraw: WireDrawState = $state({ ...DEFAULT_WIRE_DRAW });

	// Probe state for differential voltage measurement
	let probeState = $state<{
		isHolding: boolean;
		firstNode: Point | null;
		firstNodeName: string | null;
		targetComponent?: Component | null;
	}>({ isHolding: false, firstNode: null, firstNodeName: null, targetComponent: null });

	// Component counter for generating unique IDs
	let componentCounters: Record<string, number> = $state({});

	const getDpr = () => (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;

	let resizeObserver: ResizeObserver | null = null;
	let container: HTMLDivElement;

	onMount(() => {
		ctx = canvas.getContext('2d');

		// Use ResizeObserver on the CONTAINER (not canvas) for accurate size tracking
		resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				if (entry.target === container) {
					resize(entry.contentRect.width, entry.contentRect.height);
				}
			}
		});
		resizeObserver.observe(container);

		// Initial size from container
		const rect = container.getBoundingClientRect();
		resize(rect.width, rect.height);

		return () => {
			resizeObserver?.disconnect();
		};
	});

	function resize(displayWidth: number, displayHeight: number) {
		if (!canvas || displayWidth <= 0 || displayHeight <= 0) return;
		const dpr = getDpr();

		// Set canvas internal resolution to match display size * dpr
		const newWidth = Math.floor(displayWidth * dpr);
		const newHeight = Math.floor(displayHeight * dpr);

		// Adjust view offset to keep the center point stable
		if (canvas.width > 0 && canvas.height > 0) {
			view.offsetX += (newWidth - canvas.width) / 2;
			view.offsetY += (newHeight - canvas.height) / 2;
		}

		canvas.width = newWidth;
		canvas.height = newHeight;

		render();
	}

	// Wrapper functions that use component state
	const screenToSchematic = (sx: number, sy: number): Point =>
		screenToSchematicUtil(sx, sy, view, getDpr());

	const schematicToScreen = (px: number, py: number): Point =>
		schematicToScreenUtil(px, py, view, getDpr());

	const snapToGrid = (p: Point): Point =>
		snapToGridUtil(p, grid.size, grid.snapEnabled);

	// Hit testing wrapper functions
	const findComponentAt = (pos: Point): Component | null =>
		findComponentAtUtil(pos, schematic.components);

	const findWireAt = (pos: Point, tolerance: number = 5): Wire | null =>
		findWireAtUtil(pos, schematic.wires, tolerance);

	const findJunctionAt = (pos: Point, tolerance: number = 8): Junction | null =>
		findJunctionAtUtil(pos, schematic.junctions, tolerance);

	const findDirectiveAtPos = (pos: Point): import('./types').SpiceDirective | null => {
		if (!ctx) return null;
		return findDirectiveAtPosUtil(pos, schematic.directives, { ctx, viewScale: view.scale });
	};

	function render() {
		if (!ctx || !canvas) return;
		const w = canvas.width, h = canvas.height;

		// Clear
		ctx.fillStyle = '#1a1a1a';
		ctx.fillRect(0, 0, w, h);

		// Apply transform
		ctx.save();
		ctx.translate(view.offsetX, view.offsetY);
		ctx.scale(view.scale, view.scale);

		// Draw grid
		if (grid.visible) drawGrid(w, h);

		// Draw origin crosshair
		drawOrigin();

		// Draw wires
		drawWires();

		// Draw components
		drawComponents();

		// Draw node labels (if available)
		drawNodeLabels();

		// Draw SPICE directives
		drawDirectives();

		// Draw probe cursor overlay in probe mode
		if (mode === 'probe') {
			drawProbeCursor();
		}

		ctx.restore();
	}

	function drawGrid(w: number, h: number) {
		if (!ctx) return;
		const gs = grid.size;

		// Calculate visible range in schematic coords
		const topLeft = screenToSchematic(0, 0);
		const bottomRight = { x: (w - view.offsetX) / view.scale, y: (h - view.offsetY) / view.scale };

		const startX = Math.floor(topLeft.x / gs) * gs;
		const startY = Math.floor(topLeft.y / gs) * gs;
		const endX = Math.ceil(bottomRight.x / gs) * gs;
		const endY = Math.ceil(bottomRight.y / gs) * gs;

		// Draw dots at grid intersections
		ctx.fillStyle = '#444';
		const dotSize = Math.max(1, 2 / view.scale);

		for (let x = startX; x <= endX; x += gs) {
			for (let y = startY; y <= endY; y += gs) {
				ctx.fillRect(x - dotSize/2, y - dotSize/2, dotSize, dotSize);
			}
		}
	}

	function drawOrigin() {
		if (!ctx) return;
		const size = 20;
		ctx.strokeStyle = '#666';
		ctx.lineWidth = 1 / view.scale;
		ctx.beginPath();
		ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
		ctx.moveTo(0, -size); ctx.lineTo(0, size);
		ctx.stroke();
	}

	function drawWires() {
		if (!ctx) return;
		ctx.lineCap = 'round';
		ctx.lineWidth = 2 / view.scale;

		// Draw existing wires
		for (const wire of schematic.wires) {
			const isSelected = selectedWireIds.has(wire.id);
			ctx.strokeStyle = isSelected ? '#ffff00' : '#00ff00';
			ctx.beginPath();
			ctx.moveTo(wire.x1, wire.y1);
			ctx.lineTo(wire.x2, wire.y2);
			ctx.stroke();
		}

		// Draw wire being drawn (preview)
		if (wireDraw.isDrawing && wireDraw.startPoint) {
			const snapped = snapToGrid(schematicPos);
			const segments = getWireSegments(wireDraw.startPoint, snapped, wireDraw.direction);

			ctx.strokeStyle = '#00ff0080';  // Semi-transparent green
			ctx.setLineDash([5 / view.scale, 5 / view.scale]);

			for (const seg of segments) {
				ctx.beginPath();
				ctx.moveTo(seg.x1, seg.y1);
				ctx.lineTo(seg.x2, seg.y2);
				ctx.stroke();
			}

			ctx.setLineDash([]);
		}

		// Draw junction dots where wires connect
		drawJunctions();
	}

	/** Draw junction dots - red for connections, following LTSpice style */
	function drawJunctions() {
		if (!ctx) return;

		const dotRadius = 4 / view.scale;
		const pinPositions = getAllPinPositions(schematic.components);

		// Count wire endpoints at each position
		const wireEndpoints: Map<string, number> = new Map();
		for (const wire of schematic.wires) {
			const key1 = `${wire.x1},${wire.y1}`;
			const key2 = `${wire.x2},${wire.y2}`;
			wireEndpoints.set(key1, (wireEndpoints.get(key1) || 0) + 1);
			wireEndpoints.set(key2, (wireEndpoints.get(key2) || 0) + 1);
		}

		// Draw red dots at:
		// 1. Explicit junctions (user-created for wire crossings)
		// 2. Wire endpoints that connect to component pins
		// 3. Wire endpoints where 3+ wire segments meet (T-junction)

		ctx.fillStyle = '#ff0000';  // Red like component terminals

		// Draw explicit junctions
		for (const junction of schematic.junctions) {
			ctx.beginPath();
			ctx.arc(junction.x, junction.y, dotRadius, 0, Math.PI * 2);
			ctx.fill();
		}

		// Draw connection dots at wire endpoints
		for (const [key, count] of wireEndpoints) {
			const [x, y] = key.split(',').map(Number);

			// Draw dot if:
			// - Wire endpoint is on a component pin (auto-connection)
			// - 3+ wire endpoints meet here (T-junction or more)
			if (pinPositions.has(key) || count >= 3) {
				ctx.beginPath();
				ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}

	function drawComponents() {
		if (!ctx) return;

		// Draw all placed components
		for (const comp of schematic.components) {
			const isSelected = selectedIds.has(comp.id);
			renderComponent(ctx, comp, view.scale, isSelected, false);
		}

		// Draw ghost component if placing
		if (placingType) {
			const snapped = snapToGrid(schematicPos);
			const ghostComp: Component = {
				id: 'ghost',
				type: placingType,
				x: snapped.x,
				y: snapped.y,
				rotation: placingRotation,
				mirror: placingMirror,
				attributes: {},
				pins: []
			};
			renderComponent(ctx, ghostComp, view.scale, false, true);
		}
	}

	function drawNodeLabels() {
		if (!ctx || !schematic.nodeLabels || schematic.nodeLabels.length === 0) return;

		const fontSize = Math.max(10, 12 / view.scale);
		ctx.font = `${fontSize}px monospace`;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'bottom';

		for (const label of schematic.nodeLabels) {
			// Draw background
			const text = label.name;
			const metrics = ctx.measureText(text);
			const padding = 2 / view.scale;
			const bgWidth = metrics.width + padding * 2;
			const bgHeight = fontSize + padding * 2;

			ctx.fillStyle = label.isGround ? '#004400' : '#000044';
			ctx.fillRect(label.x + 3, label.y - bgHeight - 2, bgWidth, bgHeight);

			// Draw text
			ctx.fillStyle = label.isGround ? '#00ff00' : '#88ccff';
			ctx.fillText(text, label.x + 3 + padding, label.y - 2 - padding);
		}
	}

	/** Draw SPICE directives as text on the canvas */
	function drawDirectives() {
		if (!ctx || !schematic.directives || schematic.directives.length === 0) return;

		const fontSize = Math.max(10, 14 / view.scale);
		ctx.font = `${fontSize}px monospace`;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';

		for (const directive of schematic.directives) {
			// Only draw directives that have position
			if (directive.x === undefined || directive.y === undefined) continue;

			const isSelected = selectedDirectiveIds.has(directive.id);
			const text = directive.text;
			const metrics = ctx.measureText(text);
			const padding = 3 / view.scale;
			const bgWidth = metrics.width + padding * 2;
			const bgHeight = fontSize + padding * 2;

			// Draw background - dark purple for directives, yellow tint if selected
			ctx.fillStyle = isSelected ? '#3a3a1a' : '#2a1a3a';
			ctx.fillRect(directive.x - padding, directive.y - padding, bgWidth, bgHeight);

			// Draw border - yellow if selected
			ctx.strokeStyle = isSelected ? '#ffff00' : '#6a4a8a';
			ctx.lineWidth = (isSelected ? 2 : 1) / view.scale;
			ctx.strokeRect(directive.x - padding, directive.y - padding, bgWidth, bgHeight);

			// Draw text - light purple/magenta for SPICE directives
			ctx.fillStyle = isSelected ? '#ffff88' : '#cc88ff';
			ctx.fillText(text, directive.x, directive.y);
		}
	}

	// Wrapper functions for probe drawing
	const drawVoltageProbe = (x: number, y: number, color: string, label: string): void => {
		if (!ctx) return;
		drawVoltageProbeUtil(ctx, x, y, color, label, view.scale);
	};

	const drawCurrentClamp = (x: number, y: number): void => {
		if (!ctx) return;
		drawCurrentClampUtil(ctx, x, y, view.scale);
	};

	function drawProbeCursor() {
		if (!ctx) return;
		const pos = schematicPos;  // Use actual cursor position, not snapped

		// Check what's under cursor
		const compUnder = findComponentAt(pos);
		const wireUnder = findWireAt(pos);

		// If holding for differential probe
		if (probeState.isHolding && probeState.firstNode) {
			// Draw RED (+) probe fixed at first node (positive reference)
			drawVoltageProbe(probeState.firstNode.x, probeState.firstNode.y, '#ff0000', '+');

			// Draw dashed line between probes
			ctx.strokeStyle = '#888888';
			ctx.lineWidth = 1 / view.scale;
			ctx.setLineDash([4 / view.scale, 4 / view.scale]);
			ctx.beginPath();
			ctx.moveTo(probeState.firstNode.x, probeState.firstNode.y);
			ctx.lineTo(pos.x, pos.y);
			ctx.stroke();
			ctx.setLineDash([]);

			// Draw BLACK (-) probe at cursor (negative reference)
			drawVoltageProbe(pos.x, pos.y, '#000000', '-');
		} else if (compUnder && compUnder.type !== 'ground') {
			// Current probe - draw clamp at cursor
			drawCurrentClamp(pos.x, pos.y);
		} else if (wireUnder) {
			// Voltage probe - draw red probe at cursor
			drawVoltageProbe(pos.x, pos.y, '#ff0000', '+');
		} else {
			// Default - show faded probe at cursor
			ctx.globalAlpha = 0.4;
			drawVoltageProbe(pos.x, pos.y, '#888888', '?');
			ctx.globalAlpha = 1.0;
		}
	}

	function getHudText(): string {
		const snapped = snapToGrid(schematicPos);
		let text = `(${snapped.x}, ${snapped.y}) | Zoom: ${(view.scale * 100).toFixed(0)}%`;

		// Show current mode
		text += ` | ${getModeName(mode)}`;

		if (mode === 'place' && placingType) {
			const def = COMPONENT_DEFS[placingType];
			text += `: ${def.name}`;
			if (placingRotation !== 0) text += ` R${placingRotation}°`;
			if (placingMirror) text += ' M';
			text += ' | Ctrl+R=rotate, Ctrl+E=mirror, Esc=cancel';
		} else if (mode === 'wire') {
			if (wireDraw.isDrawing) {
				text += ' | Click to place segment, Space=toggle direction, Esc=cancel';
			} else {
				text += ' | Click to start wire, Esc=exit';
			}
		} else if (mode === 'delete') {
			text += ' | Click to delete (junctions/components/wires), Esc=exit';
		} else if (mode === 'duplicate') {
			text += ' | Click on item to duplicate, Esc=exit';
		} else if (mode === 'move') {
			text += ' | Drag to move, Esc=exit';
		} else if (mode === 'probe') {
			if (probeState.isHolding) {
				text += ' | Release to measure V(+) - V(-), Esc=cancel';
			} else {
				text += ' | Click wire=V probe, Click component=I probe, Hold+drag=V diff';
			}
		} else if (selectedIds.size > 0 || selectedWireIds.size > 0 || selectedDirectiveIds.size > 0) {
			const total = selectedIds.size + selectedWireIds.size + selectedDirectiveIds.size;
			text += ` | Selected: ${total}`;
			text += ' | Ctrl+R=rotate, Ctrl+E=mirror, Del=delete';
		}

		// Always show mode shortcuts hint
		text += ' | 3=wire 5=del 6=dup 7=move P=probe';

		return text;
	}

	function handleMouseDown(e: MouseEvent) {
		canvas.focus();
		const clickPos = screenToSchematic(e.offsetX, e.offsetY);
		const snapped = snapToGrid(clickPos);

		if (e.button === 0) {  // Left click
			// Handle wire mode
			if (mode === 'wire') {
				handleWireClick(snapped);
				return;
			}

			// Handle delete mode
			if (mode === 'delete') {
				handleDeleteClick(clickPos);
				return;
			}

			// Handle duplicate mode
			if (mode === 'duplicate') {
				handleDuplicateClick(clickPos, snapped);
				return;
			}

			// Handle probe mode - start differential probe on mousedown
			if (mode === 'probe') {
				handleProbeMouseDown(clickPos, snapped);
				// Don't return - let mouseup handle the actual probe action
			}

			// Handle component placement
			if (mode === 'place' && placingType) {
				placeComponent();
				return;
			}

			// Check what's under the click
			const clickedComp = findComponentAt(clickPos);
			const clickedWire = findWireAt(clickPos);
			const clickedDirective = findDirectiveAtPos(clickPos);

			// Handle move mode - select and start moving
			if (mode === 'move') {
				if (clickedDirective) {
					// Select directive and start moving
					if (!selectedDirectiveIds.has(clickedDirective.id)) {
						if (!e.shiftKey) {
							selectedIds = new Set();
							selectedWireIds = new Set();
							selectedDirectiveIds = new Set([clickedDirective.id]);
						} else {
							selectedDirectiveIds.add(clickedDirective.id);
							selectedDirectiveIds = new Set(selectedDirectiveIds);
						}
					}
					isMoving = true;
					moveStartSchematicPos = snapped;
					dragStart = { x: e.offsetX, y: e.offsetY };
					render();
					return;
				}
				if (clickedComp) {
					// Select component and start moving
					if (!selectedIds.has(clickedComp.id)) {
						if (!e.shiftKey) {
							selectedIds = new Set([clickedComp.id]);
							selectedWireIds = new Set();
							selectedDirectiveIds = new Set();
						} else {
							selectedIds.add(clickedComp.id);
							selectedIds = new Set(selectedIds);
						}
					}
					isMoving = true;
					moveStartSchematicPos = snapped;
					dragStart = { x: e.offsetX, y: e.offsetY };
					render();
					return;
				}
				if (clickedWire) {
					// Select wire and start moving
					if (!selectedWireIds.has(clickedWire.id)) {
						if (!e.shiftKey) {
							selectedWireIds = new Set([clickedWire.id]);
							selectedIds = new Set();
							selectedDirectiveIds = new Set();
						} else {
							selectedWireIds.add(clickedWire.id);
							selectedWireIds = new Set(selectedWireIds);
						}
					}
					isMoving = true;
					moveStartSchematicPos = snapped;
					dragStart = { x: e.offsetX, y: e.offsetY };
					render();
					return;
				}
				// Click on empty space in move mode - just prepare for pan
				dragStart = { x: e.offsetX, y: e.offsetY };
				render();
				return;
			}

			// Select mode - check for component/wire/directive selection
			if (clickedDirective) {
				if (e.shiftKey) {
					if (selectedDirectiveIds.has(clickedDirective.id)) {
						selectedDirectiveIds.delete(clickedDirective.id);
					} else {
						selectedDirectiveIds.add(clickedDirective.id);
					}
					selectedDirectiveIds = new Set(selectedDirectiveIds);
				} else {
					selectedDirectiveIds = new Set([clickedDirective.id]);
					selectedIds = new Set();
					selectedWireIds = new Set();
				}
				render();
				return;
			}

			if (clickedComp) {
				if (e.shiftKey) {
					// Toggle selection
					if (selectedIds.has(clickedComp.id)) {
						selectedIds.delete(clickedComp.id);
					} else {
						selectedIds.add(clickedComp.id);
					}
					selectedIds = new Set(selectedIds);
				} else {
					selectedIds = new Set([clickedComp.id]);
					selectedWireIds = new Set();
					selectedDirectiveIds = new Set();
				}
				render();
				return;
			}

			if (clickedWire) {
				if (e.shiftKey) {
					if (selectedWireIds.has(clickedWire.id)) {
						selectedWireIds.delete(clickedWire.id);
					} else {
						selectedWireIds.add(clickedWire.id);
					}
					selectedWireIds = new Set(selectedWireIds);
				} else {
					selectedWireIds = new Set([clickedWire.id]);
					selectedIds = new Set();
					selectedDirectiveIds = new Set();
				}
				render();
				return;
			}

			// Click on empty space - prepare for potential pan, clear selection
			if (!e.shiftKey) {
				selectedIds = new Set();
				selectedWireIds = new Set();
				selectedDirectiveIds = new Set();
			}
			dragStart = { x: e.offsetX, y: e.offsetY };
			render();
		} else if (e.button === 1) {  // Middle click - always pan
			isDragging = true;
			dragStart = { x: e.offsetX, y: e.offsetY };
		}
	}

	/** Handle click in wire drawing mode */
	function handleWireClick(snapped: Point) {
		if (!wireDraw.isDrawing) {
			// Start new wire - also check if starting on existing wire
			maybeCreateJunctionOnWire(snapped);
			wireDraw = {
				...wireDraw,
				isDrawing: true,
				startPoint: snapped,
				segments: []
			};
		} else if (wireDraw.startPoint) {
			// Place wire segment(s)
			const segments = getWireSegments(wireDraw.startPoint, snapped, wireDraw.direction);

			for (const seg of segments) {
				// Only add non-zero-length segments
				if (seg.x1 !== seg.x2 || seg.y1 !== seg.y2) {
					const newWire: Wire = {
						id: crypto.randomUUID(),
						x1: seg.x1,
						y1: seg.y1,
						x2: seg.x2,
						y2: seg.y2
					};
					schematic.wires = [...schematic.wires, newWire];
				}
			}

			// If ending on an existing wire, create junction
			maybeCreateJunctionOnWire(snapped);

			// Continue from end point for chained wires
			wireDraw = {
				...wireDraw,
				startPoint: snapped
			};
		}
		render();
	}

	/** Create junction if point is on an existing wire (not at endpoint) */
	function maybeCreateJunctionOnWire(point: Point) {
		for (const wire of schematic.wires) {
			if (isPointOnWireSegment(point, wire)) {
				createJunctionAt(point);
				return;
			}
		}
	}

	/** Check if point lies on wire segment (not at endpoints) */
	function isPointOnWireSegment(point: Point, wire: Wire): boolean {
		// Check if point is at an endpoint (no junction needed there)
		if ((point.x === wire.x1 && point.y === wire.y1) ||
			(point.x === wire.x2 && point.y === wire.y2)) {
			return false;
		}

		// Check if point is on the line segment
		// For Manhattan wires, this is simple: check if on horizontal or vertical segment
		if (wire.x1 === wire.x2) {
			// Vertical wire
			if (point.x === wire.x1) {
				const minY = Math.min(wire.y1, wire.y2);
				const maxY = Math.max(wire.y1, wire.y2);
				return point.y > minY && point.y < maxY;
			}
		} else if (wire.y1 === wire.y2) {
			// Horizontal wire
			if (point.y === wire.y1) {
				const minX = Math.min(wire.x1, wire.x2);
				const maxX = Math.max(wire.x1, wire.x2);
				return point.x > minX && point.x < maxX;
			}
		}
		return false;
	}

	/** Handle click in delete mode */
	function handleDeleteClick(clickPos: Point) {
		// Check for junction first
		const junction = findJunctionAt(clickPos);
		if (junction) {
			schematic.junctions = schematic.junctions.filter(j => j.id !== junction.id);
			render();
			return;
		}

		const comp = findComponentAt(clickPos);
		if (comp) {
			schematic.components = schematic.components.filter(c => c.id !== comp.id);
			render();
			return;
		}

		const wire = findWireAt(clickPos);
		if (wire) {
			schematic.wires = schematic.wires.filter(w => w.id !== wire.id);
			render();
		}
	}

	/** Create a junction at the given position */
	function createJunctionAt(pos: Point): boolean {
		// Check if junction already exists at this position
		const existing = schematic.junctions.find(j => j.x === pos.x && j.y === pos.y);
		if (existing) return false;

		const newJunction: Junction = {
			id: crypto.randomUUID(),
			x: pos.x,
			y: pos.y
		};
		schematic.junctions = [...schematic.junctions, newJunction];
		return true;
	}

	/** Handle click in duplicate mode - click on item to duplicate it */
	function handleDuplicateClick(clickPos: Point, snapped: Point) {
		const comp = findComponentAt(clickPos);
		if (comp) {
			// Duplicate component with offset
			const offset = grid.size * 2;  // Offset by 2 grid units
			const newComp: Component = {
				id: crypto.randomUUID(),
				type: comp.type,
				x: snapped.x + offset,
				y: snapped.y + offset,
				rotation: comp.rotation,
				mirror: comp.mirror,
				attributes: { ...comp.attributes },
				pins: comp.pins.map(p => ({ ...p }))
			};

			// Update instance name for the duplicate using correct SPICE prefix
			if (newComp.attributes['InstName']) {
				const count = (componentCounters[comp.type] || 0) + 1;
				componentCounters[comp.type] = count;
				const prefix = COMPONENT_PREFIX[comp.type] || '';
				newComp.attributes['InstName'] = prefix ? `${prefix}${count}` : '';
			}

			schematic.components = [...schematic.components, newComp];
			// Select the new component
			selectedIds = new Set([newComp.id]);
			selectedWireIds = new Set();
			render();
			return;
		}

		const wire = findWireAt(clickPos);
		if (wire) {
			// Duplicate wire with offset
			const offset = grid.size * 2;
			const newWire: Wire = {
				id: crypto.randomUUID(),
				x1: wire.x1 + offset,
				y1: wire.y1 + offset,
				x2: wire.x2 + offset,
				y2: wire.y2 + offset
			};
			schematic.wires = [...schematic.wires, newWire];
			selectedWireIds = new Set([newWire.id]);
			selectedIds = new Set();
			render();
		}
	}

	/** Start probe (mousedown) - for voltage probes on wires/nodes */
	function handleProbeMouseDown(clickPos: Point, snapped: Point) {
		// First check if clicking on a component (for current probe)
		const comp = findComponentAt(clickPos);
		if (comp && comp.type !== 'ground') {
			// Current probe - handle immediately on mousedown, complete on mouseup
			probeState = {
				isHolding: false, // false = component click, not wire
				firstNode: snapped,
				firstNodeName: null,
				targetComponent: comp
			};
			return;
		}

		// Check for wire or node at position
		const wire = findWireAt(snapped);
		const nodeName = getNodeAtPosition(snapped);

		if (wire || nodeName) {
			probeState = {
				isHolding: true, // true = voltage probe mode
				firstNode: snapped,
				firstNodeName: nodeName
			};
			render();
		}
	}

	/** Complete probe (mouseup) - handles both single-click and differential */
	function handleProbeMouseUp(clickPos: Point, snapped: Point) {
		// Handle component current probe
		if (probeState.targetComponent) {
			const comp = probeState.targetComponent;
			const instName = comp.attributes['InstName'] || comp.id;
			addProbe('current', instName, comp.id);
			probeState = { isHolding: false, firstNode: null, firstNodeName: null, targetComponent: null };
			render();
			return;
		}

		// Handle voltage probe (wire/node click)
		if (probeState.isHolding && probeState.firstNode) {
			const secondNodeName = getNodeAtPosition(snapped);
			const firstNodeName = probeState.firstNodeName || getNodeAtPosition(probeState.firstNode);

			// Check if this is a drag (differential) or single click
			const dragDist = Math.hypot(snapped.x - probeState.firstNode.x, snapped.y - probeState.firstNode.y);
			const isDrag = dragDist > 20; // More than 20 units = drag

			if (isDrag && secondNodeName && firstNodeName && secondNodeName !== firstNodeName) {
				// Differential voltage probe
				addProbe('voltage-diff', firstNodeName, undefined, secondNodeName);
			} else if (firstNodeName) {
				// Single click - create single voltage probe
				addProbe('voltage', firstNodeName);
			}
		}
		probeState = { isHolding: false, firstNode: null, firstNodeName: null, targetComponent: null };
		render();
	}

	/** Get node name at a position (from nodeLabels) - works on wires too */
	function getNodeAtPosition(pos: Point): string | null {
		if (!schematic.nodeLabels || schematic.nodeLabels.length === 0) {
			return null;
		}

		// Use findWireAt (same as visual selection) instead of pointOnWire
		const clickedWire = findWireAt(pos);
		if (clickedWire) {
			const nodeName = findNodeForWire(clickedWire);
			if (nodeName) return nodeName;
		}

		// Fallback: check if position is close to a node label directly
		let closest: { name: string; dist: number } | null = null;
		for (const label of schematic.nodeLabels) {
			const dist = Math.hypot(label.x - pos.x, label.y - pos.y);
			if (dist < 50 && (!closest || dist < closest.dist)) {
				closest = { name: label.name, dist };
			}
		}
		return closest?.name || null;
	}

	// Wrapper for findNodeForWire
	const findNodeForWire = (startWire: Wire): string | null =>
		findNodeForWireUtil(startWire, schematic);

	/** Add a probe (calls onprobe callback) */
	function addProbe(type: ProbeType, node1: string, componentId?: string, node2?: string) {
		const label = type === 'current'
			? `I(${node1})`
			: type === 'voltage-diff'
				? `V(${node1},${node2})`
				: `V(${node1})`;

		// Call the onprobe callback if provided
		if (onprobe) {
			onprobe({ type, node1, node2, componentId, label });
		}
	}

	function placeComponent() {
		if (!placingType) return;

		const snapped = snapToGrid(schematicPos);
		const def = COMPONENT_DEFS[placingType];

		// Generate instance name using correct SPICE prefix
		// e.g., inductor -> L, current -> I, resistor -> R
		const prefix = COMPONENT_PREFIX[placingType] || '';
		const count = (componentCounters[placingType] || 0) + 1;
		componentCounters[placingType] = count;
		const instName = prefix ? `${prefix}${count}` : '';

		// Create new component
		const newComp: Component = {
			id: crypto.randomUUID(),
			type: placingType,
			x: snapped.x,
			y: snapped.y,
			rotation: placingRotation,
			mirror: placingMirror,
			attributes: {
				InstName: instName,
				Value: getDefaultValue(placingType)
			},
			pins: def.pins.map((p, i) => ({ ...p, id: `${i}` }))
		};

		schematic.components = [...schematic.components, newComp];
		render();
	}

	function getDefaultValue(type: ComponentType): string {
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

	function handleMouseMove(e: MouseEvent) {
		const dpr = getDpr();
		mousePos = { x: e.offsetX, y: e.offsetY };
		schematicPos = screenToSchematic(e.offsetX, e.offsetY);

		// Start dragging if mouse moved with button held (dragStart set but not isDragging yet)
		if (dragStart && !isDragging && (e.buttons & 1 || e.buttons & 4)) {
			const dx = Math.abs(e.offsetX - dragStart.x);
			const dy = Math.abs(e.offsetY - dragStart.y);
			// Only start drag if moved more than 3 pixels (prevents accidental drags)
			if (dx > 3 || dy > 3) {
				isDragging = true;
			}
		}

		// Handle moving selected items
		if (isMoving && moveStartSchematicPos && isDragging) {
			const currentSnapped = snapToGrid(schematicPos);
			const dx = currentSnapped.x - moveStartSchematicPos.x;
			const dy = currentSnapped.y - moveStartSchematicPos.y;

			if (dx !== 0 || dy !== 0) {
				// Move selected components
				for (const comp of schematic.components) {
					if (selectedIds.has(comp.id)) {
						comp.x += dx;
						comp.y += dy;
						// Also update pin positions
						for (const pin of comp.pins) {
							pin.x += dx;
							pin.y += dy;
						}
					}
				}

				// Move selected wires
				for (const wire of schematic.wires) {
					if (selectedWireIds.has(wire.id)) {
						wire.x1 += dx;
						wire.y1 += dy;
						wire.x2 += dx;
						wire.y2 += dy;
					}
				}

				// Move selected directives
				if (schematic.directives) {
					for (const directive of schematic.directives) {
						if (selectedDirectiveIds.has(directive.id)) {
							if (directive.x !== undefined) directive.x += dx;
							if (directive.y !== undefined) directive.y += dy;
						}
					}
				}

				// Update start position for next delta
				moveStartSchematicPos = currentSnapped;
			}
		} else if (isDragging && dragStart && !isMoving) {
			// Pan the view (only when not moving items)
			const dx = (e.offsetX - dragStart.x) * dpr;
			const dy = (e.offsetY - dragStart.y) * dpr;
			view.offsetX += dx;
			view.offsetY += dy;
			dragStart = { x: e.offsetX, y: e.offsetY };
		}
		render();
	}

	function handleMouseUp(e: MouseEvent) {
		// Handle probe mode mouseup
		if (mode === 'probe') {
			const clickPos = screenToSchematic(e.offsetX, e.offsetY);
			const snapped = snapToGrid(clickPos);
			// handleProbeMouseUp handles both single-click and differential probes
			handleProbeMouseUp(clickPos, snapped);
		}

		isDragging = false;
		dragStart = null;
		isMoving = false;
		moveStartSchematicPos = null;
	}

	function handleDoubleClick(e: MouseEvent) {
		const clickPos = screenToSchematic(e.offsetX, e.offsetY);

		// Check if clicking on a directive first
		if (findDirectiveAtPos(clickPos) && oneditdirectives) {
			oneditdirectives();
			return;
		}

		// Find component at click position
		const comp = findComponentAt(clickPos);
		if (comp && oneditcomponent) {
			// Emit event to open component edit modal
			oneditcomponent(comp);
		}
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const dpr = getDpr();
		const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
		const newScale = Math.max(0.1, Math.min(10, view.scale * zoomFactor));

		// Zoom toward mouse position
		const mx = e.offsetX * dpr;
		const my = e.offsetY * dpr;
		view.offsetX = mx - (mx - view.offsetX) * (newScale / view.scale);
		view.offsetY = my - (my - view.offsetY) * (newScale / view.scale);
		view.scale = newScale;

		render();
	}

	function handleKeyDown(e: KeyboardEvent) {
		// Escape cancels current operation and returns to select mode
		if (e.key === 'Escape') {
			cancelCurrentOperation();
			return;
		}

		// Mode shortcuts (number keys mapped from F-keys)
		// 3 = Wire (F3), 5 = Delete (F5), 7 = Move (F7)
		if (!e.ctrlKey && !e.metaKey && !e.altKey) {
			const modeKey = MODE_SHORTCUTS[e.key];
			if (modeKey) {
				setMode(modeKey);
				return;
			}

			// W key also enters wire mode (LTSpice shortcut)
			if (e.key === 'w' || e.key === 'W') {
				setMode('wire');
				return;
			}
		}

		// Space toggles wire direction while drawing
		if (e.key === ' ' && mode === 'wire' && wireDraw.isDrawing) {
			e.preventDefault();
			wireDraw = {
				...wireDraw,
				direction: wireDraw.direction === 'horizontal-first' ? 'vertical-first' : 'horizontal-first'
			};
			render();
			return;
		}

		// Component shortcuts - can switch component while placing
		if (!e.ctrlKey && !e.metaKey) {
			const compDef = getComponentByShortcut(e.key);
			if (compDef) {
				placingType = compDef.type;
				placingRotation = 0;
				placingMirror = false;
				mode = 'place';
				wireDraw = { ...DEFAULT_WIRE_DRAW };
				render();
				return;
			}
		}

		// Ctrl+R to rotate while placing or rotate selected
		if ((e.key === 'r' || e.key === 'R') && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			if (mode === 'place' && placingType) {
				placingRotation = nextRotation(placingRotation);
				render();
				return;
			}
			// Rotate selected components
			if (selectedIds.size > 0) {
				for (const comp of schematic.components) {
					if (selectedIds.has(comp.id)) {
						comp.rotation = nextRotation(comp.rotation);
					}
				}
				render();
				return;
			}
		}

		// Ctrl+E to mirror
		if ((e.key === 'e' || e.key === 'E') && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			if (mode === 'place' && placingType) {
				placingMirror = !placingMirror;
				render();
				return;
			}
			if (selectedIds.size > 0) {
				for (const comp of schematic.components) {
					if (selectedIds.has(comp.id)) {
						comp.mirror = !comp.mirror;
					}
				}
				render();
				return;
			}
		}

		// Delete selected components, wires, and directives
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selectedIds.size > 0 || selectedWireIds.size > 0 || selectedDirectiveIds.size > 0) {
				schematic.components = schematic.components.filter(c => !selectedIds.has(c.id));
				schematic.wires = schematic.wires.filter(w => !selectedWireIds.has(w.id));
				if (schematic.directives) {
					schematic.directives = schematic.directives.filter(d => !selectedDirectiveIds.has(d.id));
				}
				selectedIds = new Set();
				selectedWireIds = new Set();
				selectedDirectiveIds = new Set();
				render();
				return;
			}
		}

		// Grid toggle (Ctrl+G or Shift+G to avoid conflict with Ground)
		if ((e.key === 'g' || e.key === 'G') && (e.ctrlKey || e.shiftKey)) {
			e.preventDefault();
			grid.visible = !grid.visible;
			render();
			return;
		}

		// View controls
		if (e.key === 'Home' || (e.key === 'f' && mode !== 'place')) {
			view = { offsetX: canvas.width / 2, offsetY: canvas.height / 2, scale: 1 };
			render();
			return;
		}
		if (e.key === '+' || e.key === '=') {
			view.scale = Math.min(10, view.scale * 1.2);
			render();
			return;
		}
		if (e.key === '-' || e.key === '_') {
			view.scale = Math.max(0.1, view.scale / 1.2);
			render();
			return;
		}
	}

	/** Set editor mode */
	function setMode(newMode: EditorMode) {
		mode = newMode;
		placingType = null;
		wireDraw = { ...DEFAULT_WIRE_DRAW };
		selectedIds = new Set();
		selectedWireIds = new Set();
		selectedDirectiveIds = new Set();
		isMoving = false;
		moveStartSchematicPos = null;
		render();
	}

	/** Cancel current operation and return to select mode */
	function cancelCurrentOperation() {
		placingType = null;
		wireDraw = { ...DEFAULT_WIRE_DRAW };
		mode = 'select';
		selectedIds = new Set();
		selectedWireIds = new Set();
		selectedDirectiveIds = new Set();
		isMoving = false;
		moveStartSchematicPos = null;
		render();
	}

	// Re-render when schematic changes
	$effect(() => {
		if (schematic && ctx) {
			render();
		}
	});

	/** Get cursor style based on current mode */
	function getCursorStyle(): string {
		if (isDragging) return 'grabbing';
		switch (mode) {
			case 'delete': return 'not-allowed';
			case 'wire': return 'crosshair';
			case 'move': return 'move';
			case 'place': return 'copy';
			case 'duplicate': return 'copy';
			default: return 'default';
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="schematic-container" bind:this={container}>
	<canvas
		bind:this={canvas}
		class="schematic-canvas"
		style="cursor: {getCursorStyle()}"
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseleave={handleMouseUp}
		ondblclick={handleDoubleClick}
		onwheel={handleWheel}
		onkeydown={handleKeyDown}
		tabindex="0"
	></canvas>
	<div class="hud">{getHudText()}</div>
</div>

<style>
	.schematic-container {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.schematic-canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: block;
		outline: none;
	}

	.hud {
		position: absolute;
		bottom: 4px;
		left: 4px;
		background: rgba(0, 0, 0, 0.7);
		color: #888;
		font-family: monospace;
		font-size: 11px;
		padding: 2px 6px;
		pointer-events: none;
	}
</style>

