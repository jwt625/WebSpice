/**
 * Probe utilities for schematic canvas
 * Drawing and logic for voltage/current probes
 */

import type { Point, Wire, Schematic } from '../types';
import { pointOnWire, pointsEqual, analyzeConnectivity } from '$lib/netlist/connectivity';

/**
 * Draw a voltage probe shape (pointed tip like multimeter probe)
 */
export function drawVoltageProbe(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	color: string,
	label: string,
	scale: number
): void {
	const s = 1 / scale; // Scale factor

	ctx.save();
	ctx.translate(x, y);

	// Pointed tip
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(0, 0); // Tip
	ctx.lineTo(4 * s, -8 * s);
	ctx.lineTo(8 * s, -8 * s);
	ctx.lineTo(8 * s, -28 * s);
	ctx.lineTo(4 * s, -28 * s);
	ctx.lineTo(4 * s, -8 * s);
	ctx.closePath();
	ctx.fill();

	// Handle
	ctx.fillStyle = '#333333';
	ctx.fillRect(3 * s, -40 * s, 6 * s, 14 * s);

	// Label (+/-)
	ctx.fillStyle = '#ffffff';
	ctx.font = `bold ${10 * s}px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, 6 * s, -18 * s);

	ctx.restore();
}

/**
 * Draw a current clamp/transformer shape
 */
export function drawCurrentClamp(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	scale: number
): void {
	const s = 1 / scale;

	ctx.save();
	ctx.translate(x, y);

	// Clamp jaws (open loop shape)
	ctx.strokeStyle = '#ff8800';
	ctx.lineWidth = 3 * s;
	ctx.beginPath();
	// Left jaw
	ctx.arc(0, -15 * s, 12 * s, 0.3 * Math.PI, 0.9 * Math.PI);
	ctx.stroke();
	ctx.beginPath();
	// Right jaw
	ctx.arc(0, -15 * s, 12 * s, 0.1 * Math.PI, -0.1 * Math.PI, true);
	ctx.lineTo(6 * s, -15 * s);
	ctx.stroke();

	// Handle
	ctx.fillStyle = '#ff8800';
	ctx.fillRect(-4 * s, -30 * s, 8 * s, 8 * s);
	ctx.fillStyle = '#333333';
	ctx.fillRect(-3 * s, -45 * s, 6 * s, 16 * s);

	// "I" label
	ctx.fillStyle = '#ffffff';
	ctx.font = `bold ${8 * s}px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('I', 0, -26 * s);

	ctx.restore();
}

/**
 * Find the node name for a wire by using connectivity analysis
 */
export function findNodeForWire(startWire: Wire, schematic: Schematic): string | null {
	const connectivity = analyzeConnectivity(schematic);

	const wireEndpoints = [
		{ x: startWire.x1, y: startWire.y1 },
		{ x: startWire.x2, y: startWire.y2 }
	];

	// Find which net contains this wire's endpoints
	for (const net of connectivity.nets) {
		for (const ep of wireEndpoints) {
			for (const netPoint of net.points) {
				if (pointsEqual(ep, netPoint)) {
					return net.name;
				}
			}
		}
	}

	// Also check if any junction on this wire is part of a net
	for (const junc of schematic.junctions) {
		const jp = { x: junc.x, y: junc.y };
		if (pointOnWire(jp, startWire)) {
			for (const net of connectivity.nets) {
				for (const netPoint of net.points) {
					if (pointsEqual(jp, netPoint)) {
						return net.name;
					}
				}
			}
		}
	}

	return null;
}

