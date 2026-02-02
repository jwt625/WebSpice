/**
 * AC Analysis utilities for converting complex simulation results
 * to magnitude (dB) and phase (degrees) for Bode plot display
 */

import type { ComplexNumber, ComplexDataType } from '$lib/simulation/types';
import type { TraceData, TraceColor } from './types';
import { getTraceColor } from './types';

/**
 * Convert complex number to magnitude in dB
 * Magnitude = 20 * log10(|Z|) where |Z| = sqrt(real² + imag²)
 */
export function complexToMagnitudeDb(c: ComplexNumber): number {
	const magnitude = Math.sqrt(c.real * c.real + c.img * c.img);
	// Avoid log(0) - use a very small number instead
	if (magnitude < 1e-20) return -400; // -400 dB floor
	return 20 * Math.log10(magnitude);
}

/**
 * Convert complex number to phase in degrees
 * Phase = atan2(imag, real) * 180/π
 */
export function complexToPhase(c: ComplexNumber): number {
	return Math.atan2(c.img, c.real) * (180 / Math.PI);
}

/**
 * Extract frequency axis from complex simulation data
 * Returns the frequency values as a number array
 */
export function extractFrequencyAxis(data: ComplexDataType[]): number[] {
	for (const d of data) {
		if (d.type === 'frequency') {
			// Frequency data in AC analysis is also complex, but imaginary part is 0
			return d.values.map(c => c.real);
		}
	}
	return [];
}

/**
 * Convert complex data to magnitude trace (in dB)
 */
export function createMagnitudeTrace(
	data: ComplexDataType,
	colorIndex: number
): TraceData {
	const magnitudeValues = data.values.map(complexToMagnitudeDb);
	return {
		id: `${data.name}_mag`,
		name: `|${data.name}| (dB)`,
		type: 'magnitude',
		values: magnitudeValues,
		color: getTraceColor(colorIndex),
		visible: true
	};
}

/**
 * Convert complex data to phase trace (in degrees)
 */
export function createPhaseTrace(
	data: ComplexDataType,
	colorIndex: number
): TraceData {
	const phaseValues = data.values.map(complexToPhase);
	return {
		id: `${data.name}_phase`,
		name: `∠${data.name} (°)`,
		type: 'phase',
		values: phaseValues,
		color: getTraceColor(colorIndex),
		visible: true
	};
}

/**
 * Process all complex data into magnitude and phase traces
 * Returns separate arrays for magnitude and phase traces
 */
export function processAcResults(data: ComplexDataType[]): {
	frequencyData: number[];
	magnitudeTraces: TraceData[];
	phaseTraces: TraceData[];
} {
	const frequencyData = extractFrequencyAxis(data);
	const magnitudeTraces: TraceData[] = [];
	const phaseTraces: TraceData[] = [];
	
	let colorIndex = 0;
	
	for (const d of data) {
		// Skip frequency axis - it's the X axis, not a trace
		if (d.type === 'frequency') continue;
		
		// Create magnitude and phase traces for voltage/current data
		magnitudeTraces.push(createMagnitudeTrace(d, colorIndex));
		phaseTraces.push(createPhaseTrace(d, colorIndex));
		colorIndex++;
	}
	
	return { frequencyData, magnitudeTraces, phaseTraces };
}

/**
 * Check if simulation result is AC analysis (complex data with frequency)
 */
export function isAcAnalysis(data: ComplexDataType[]): boolean {
	return data.some(d => d.type === 'frequency');
}

