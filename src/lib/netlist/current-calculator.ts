/**
 * Calculate component currents from node voltages
 *
 * NGSpice only outputs currents for voltage sources and inductors by default.
 * This module computes currents for resistors, capacitors, and diodes from node voltages.
 */

import type { Schematic, Component } from '../schematic/types';
import type { RealDataType } from '../simulation/types';
import { analyzeConnectivity } from './connectivity';
import { PIN_ORDER } from './types';
import { findModel } from '../models';

/** Expand parameter references like {CC} using the parameters map */
function expandParameters(value: string, parameters: Record<string, string>): string {
	return value.replace(/\{(\w+)\}/g, (match, paramName) => {
		const paramValue = parameters[paramName];
		if (paramValue !== undefined) {
			return paramValue;
		}
		return match;
	});
}

/** Parse component value with SI prefixes (e.g., "1k" -> 1000, "1u" -> 1e-6) */
export function parseValue(valueStr: string): number {
	const match = valueStr.match(/^([+-]?[\d.]+)\s*([a-zA-Z]*)/);
	if (!match) return NaN;

	const num = parseFloat(match[1]);
	const suffix = match[2].toLowerCase();

	const multipliers: Record<string, number> = {
		't': 1e12, 'g': 1e9, 'meg': 1e6, 'k': 1e3,
		'm': 1e-3, 'u': 1e-6, 'n': 1e-9, 'p': 1e-12, 'f': 1e-15,
		'': 1
	};

	return num * (multipliers[suffix] ?? 1);
}

/** Parse diode model parameters from model string */
function parseDiodeParams(modelParams: string): { Is: number; N: number; Rs: number } {
	// Default values for 1N4148-like diode
	let Is = 2.52e-9;  // Saturation current
	let N = 1.752;     // Ideality factor
	let Rs = 0.568;    // Series resistance

	// Parse Is=value
	const isMatch = modelParams.match(/Is\s*=\s*([\d.e+-]+)/i);
	if (isMatch) Is = parseFloat(isMatch[1]);

	// Parse N=value
	const nMatch = modelParams.match(/N\s*=\s*([\d.e+-]+)/i);
	if (nMatch) N = parseFloat(nMatch[1]);

	// Parse Rs=value
	const rsMatch = modelParams.match(/Rs\s*=\s*([\d.e+-]+)/i);
	if (rsMatch) Rs = parseFloat(rsMatch[1]);

	return { Is, N, Rs };
}

/** Calculate diode current using Shockley equation: I = Is * (exp(V/(N*Vt)) - 1) */
function calculateDiodeCurrent(vDiff: number[], Is: number, N: number, Rs: number): number[] {
	const Vt = 0.02585;  // Thermal voltage at 300K (kT/q)

	return vDiff.map(v => {
		// For large forward voltages, limit exponential to avoid overflow
		const vd = Math.min(v, 1.0);  // Clamp to reasonable diode voltage

		// Shockley equation (ignoring Rs for simplicity in first approximation)
		// For more accuracy, would need Newton-Raphson to solve V = Vd + I*Rs
		const exponent = vd / (N * Vt);
		if (exponent > 40) {
			// Avoid overflow - use linear approximation for large forward bias
			return Is * Math.exp(40) * (1 + exponent - 40);
		} else if (exponent < -40) {
			// Reverse bias - current is approximately -Is
			return -Is;
		}
		return Is * (Math.exp(exponent) - 1);
	});
}

/** Get node names for a component's pins */
function getComponentNodes(comp: Component, schematic: Schematic): { node1: string; node2: string } | null {
	const connectivity = analyzeConnectivity(schematic);
	const pinOrder = PIN_ORDER[comp.type];
	if (!pinOrder || pinOrder.length < 2) return null;
	
	const pinToNet = new Map<string, string>();
	for (const pc of connectivity.pinConnections) {
		if (pc.componentId === comp.id) {
			const net = connectivity.nets.find(n => n.id === pc.netId);
			pinToNet.set(pc.pinName, net?.name || '0');
		}
	}
	
	const node1 = pinToNet.get(pinOrder[0]) || '0';
	const node2 = pinToNet.get(pinOrder[1]) || '0';
	return { node1, node2 };
}

