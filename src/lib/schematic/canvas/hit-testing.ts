/**
 * Hit testing utilities for schematic canvas
 * Functions for finding elements at positions
 */

import type { Point, Component, Wire, Junction, SpiceDirective } from '../types';
import { hitTestComponent } from '../component-renderer';

/**
 * Find component at position (searches in reverse order for top-most)
 */
export function findComponentAt(pos: Point, components: Component[]): Component | null {
	for (let i = components.length - 1; i >= 0; i--) {
		const comp = components[i];
		if (hitTestComponent(comp, pos.x, pos.y)) {
			return comp;
		}
	}
	return null;
}

/**
 * Hit test for wire segment - checks if point is within tolerance of wire
 */
export function hitTestWire(
	wire: Wire,
	px: number,
	py: number,
	tolerance: number
): boolean {
	// Distance from point to line segment
	const dx = wire.x2 - wire.x1;
	const dy = wire.y2 - wire.y1;
	const len2 = dx * dx + dy * dy;

	if (len2 === 0) {
		// Wire is a point
		return Math.hypot(px - wire.x1, py - wire.y1) <= tolerance;
	}

	// Project point onto line
	const t = Math.max(0, Math.min(1, ((px - wire.x1) * dx + (py - wire.y1) * dy) / len2));
	const projX = wire.x1 + t * dx;
	const projY = wire.y1 + t * dy;

	return Math.hypot(px - projX, py - projY) <= tolerance;
}

/**
 * Find wire at position (searches in reverse order for top-most)
 */
export function findWireAt(
	pos: Point,
	wires: Wire[],
	tolerance: number = 5
): Wire | null {
	for (let i = wires.length - 1; i >= 0; i--) {
		const wire = wires[i];
		if (hitTestWire(wire, pos.x, pos.y, tolerance)) {
			return wire;
		}
	}
	return null;
}

/**
 * Find junction at position
 */
export function findJunctionAt(
	pos: Point,
	junctions: Junction[],
	tolerance: number = 8
): Junction | null {
	for (const junction of junctions) {
		const dist = Math.hypot(pos.x - junction.x, pos.y - junction.y);
		if (dist <= tolerance) {
			return junction;
		}
	}
	return null;
}

/**
 * Parameters needed for directive hit testing
 */
export interface DirectiveHitTestParams {
	ctx: CanvasRenderingContext2D;
	viewScale: number;
}

/**
 * Find directive at a given position
 * Requires canvas context for text measurement
 */
export function findDirectiveAtPos(
	pos: Point,
	directives: SpiceDirective[] | undefined,
	params: DirectiveHitTestParams
): SpiceDirective | null {
	if (!directives || directives.length === 0) return null;

	const { ctx, viewScale } = params;
	const fontSize = Math.max(10, 14 / viewScale);
	ctx.font = `${fontSize}px monospace`;

	for (const directive of directives) {
		if (directive.x === undefined || directive.y === undefined) continue;

		const text = directive.text;
		const metrics = ctx.measureText(text);
		const padding = 3 / viewScale;
		const bgWidth = metrics.width + padding * 2;
		const bgHeight = fontSize + padding * 2;

		// Check if click is within directive bounds
		if (
			pos.x >= directive.x - padding &&
			pos.x <= directive.x - padding + bgWidth &&
			pos.y >= directive.y - padding &&
			pos.y <= directive.y - padding + bgHeight
		) {
			return directive;
		}
	}
	return null;
}

