/**
 * Geometry utilities for schematic canvas
 * Pure functions for coordinate transforms, snapping, and wire routing
 */

import type { Point, ViewTransform, Component, Rotation } from '../types';
import { COMPONENT_DEFS } from '../component-defs';

/**
 * Convert screen coordinates to schematic coordinates
 */
export function screenToSchematic(
	sx: number,
	sy: number,
	view: ViewTransform,
	dpr: number
): Point {
	return {
		x: (sx * dpr - view.offsetX) / view.scale,
		y: (sy * dpr - view.offsetY) / view.scale
	};
}

/**
 * Convert schematic coordinates to screen coordinates
 */
export function schematicToScreen(
	px: number,
	py: number,
	view: ViewTransform,
	dpr: number
): Point {
	return {
		x: (px * view.scale + view.offsetX) / dpr,
		y: (py * view.scale + view.offsetY) / dpr
	};
}

/**
 * Snap a point to the grid
 */
export function snapToGrid(
	p: Point,
	gridSize: number,
	snapEnabled: boolean
): Point {
	if (!snapEnabled) return p;
	return {
		x: Math.round(p.x / gridSize) * gridSize,
		y: Math.round(p.y / gridSize) * gridSize
	};
}

/** Wire segment definition */
export interface WireSegment {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/** Wire routing direction */
export type WireDirection = 'horizontal-first' | 'vertical-first';

/**
 * Calculate Manhattan wire segments between two points
 * Returns 0, 1, or 2 segments depending on alignment
 */
export function getWireSegments(
	start: Point,
	end: Point,
	direction: WireDirection
): WireSegment[] {
	const segments: WireSegment[] = [];

	if (start.x === end.x && start.y === end.y) {
		return segments; // No wire needed
	}

	if (start.x === end.x || start.y === end.y) {
		// Straight line
		segments.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
	} else if (direction === 'horizontal-first') {
		// Horizontal then vertical
		segments.push({ x1: start.x, y1: start.y, x2: end.x, y2: start.y });
		segments.push({ x1: end.x, y1: start.y, x2: end.x, y2: end.y });
	} else {
		// Vertical then horizontal
		segments.push({ x1: start.x, y1: start.y, x2: start.x, y2: end.y });
		segments.push({ x1: start.x, y1: end.y, x2: end.x, y2: end.y });
	}

	return segments;
}

/**
 * Get world-space pin positions for a component
 * Applies rotation and mirror transforms to pin definitions
 */
export function getComponentPinPositions(comp: Component): Point[] {
	const def = COMPONENT_DEFS[comp.type];
	if (!def) return [];

	const rad = (comp.rotation * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);

	return def.pins.map((pin) => {
		// Apply mirror
		let px = comp.mirror ? -pin.x : pin.x;
		let py = pin.y;
		// Apply rotation
		const rx = px * cos - py * sin;
		const ry = px * sin + py * cos;
		// Translate to world position
		return { x: comp.x + rx, y: comp.y + ry };
	});
}

/**
 * Get all component pin positions in a schematic as a Set of "x,y" strings
 */
export function getAllPinPositions(components: Component[]): Set<string> {
	const pins = new Set<string>();
	for (const comp of components) {
		for (const pos of getComponentPinPositions(comp)) {
			pins.add(`${pos.x},${pos.y}`);
		}
	}
	return pins;
}

/**
 * Check if point lies on wire segment (not at endpoints)
 * Used for determining if a junction should be created
 */
export function isPointOnWireSegment(point: Point, wire: WireSegment): boolean {
	// Check if point is at an endpoint (no junction needed there)
	if (
		(point.x === wire.x1 && point.y === wire.y1) ||
		(point.x === wire.x2 && point.y === wire.y2)
	) {
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
