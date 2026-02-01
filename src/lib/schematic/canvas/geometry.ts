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