/** Compute numerical derivative: dv/dt */
function derivative(values: number[], timeData: number[]): number[] {
	const result: number[] = new Array(values.length);
	for (let i = 0; i < values.length; i++) {
		if (i === 0) {
			// Forward difference for first point
			const dt = timeData[1] - timeData[0];
			result[i] = dt > 0 ? (values[1] - values[0]) / dt : 0;
		} else if (i === values.length - 1) {
			// Backward difference for last point
			const dt = timeData[i] - timeData[i - 1];
			result[i] = dt > 0 ? (values[i] - values[i - 1]) / dt : 0;
		} else {
			// Central difference for middle points
			const dt = timeData[i + 1] - timeData[i - 1];
			result[i] = dt > 0 ? (values[i + 1] - values[i - 1]) / dt : 0;
		}
	}
	return result;
}

/** Calculate current for a specific component */
export function calculateComponentCurrent(
	comp: Component,
	schematic: Schematic,
	simData: RealDataType[],
	timeData: number[]
): RealDataType | null {
	const instName = comp.attributes['InstName'];
	if (!instName) return null;

	// Get component nodes
	const nodes = getComponentNodes(comp, schematic);
	if (!nodes) return null;

	// Find voltage data for both nodes
	const findVoltage = (nodeName: string): number[] | null => {
		if (nodeName === '0') return new Array(timeData.length).fill(0);
		const data = simData.find(d => d.name.toLowerCase() === `v(${nodeName.toLowerCase()})`);
		return data ? data.values as number[] : null;
	};

	const v1 = findVoltage(nodes.node1);
	const v2 = findVoltage(nodes.node2);
	if (!v1 || !v2) return null;

	// Calculate voltage across component
	const vDiff = v1.map((v, i) => v - v2[i]);

	// Get schematic parameters for value expansion
	const parameters = schematic.parameters || {};

	let current: number[];

	if (comp.type === 'diode') {
		// For diodes, use Shockley equation: I = Is * (exp(V/(N*Vt)) - 1)
		const modelName = comp.attributes['Value'] || '1N4148';
		const model = findModel(modelName);

		let diodeParams = { Is: 2.52e-9, N: 1.752, Rs: 0.568 };  // Default 1N4148
		if (model) {
			diodeParams = parseDiodeParams(model.params);
		}

		current = calculateDiodeCurrent(vDiff, diodeParams.Is, diodeParams.N, diodeParams.Rs);
	} else {
		// Get component value (with parameter expansion)
		const rawValueStr = comp.attributes['Value'] || '';
		const valueStr = expandParameters(rawValueStr, parameters);
		const value = parseValue(valueStr);

		if (isNaN(value) || value === 0) return null;

		if (comp.type === 'resistor') {
			// I = V / R (Ohm's law)
			current = vDiff.map(v => v / value);
		} else if (comp.type === 'capacitor') {
			// I = C * dV/dt
			const dvdt = derivative(vDiff, timeData);
			current = dvdt.map(dv => value * dv);
		} else if (comp.type === 'inductor') {
			// For inductors, V = L * dI/dt - integration is complex and prone to drift
			// NGSpice should provide inductor currents directly
			return null;
		} else {
			return null;
		}
	}

	return {
		name: `I(${instName})`,
		type: 'current',
		values: current
	};
}

/** Calculate all missing component currents */
export function calculateMissingCurrents(
	schematic: Schematic,
	simData: RealDataType[],
	timeData: number[]
): RealDataType[] {
	const results: RealDataType[] = [];
	const existingCurrents = new Set(
		simData.filter(d => d.type === 'current').map(d => d.name.toLowerCase())
	);
	
	for (const comp of schematic.components) {
		if (comp.type !== 'resistor' && comp.type !== 'capacitor') continue;
		
		const instName = comp.attributes['InstName'];
		if (!instName) continue;
		
		// Skip if current already exists in simulation data
		if (existingCurrents.has(`i(${instName.toLowerCase()})`)) continue;
		
		const current = calculateComponentCurrent(comp, schematic, simData, timeData);
		if (current) {
			results.push(current);
		}
	}
	
	return results;
}

