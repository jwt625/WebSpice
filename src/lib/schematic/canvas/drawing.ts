/**
 * Drawing utilities for schematic canvas
 * Pure functions for rendering schematic elements
 */

import type { Point, ViewTransform, Wire, Junction, Component, NodeLabel, SpiceDirective } from '../types';
import { getAllPinPositions, type WireSegment } from './geometry';

/** Parameters for drawing the grid */
export interface GridDrawParams {
	ctx: CanvasRenderingContext2D;
	view: ViewTransform;
	gridSize: number;
	width: number;
	height: number;
	screenToSchematic: (sx: number, sy: number) => Point;
}

/** Draw grid dots at intersections */
export function drawGrid(params: GridDrawParams): void {
	const { ctx, view, gridSize, width, height, screenToSchematic } = params;
	const gs = gridSize;

	// Calculate visible range in schematic coords
	const topLeft = screenToSchematic(0, 0);
	const bottomRight = { x: (width - view.offsetX) / view.scale, y: (height - view.offsetY) / view.scale };

	const startX = Math.floor(topLeft.x / gs) * gs;
	const startY = Math.floor(topLeft.y / gs) * gs;
	const endX = Math.ceil(bottomRight.x / gs) * gs;
	const endY = Math.ceil(bottomRight.y / gs) * gs;

	// Draw dots at grid intersections
	ctx.fillStyle = '#444';
	const dotSize = Math.max(1, 2 / view.scale);

	for (let x = startX; x <= endX; x += gs) {
		for (let y = startY; y <= endY; y += gs) {
			ctx.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
		}
	}
}

/** Draw origin crosshair */
export function drawOrigin(ctx: CanvasRenderingContext2D, viewScale: number): void {
	const size = 20;
	ctx.strokeStyle = '#666';
	ctx.lineWidth = 1 / viewScale;
	ctx.beginPath();
	ctx.moveTo(-size, 0);
	ctx.lineTo(size, 0);
	ctx.moveTo(0, -size);
	ctx.lineTo(0, size);
	ctx.stroke();
}

/** Parameters for drawing wires */
export interface WireDrawParams {
	ctx: CanvasRenderingContext2D;
	viewScale: number;
	wires: Wire[];
	selectedWireIds: Set<string>;
	isDrawing: boolean;
	startPoint: Point | null;
	previewSegments: WireSegment[];
}

/** Draw wires (existing and preview) */
export function drawWires(params: WireDrawParams): void {
	const { ctx, viewScale, wires, selectedWireIds, isDrawing, startPoint, previewSegments } = params;

	ctx.lineCap = 'round';
	ctx.lineWidth = 2 / viewScale;

	// Draw existing wires
	for (const wire of wires) {
		const isSelected = selectedWireIds.has(wire.id);
		ctx.strokeStyle = isSelected ? '#ffff00' : '#00ff00';
		ctx.beginPath();
		ctx.moveTo(wire.x1, wire.y1);
		ctx.lineTo(wire.x2, wire.y2);
		ctx.stroke();
	}

	// Draw wire being drawn (preview)
	if (isDrawing && startPoint) {
		ctx.strokeStyle = '#00ff0080'; // Semi-transparent green
		ctx.setLineDash([5 / viewScale, 5 / viewScale]);

		for (const seg of previewSegments) {
			ctx.beginPath();
			ctx.moveTo(seg.x1, seg.y1);
			ctx.lineTo(seg.x2, seg.y2);
			ctx.stroke();
		}

		ctx.setLineDash([]);
	}
}

/** Parameters for drawing junctions */
export interface JunctionDrawParams {
	ctx: CanvasRenderingContext2D;
	viewScale: number;
	junctions: Junction[];
	wires: Wire[];
	components: Component[];
}

/** Draw junction dots - red for connections */
export function drawJunctions(params: JunctionDrawParams): void {
	const { ctx, viewScale, junctions, wires, components } = params;

	const dotRadius = 4 / viewScale;
	const pinPositions = getAllPinPositions(components);

	// Count wire endpoints at each position
	const wireEndpoints: Map<string, number> = new Map();
	for (const wire of wires) {
		const key1 = `${wire.x1},${wire.y1}`;
		const key2 = `${wire.x2},${wire.y2}`;
		wireEndpoints.set(key1, (wireEndpoints.get(key1) || 0) + 1);
		wireEndpoints.set(key2, (wireEndpoints.get(key2) || 0) + 1);
	}

	ctx.fillStyle = '#ff0000'; // Red like component terminals

	// Draw explicit junctions
	for (const junction of junctions) {
		ctx.beginPath();
		ctx.arc(junction.x, junction.y, dotRadius, 0, Math.PI * 2);
		ctx.fill();
	}

	// Draw connection dots at wire endpoints
	for (const [key, count] of wireEndpoints) {
		const [x, y] = key.split(',').map(Number);

		// Draw dot if wire endpoint is on a component pin or 3+ wire endpoints meet
		if (pinPositions.has(key) || count >= 3) {
			ctx.beginPath();
			ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}

/** Draw node labels */
export function drawNodeLabels(
	ctx: CanvasRenderingContext2D,
	viewScale: number,
	nodeLabels: NodeLabel[] | undefined
): void {
	if (!nodeLabels || nodeLabels.length === 0) return;

	const fontSize = Math.max(10, 12 / viewScale);
	ctx.font = `${fontSize}px monospace`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'bottom';

	for (const label of nodeLabels) {
		// Draw background
		const text = label.name;
		const metrics = ctx.measureText(text);
		const padding = 2 / viewScale;
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
export function drawDirectives(
	ctx: CanvasRenderingContext2D,
	viewScale: number,
	directives: SpiceDirective[] | undefined,
	selectedDirectiveIds: Set<string>
): void {
	if (!directives || directives.length === 0) return;

	const fontSize = Math.max(10, 14 / viewScale);
	ctx.font = `${fontSize}px monospace`;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';

	for (const directive of directives) {
		// Only draw directives that have position
		if (directive.x === undefined || directive.y === undefined) continue;

		const isSelected = selectedDirectiveIds.has(directive.id);
		const text = directive.text;
		const metrics = ctx.measureText(text);
		const padding = 3 / viewScale;
		const bgWidth = metrics.width + padding * 2;
		const bgHeight = fontSize + padding * 2;

		// Draw background - dark purple for directives, yellow tint if selected
		ctx.fillStyle = isSelected ? '#3a3a1a' : '#2a1a3a';
		ctx.fillRect(directive.x - padding, directive.y - padding, bgWidth, bgHeight);

		// Draw border - yellow if selected
		ctx.strokeStyle = isSelected ? '#ffff00' : '#6a4a8a';
		ctx.lineWidth = (isSelected ? 2 : 1) / viewScale;
		ctx.strokeRect(directive.x - padding, directive.y - padding, bgWidth, bgHeight);

		// Draw text - light purple/magenta for SPICE directives
		ctx.fillStyle = isSelected ? '#ffff88' : '#cc88ff';
		ctx.fillText(text, directive.x, directive.y);
	}
}

