<script lang="ts">
	import { onMount } from 'svelte';
	import type { Point, Schematic, Component, Wire, ProbeType } from './types';
	import { getModeName, MODE_SHORTCUTS } from './types';
	import type { ComponentType } from './types';
	import { renderComponent } from './component-renderer';
	import { COMPONENT_DEFS, getComponentByShortcut } from './component-defs';

	import {
		screenToSchematic as screenToSchematicUtil,
		snapToGrid as snapToGridUtil,
		getWireSegments,
		isPointOnWireSegment,
		findComponentAt as findComponentAtUtil,
		findWireAt as findWireAtUtil,
		findJunctionAt as findJunctionAtUtil,
		findDirectiveAtPos as findDirectiveAtPosUtil,
		drawVoltageProbe as drawVoltageProbeUtil,
		drawCurrentClamp as drawCurrentClampUtil,
		findNodeForWire as findNodeForWireUtil,
		drawGrid as drawGridUtil,
		drawOrigin as drawOriginUtil,
		drawWires as drawWiresUtil,
		drawJunctions as drawJunctionsUtil,
		drawNodeLabels as drawNodeLabelsUtil,
		drawDirectives as drawDirectivesUtil
	} from './canvas';

	import {
		type EditorState,
		type EditorAction,
		type HitTestResult,
		createInitialEditorState,
		getEditorMode,
		editorReducer,
		applyMutations
	} from './editor';

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

	// Consolidated editor state
	let editorState: EditorState = $state(createInitialEditorState());

	// Drag tracking (screen coordinates, not part of editor state)
	let lastScreenPos: Point | null = null;

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
			editorState.view.offsetX += (newWidth - canvas.width) / 2;
			editorState.view.offsetY += (newHeight - canvas.height) / 2;
		}

		canvas.width = newWidth;
		canvas.height = newHeight;

		render();
	}

	// Wrapper functions that use component state
	const screenToSchematic = (sx: number, sy: number): Point =>
		screenToSchematicUtil(sx, sy, editorState.view, getDpr());

	const snapToGrid = (p: Point): Point =>
		snapToGridUtil(p, editorState.grid.size, editorState.grid.snapEnabled);

	// Hit testing wrapper functions
	const findComponentAt = (pos: Point): Component | null =>
		findComponentAtUtil(pos, schematic.components);

	const findWireAt = (pos: Point, tolerance: number = 5): Wire | null =>
		findWireAtUtil(pos, schematic.wires, tolerance);

	const findJunctionAt = (pos: Point, tolerance: number = 8): import('./types').Junction | null =>
		findJunctionAtUtil(pos, schematic.junctions, tolerance);

	const findDirectiveAtPos = (pos: Point): import('./types').SpiceDirective | null => {
		if (!ctx) return null;
		return findDirectiveAtPosUtil(pos, schematic.directives, { ctx, viewScale: editorState.view.scale });
	};

	// Perform hit test at position
	function performHitTest(pos: Point): HitTestResult {
		return {
			component: findComponentAt(pos) ?? undefined,
			wire: findWireAt(pos) ?? undefined,
			junction: findJunctionAt(pos) ?? undefined,
			directive: findDirectiveAtPos(pos) ?? undefined
		};
	}

	// Dispatch an action through the reducer
	function dispatch(action: EditorAction): void {
		const result = editorReducer(editorState, action, schematic);
		editorState = result.state;
		if (result.mutations.length > 0) {
			applyMutations(schematic, result.mutations);
		}
		render();
	}

	function render() {
		if (!ctx || !canvas) return;
		const w = canvas.width, h = canvas.height;
		const { view, grid, selection, modeState, schematicPos } = editorState;

		// Clear
		ctx.fillStyle = '#1a1a1a';
		ctx.fillRect(0, 0, w, h);

		// Apply transform
		ctx.save();
		ctx.translate(view.offsetX, view.offsetY);
		ctx.scale(view.scale, view.scale);

		// Draw grid
		if (grid.visible) drawGridLocal(w, h, view, grid.size);

		// Draw origin crosshair
		drawOriginLocal(view.scale);

		// Draw wires
		drawWiresLocal(view.scale, modeState, schematicPos, selection.wireIds);

		// Draw components
		drawComponentsLocal(view.scale, modeState, schematicPos, selection.componentIds);

		// Draw node labels (if available)
		drawNodeLabelsLocal(view.scale);

		// Draw SPICE directives
		drawDirectivesLocal(view.scale, selection.directiveIds);

		// Draw probe cursor overlay in probe mode
		if (modeState.type === 'probing') {
			drawProbeCursorLocal(view.scale, modeState, schematicPos);
		}

		ctx.restore();
	}

	// Drawing functions using local parameters
	function drawGridLocal(w: number, h: number, view: import('./types').ViewTransform, gridSize: number) {
		if (!ctx) return;
		drawGridUtil({
			ctx,
			view,
			gridSize,
			width: w,
			height: h,
			screenToSchematic
		});
	}

	function drawOriginLocal(scale: number) {
		if (!ctx) return;
		drawOriginUtil(ctx, scale);
	}

	function drawWiresLocal(
		scale: number,
		modeState: import('./editor').ModeState,
		schematicPos: Point,
		selectedWireIds: Set<string>
	) {
		if (!ctx) return;
		const snapped = snapToGrid(schematicPos);
		const isDrawingWire = modeState.type === 'drawing-wire';
		const startPoint = isDrawingWire ? modeState.startPoint : null;
		const direction = isDrawingWire ? modeState.direction : 'horizontal-first';
		// Only show preview if first point has been placed (not at origin)
		const hasStartPoint = startPoint !== null && (startPoint.x !== 0 || startPoint.y !== 0);
		const previewSegments = hasStartPoint
			? getWireSegments(startPoint, snapped, direction)
			: [];

		drawWiresUtil({
			ctx,
			viewScale: scale,
			wires: schematic.wires,
			selectedWireIds,
			isDrawing: isDrawingWire && hasStartPoint,
			startPoint: hasStartPoint ? startPoint : null,
			previewSegments
		});

		// Draw junction dots where wires connect
		drawJunctionsLocal(scale);
	}

	function drawJunctionsLocal(scale: number) {
		if (!ctx) return;
		drawJunctionsUtil({
			ctx,
			viewScale: scale,
			junctions: schematic.junctions,
			wires: schematic.wires,
			components: schematic.components
		});
	}

	function drawComponentsLocal(
		scale: number,
		modeState: import('./editor').ModeState,
		schematicPos: Point,
		selectedIds: Set<string>
	) {
		if (!ctx) return;

		// Draw all placed components
		for (const comp of schematic.components) {
			const isSelected = selectedIds.has(comp.id);
			renderComponent(ctx, comp, scale, isSelected, false);
		}

		// Draw ghost component if placing
		if (modeState.type === 'placing') {
			const snapped = snapToGrid(schematicPos);
			const ghostComp: Component = {
				id: 'ghost',
				type: modeState.componentType,
				x: snapped.x,
				y: snapped.y,
				rotation: modeState.rotation,
				mirror: modeState.mirror,
				attributes: {},
				pins: []
			};
			renderComponent(ctx, ghostComp, scale, false, true);
		}
	}

	function drawNodeLabelsLocal(scale: number) {
		if (!ctx) return;
		drawNodeLabelsUtil(ctx, scale, schematic.nodeLabels);
	}

	function drawDirectivesLocal(scale: number, selectedDirectiveIds: Set<string>) {
		if (!ctx) return;
		drawDirectivesUtil(ctx, scale, schematic.directives, selectedDirectiveIds);
	}

	// Wrapper functions for probe drawing
	const drawVoltageProbeLocal = (x: number, y: number, color: string, label: string, scale: number): void => {
		if (!ctx) return;
		drawVoltageProbeUtil(ctx, x, y, color, label, scale);
	};

	const drawCurrentClampLocal = (x: number, y: number, scale: number): void => {
		if (!ctx) return;
		drawCurrentClampUtil(ctx, x, y, scale);
	};

	function drawProbeCursorLocal(
		scale: number,
		modeState: import('./editor').ModeState,
		schematicPos: Point
	) {
		if (!ctx || modeState.type !== 'probing') return;
		const pos = schematicPos;

		// Check what's under cursor
		const compUnder = findComponentAt(pos);
		const wireUnder = findWireAt(pos);

		// If holding for differential probe
		if (modeState.phase === 'holding-first' && modeState.firstNode) {
			// Draw RED (+) probe fixed at first node (positive reference)
			drawVoltageProbeLocal(modeState.firstNode.x, modeState.firstNode.y, '#ff0000', '+', scale);

			// Draw dashed line between probes
			ctx.strokeStyle = '#888888';
			ctx.lineWidth = 1 / scale;
			ctx.setLineDash([4 / scale, 4 / scale]);
			ctx.beginPath();
			ctx.moveTo(modeState.firstNode.x, modeState.firstNode.y);
			ctx.lineTo(pos.x, pos.y);
			ctx.stroke();
			ctx.setLineDash([]);

			// Draw BLACK (-) probe at cursor (negative reference)
			drawVoltageProbeLocal(pos.x, pos.y, '#000000', '-', scale);
		} else if (compUnder && compUnder.type !== 'ground') {
			// Current probe - draw clamp at cursor
			drawCurrentClampLocal(pos.x, pos.y, scale);
		} else if (wireUnder) {
			// Voltage probe - draw red probe at cursor
			drawVoltageProbeLocal(pos.x, pos.y, '#ff0000', '+', scale);
		} else {
			// Default - show faded probe at cursor
			ctx.globalAlpha = 0.4;
			drawVoltageProbeLocal(pos.x, pos.y, '#888888', '?', scale);
			ctx.globalAlpha = 1.0;
		}
	}

	function getHudText(): string {
		const { view, modeState, schematicPos, selection } = editorState;
		const snapped = snapToGrid(schematicPos);
		let text = `(${snapped.x}, ${snapped.y}) | Zoom: ${(view.scale * 100).toFixed(0)}%`;

		// Show current mode
		const mode = getEditorMode(modeState);
		text += ` | ${getModeName(mode as import('./types').EditorMode)}`;

		if (modeState.type === 'placing') {
			const def = COMPONENT_DEFS[modeState.componentType];
			text += `: ${def.name}`;
			if (modeState.rotation !== 0) text += ` R${modeState.rotation}`;
			if (modeState.mirror) text += ' M';
			text += ' | Ctrl+R=rotate, Ctrl+E=mirror, Esc=cancel';
		} else if (modeState.type === 'drawing-wire') {
			text += ' | Click to place segment, Space=toggle direction, Esc=cancel';
		} else if (mode === 'delete') {
			text += ' | Click to delete (junctions/components/wires), Esc=exit';
		} else if (mode === 'duplicate') {
			text += ' | Click on item to duplicate, Esc=exit';
		} else if (modeState.type === 'moving') {
			text += ' | Drag to move, Esc=exit';
		} else if (modeState.type === 'probing') {
			if (modeState.phase === 'holding-first') {
				text += ' | Release to measure V(+) - V(-), Esc=cancel';
			} else {
				text += ' | Click wire=V probe, Click component=I probe, Hold+drag=V diff';
			}
		} else if (selection.componentIds.size > 0 || selection.wireIds.size > 0 || selection.directiveIds.size > 0) {
			const total = selection.componentIds.size + selection.wireIds.size + selection.directiveIds.size;
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
		const hitTest = performHitTest(clickPos);
		const { modeState, selection } = editorState;

		lastScreenPos = { x: e.offsetX, y: e.offsetY };

		if (e.button === 0) { // Left click
			// Handle wire mode
			if (modeState.type === 'drawing-wire') {
				if (modeState.startPoint.x === 0 && modeState.startPoint.y === 0) {
					// Check if starting on existing wire - create junction
					maybeCreateJunctionOnWire(snapped);
					dispatch({ type: 'START_WIRE', point: snapped });
				} else {
					dispatch({ type: 'COMMIT_WIRE_SEGMENT', endPoint: snapped });
					maybeCreateJunctionOnWire(snapped);
				}
				return;
			}

			// Handle delete mode (idle with delete intent set via keyboard)
			if (getEditorMode(modeState) === 'delete') {
				handleDeleteClick(clickPos);
				return;
			}

			// Handle duplicate mode
			if (getEditorMode(modeState) === 'duplicate') {
				handleDuplicateClick(clickPos);
				return;
			}

			// Handle probe mode
			if (modeState.type === 'probing') {
				const nodeName = getNodeAtPosition(snapped);
				if (hitTest.component && hitTest.component.type !== 'ground') {
					dispatch({ type: 'PROBE_START', pos: snapped, nodeName, componentId: hitTest.component.id });
				} else if (hitTest.wire) {
					dispatch({ type: 'PROBE_START', pos: snapped, nodeName });
				}
				return;
			}

			// Handle component placement
			if (modeState.type === 'placing') {
				dispatch({ type: 'PLACE_COMPONENT' });
				return;
			}

			// Handle move mode
			if (modeState.type === 'moving') {
				if (hitTest.directive && !selection.directiveIds.has(hitTest.directive.id)) {
					dispatch({ type: 'SELECT', target: { directiveId: hitTest.directive.id }, additive: e.shiftKey });
				} else if (hitTest.component && !selection.componentIds.has(hitTest.component.id)) {
					dispatch({ type: 'SELECT', target: { componentId: hitTest.component.id }, additive: e.shiftKey });
				} else if (hitTest.wire && !selection.wireIds.has(hitTest.wire.id)) {
					dispatch({ type: 'SELECT', target: { wireId: hitTest.wire.id }, additive: e.shiftKey });
				}
				dispatch({ type: 'START_MOVE', startPos: snapped });
				return;
			}

			// Select mode - check for selection
			if (hitTest.directive) {
				dispatch({ type: 'SELECT', target: { directiveId: hitTest.directive.id }, additive: e.shiftKey });
			} else if (hitTest.component) {
				dispatch({ type: 'SELECT', target: { componentId: hitTest.component.id }, additive: e.shiftKey });
			} else if (hitTest.wire) {
				dispatch({ type: 'SELECT', target: { wireId: hitTest.wire.id }, additive: e.shiftKey });
			} else if (!e.shiftKey) {
				dispatch({ type: 'CLEAR_SELECTION' });
			}

			// Prepare for potential view drag
			dispatch({ type: 'START_VIEW_DRAG', screenPos: { x: e.offsetX, y: e.offsetY } });
		} else if (e.button === 1) { // Middle click - always pan
			dispatch({ type: 'START_VIEW_DRAG', screenPos: { x: e.offsetX, y: e.offsetY } });
		}
	}

	/** Create junction if point is on an existing wire (not at endpoint) */
	function maybeCreateJunctionOnWire(point: Point) {
		for (const wire of schematic.wires) {
			if (isPointOnWireSegment(point, wire)) {
				dispatch({ type: 'CREATE_JUNCTION', pos: point });
				return;
			}
		}
	}

	/** Handle click in delete mode */
	function handleDeleteClick(clickPos: Point) {
		const junction = findJunctionAt(clickPos);
		const comp = findComponentAt(clickPos);
		const wire = findWireAt(clickPos);

		dispatch({
			type: 'DELETE_AT',
			target: {
				componentIds: comp ? [comp.id] : [],
				wireIds: wire ? [wire.id] : [],
				junctionIds: junction ? [junction.id] : [],
				directiveIds: []
			}
		});
	}

	/** Handle click in duplicate mode */
	function handleDuplicateClick(clickPos: Point) {
		const comp = findComponentAt(clickPos);
		const wire = findWireAt(clickPos);
		dispatch({
			type: 'DUPLICATE_AT',
			pos: clickPos,
			componentId: comp?.id,
			wireId: wire?.id
		});
	}

	/** Get node name at a position (from nodeLabels) - works on wires too */
	function getNodeAtPosition(pos: Point): string | null {
		if (!schematic.nodeLabels || schematic.nodeLabels.length === 0) {
			return null;
		}

		const clickedWire = findWireAt(pos);
		if (clickedWire) {
			const nodeName = findNodeForWire(clickedWire);
			if (nodeName) return nodeName;
		}

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

		if (onprobe) {
			onprobe({ type, node1, node2, componentId, label });
		}
	}

	function handleMouseMove(e: MouseEvent) {
		const dpr = getDpr();
		const schematicPos = screenToSchematic(e.offsetX, e.offsetY);
		const snappedPos = snapToGrid(schematicPos);
		const { modeState } = editorState;

		// Update mouse position in state
		dispatch({ type: 'UPDATE_MOUSE_POS', screenPos: { x: e.offsetX, y: e.offsetY }, schematicPos });

		// Calculate screen delta for view dragging
		const screenDelta = lastScreenPos
			? { x: (e.offsetX - lastScreenPos.x) * dpr, y: (e.offsetY - lastScreenPos.y) * dpr }
			: { x: 0, y: 0 };

		// Handle view dragging
		if (modeState.type === 'dragging-view' && (e.buttons & 1 || e.buttons & 4)) {
			dispatch({ type: 'PAN', dx: screenDelta.x, dy: screenDelta.y });
			lastScreenPos = { x: e.offsetX, y: e.offsetY };
			return;
		}

		// Handle moving selected items
		if (modeState.type === 'moving' && modeState.startPos && (e.buttons & 1)) {
			dispatch({ type: 'MOVE_SELECTED', delta: { x: snappedPos.x - modeState.startPos.x, y: snappedPos.y - modeState.startPos.y } });
		}

		lastScreenPos = { x: e.offsetX, y: e.offsetY };
	}

	function handleMouseUp(e: MouseEvent) {
		const { modeState } = editorState;
		const clickPos = screenToSchematic(e.offsetX, e.offsetY);
		const snapped = snapToGrid(clickPos);

		// Handle probe mode mouseup
		if (modeState.type === 'probing' && modeState.phase === 'holding-first' && modeState.firstNode) {
			const secondNodeName = getNodeAtPosition(snapped);
			const dragDist = Math.hypot(snapped.x - modeState.firstNode.x, snapped.y - modeState.firstNode.y);
			const isDrag = dragDist > 20;

			if (isDrag && secondNodeName && modeState.firstNodeName && secondNodeName !== modeState.firstNodeName) {
				// Differential voltage probe
				addProbe('voltage-diff', modeState.firstNodeName, undefined, secondNodeName);
			} else if (modeState.firstNodeName) {
				// Single voltage probe
				addProbe('voltage', modeState.firstNodeName);
			}
			dispatch({ type: 'PROBE_COMPLETE' });
		} else if (modeState.type === 'probing' && modeState.targetComponentId) {
			// Current probe on component
			const comp = schematic.components.find(c => c.id === modeState.targetComponentId);
			if (comp) {
				const instName = comp.attributes['InstName'] || comp.id;
				addProbe('current', instName, comp.id);
			}
			dispatch({ type: 'PROBE_COMPLETE' });
		}

		// End view dragging or moving
		if (modeState.type === 'dragging-view') {
			dispatch({ type: 'END_VIEW_DRAG' });
		} else if (modeState.type === 'moving') {
			dispatch({ type: 'END_MOVE' });
		}

		lastScreenPos = null;
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
		dispatch({ type: 'ZOOM', factor: zoomFactor, center: { x: e.offsetX * dpr, y: e.offsetY * dpr } });
	}

	function handleKeyDown(e: KeyboardEvent) {
		const { modeState, selection } = editorState;

		// Escape cancels current operation and returns to select mode
		if (e.key === 'Escape') {
			dispatch({ type: 'CANCEL' });
			return;
		}

		// Mode shortcuts (number keys mapped from F-keys)
		if (!e.ctrlKey && !e.metaKey && !e.altKey) {
			const modeKey = MODE_SHORTCUTS[e.key];
			if (modeKey) {
				dispatch({ type: 'SET_MODE', mode: modeKey as 'select' | 'wire' | 'delete' | 'duplicate' | 'move' | 'probe' });
				return;
			}

			// W key also enters wire mode
			if (e.key === 'w' || e.key === 'W') {
				dispatch({ type: 'SET_MODE', mode: 'wire' });
				return;
			}
		}

		// Space toggles wire direction while drawing
		if (e.key === ' ' && modeState.type === 'drawing-wire') {
			e.preventDefault();
			dispatch({ type: 'TOGGLE_WIRE_DIRECTION' });
			return;
		}

		// Component shortcuts
		if (!e.ctrlKey && !e.metaKey) {
			const compDef = getComponentByShortcut(e.key);
			if (compDef) {
				dispatch({ type: 'START_PLACING', componentType: compDef.type as ComponentType });
				return;
			}
		}

		// Ctrl+R to rotate
		if ((e.key === 'r' || e.key === 'R') && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			if (modeState.type === 'placing') {
				dispatch({ type: 'ROTATE_PLACING' });
			} else if (selection.componentIds.size > 0) {
				dispatch({ type: 'ROTATE_SELECTED' });
			}
			return;
		}

		// Ctrl+E to mirror
		if ((e.key === 'e' || e.key === 'E') && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			if (modeState.type === 'placing') {
				dispatch({ type: 'MIRROR_PLACING' });
			} else if (selection.componentIds.size > 0) {
				dispatch({ type: 'MIRROR_SELECTED' });
			}
			return;
		}

		// Delete selected
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selection.componentIds.size > 0 || selection.wireIds.size > 0 || selection.directiveIds.size > 0) {
				dispatch({ type: 'DELETE_SELECTED' });
				return;
			}
		}

		// Grid toggle
		if ((e.key === 'g' || e.key === 'G') && (e.ctrlKey || e.shiftKey)) {
			e.preventDefault();
			dispatch({ type: 'TOGGLE_GRID' });
			return;
		}

		// View controls
		if (e.key === 'Home' || (e.key === 'f' && modeState.type !== 'placing')) {
			dispatch({ type: 'RESET_VIEW', canvasWidth: canvas.width, canvasHeight: canvas.height });
			return;
		}
		if (e.key === '+' || e.key === '=') {
			dispatch({ type: 'ZOOM', factor: 1.2, center: { x: canvas.width / 2, y: canvas.height / 2 } });
			return;
		}
		if (e.key === '-' || e.key === '_') {
			dispatch({ type: 'ZOOM', factor: 1 / 1.2, center: { x: canvas.width / 2, y: canvas.height / 2 } });
			return;
		}
	}

	// Re-render when schematic changes
	$effect(() => {
		if (schematic && ctx) {
			render();
		}
	});

	/** Get cursor style based on current mode */
	function getCursorStyle(): string {
		const { modeState } = editorState;
		if (modeState.type === 'dragging-view') return 'grabbing';
		switch (modeState.type) {
			case 'placing': return 'copy';
			case 'drawing-wire': return 'crosshair';
			case 'moving': return 'move';
			case 'probing': return 'crosshair';
			default:
				// Check for delete/duplicate in idle mode
				const mode = getEditorMode(modeState);
				if (mode === 'delete') return 'not-allowed';
				if (mode === 'duplicate') return 'copy';
				return 'default';
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

