/**
 * SPICE netlist generator
 * Converts schematic to SPICE netlist text
 */

import type { Schematic, Component } from '../schematic/types';
import type { GeneratedNetlist, SpiceComponent, PinConnection } from './types';
import { COMPONENT_PREFIX, DEFAULT_VALUES, PIN_ORDER } from './types';
import { analyzeConnectivity } from './connectivity';
import { findModel, getModelDirective } from '../models';

/** Expand parameter references like {CC} using the parameters map */
function expandParameters(value: string, parameters: Record<string, string>): string {
	return value.replace(/\{(\w+)\}/g, (match, paramName) => {
		const paramValue = parameters[paramName];
		if (paramValue !== undefined) {
			return paramValue;
		}
		// Keep original if parameter not found (will cause SPICE error, but that's informative)
		return match;
	});
}

/**
 * Fix .tran directive for ngspice compatibility
 * LTSpice format: .tran [Tstep] Tstop [Tstart [dTmax]] [modifiers]
 * LTSpice allows Tstep=0 (auto-calculate), but ngspice requires Tstep > 0
 *
 * Examples:
 *   ".tran 0 2 0 1m" -> ".tran 1m 2 0 1m" (use dTmax as Tstep if available)
 *   ".tran 0 10m" -> ".tran 10u 10m" (use Tstop/1000 as default Tstep)
 */
function fixTranDirective(text: string): string {
	// Match .tran with optional parameters
	const match = text.match(/^\.tran\s+(\S+)\s+(\S+)(?:\s+(\S+))?(?:\s+(\S+))?(.*)$/i);
	if (!match) return text;

	let [, tstep, tstop, tstart, dtmax, rest] = match;

	// Check if Tstep is 0 or very small
	const tstepVal = parseSpiceValue(tstep);
	if (tstepVal <= 0) {
		// Try to use dTmax if available
		if (dtmax) {
			const dtmaxVal = parseSpiceValue(dtmax);
			if (dtmaxVal > 0) {
				tstep = dtmax;
			} else {
				// Fall back to Tstop/1000
				tstep = formatSpiceValue(parseSpiceValue(tstop) / 1000);
			}
		} else {
			// Use Tstop/1000 as reasonable default
			tstep = formatSpiceValue(parseSpiceValue(tstop) / 1000);
		}
	}

	// Reconstruct the directive
	let result = `.tran ${tstep} ${tstop}`;
	if (tstart !== undefined) result += ` ${tstart}`;
	if (dtmax !== undefined) result += ` ${dtmax}`;
	if (rest && rest.trim()) result += rest;

	return result;
}

/** Parse SPICE value with suffix (e.g., "1u" -> 1e-6, "10m" -> 0.01) */
function parseSpiceValue(value: string): number {
	const match = value.match(/^([+-]?[\d.]+)([a-zA-Z]*)$/);
	if (!match) return parseFloat(value) || 0;

	const num = parseFloat(match[1]);
	const suffix = match[2].toLowerCase();

	const multipliers: Record<string, number> = {
		't': 1e12, 'g': 1e9, 'meg': 1e6, 'k': 1e3,
		'm': 1e-3, 'u': 1e-6, 'n': 1e-9, 'p': 1e-12, 'f': 1e-15
	};

	return num * (multipliers[suffix] || 1);
}

/** Format number as SPICE value with appropriate suffix */
function formatSpiceValue(value: number): string {
	if (value === 0) return '0';

	const absVal = Math.abs(value);
	const suffixes: [number, string][] = [
		[1e-15, 'f'], [1e-12, 'p'], [1e-9, 'n'], [1e-6, 'u'], [1e-3, 'm'],
		[1, ''], [1e3, 'k'], [1e6, 'meg'], [1e9, 'g'], [1e12, 't']
	];

	for (let i = suffixes.length - 1; i >= 0; i--) {
		const [mult, suffix] = suffixes[i];
		if (absVal >= mult) {
			const scaled = value / mult;
			// Use reasonable precision
			const formatted = scaled.toPrecision(3).replace(/\.?0+$/, '');
			return formatted + suffix;
		}
	}

	return value.toString();
}

/** Generate SPICE netlist from schematic */
export function generateNetlist(schematic: Schematic, title: string = 'Untitled Circuit'): GeneratedNetlist {
	const result: GeneratedNetlist = {
		title,
		components: [],
		directives: [],
		errors: [],
		warnings: []
	};

	// Get parameters from schematic (or empty object)
	const parameters = schematic.parameters || {};

	// Analyze connectivity
	const connectivity = analyzeConnectivity(schematic);

	// Add connectivity errors/warnings
	for (const err of connectivity.errors) {
		if (err.startsWith('Warning:')) {
			result.warnings.push(err);
		} else {
			result.errors.push(err);
		}
	}

	// Build a map of component pins to net names
	const pinToNet = new Map<string, string>();
	for (const pc of connectivity.pinConnections) {
		const key = `${pc.componentId}:${pc.pinName}`;
		const net = connectivity.nets.find(n => n.id === pc.netId);
		pinToNet.set(key, net?.name || '?');
	}

	// Generate SPICE components (with parameter expansion)
	for (const comp of schematic.components) {
		// Skip ground - it's not a component, it defines node 0
		if (comp.type === 'ground') continue;

		const spiceComp = componentToSpice(comp, pinToNet, parameters);
		if (spiceComp) {
			result.components.push(spiceComp);
		} else {
			result.errors.push(`Failed to generate SPICE for ${comp.attributes['InstName'] || comp.id}`);
		}
	}

	// Note: eecircuit-engine doesn't support .save directive, so we calculate
	// resistor/capacitor currents client-side from node voltages instead.
	// See current-calculator.ts for the implementation.

	// Add .param directives first
	for (const [name, value] of Object.entries(parameters)) {
		result.directives.push(`.param ${name}=${value}`);
	}

	// Collect model names referenced by components (diodes, BJTs, MOSFETs)
	const referencedModels = new Set<string>();
	for (const comp of schematic.components) {
		if (comp.type === 'diode' || comp.type === 'npn' || comp.type === 'pnp' || comp.type === 'nmos' || comp.type === 'pmos') {
			const modelName = comp.attributes['Value'];
			if (modelName) {
				referencedModels.add(modelName);
			}
		}
	}

	// Track which models are already defined in schematic
	const definedModels = new Set<string>();
	if (schematic.models) {
		for (const model of schematic.models) {
			definedModels.add(model.name.toUpperCase());
		}
	}

	// Add .model directives from schematic
	if (schematic.models) {
		for (const model of schematic.models) {
			result.directives.push(`.model ${model.name} ${model.type}(${model.params})`);
		}
	}

	// Look up missing models from the component library
	for (const modelName of referencedModels) {
		if (!definedModels.has(modelName.toUpperCase())) {
			const libraryModel = findModel(modelName);
			if (libraryModel) {
				result.directives.push(getModelDirective(libraryModel));
				definedModels.add(libraryModel.name.toUpperCase());
			} else {
				result.warnings.push(`Warning: Model "${modelName}" not found in library`);
			}
		}
	}

	// Add simulation directive from schematic or use default
	let hasSimDirective = false;
	if (schematic.directives) {
		for (const dir of schematic.directives) {
			if (dir.type === 'tran' || dir.type === 'ac' || dir.type === 'dc' || dir.type === 'op') {
				// Fix .tran directives with TSTEP=0 (LTSpice allows this, ngspice doesn't)
				const fixedText = fixTranDirective(dir.text);
				result.directives.push(fixedText);
				hasSimDirective = true;
			}
		}
	}
	if (!hasSimDirective) {
		// Default simulation directive
		result.directives.push('.tran 1u 10m');
	}

	result.directives.push('.end');

	return result;
}

/** Convert a component to SPICE format */
function componentToSpice(
	comp: Component,
	pinToNet: Map<string, string>,
	parameters: Record<string, string> = {}
): SpiceComponent | null {
	const prefix = COMPONENT_PREFIX[comp.type];
	if (prefix === undefined || prefix === '') return null;

	const instName = comp.attributes['InstName'] || `${prefix}?`;
	const rawValue = comp.attributes['Value'] || DEFAULT_VALUES[comp.type] || '';

	// Expand parameter references like {CC} -> 1u
	const value = expandParameters(rawValue, parameters);

	// Get node names in correct order
	const pinOrder = PIN_ORDER[comp.type];
	if (!pinOrder) return null;

	const nodes: string[] = [];
	for (const pinName of pinOrder) {
		const key = `${comp.id}:${pinName}`;
		const netName = pinToNet.get(key);
		if (netName) {
			nodes.push(netName);
		} else {
			nodes.push('?');
		}
	}

	// For diodes, the value is the model name, add it as 'extra'
	// SPICE format: Dname node1 node2 modelname
	if (comp.type === 'diode') {
		return {
			prefix,
			name: instName,
			nodes,
			value: '',
			extra: value || 'D'  // Model name or default 'D'
		};
	}

	return {
		prefix,
		name: instName,
		nodes,
		value
	};
}

/** Convert generated netlist to text */
export function netlistToText(netlist: GeneratedNetlist): string {
	const lines: string[] = [];
	
	// Title line (first line is always the title in SPICE)
	lines.push(`* ${netlist.title}`);
	lines.push('');
	
	// Add warnings as comments
	for (const warn of netlist.warnings) {
		lines.push(`* ${warn}`);
	}
	if (netlist.warnings.length > 0) lines.push('');
	
	// Add errors as comments
	for (const err of netlist.errors) {
		lines.push(`* ERROR: ${err}`);
	}
	if (netlist.errors.length > 0) lines.push('');
	
	// Components
	for (const comp of netlist.components) {
		const nodePart = comp.nodes.join(' ');
		let line = `${comp.name} ${nodePart} ${comp.value}`;
		if (comp.extra) {
			line += ` ${comp.extra}`;
		}
		lines.push(line);
	}
	
	if (netlist.components.length > 0) lines.push('');
	
	// Directives
	for (const dir of netlist.directives) {
		lines.push(dir);
	}
	
	return lines.join('\n');
}

/** Generate netlist text directly from schematic */
export function schematicToNetlist(schematic: Schematic, title?: string): string {
	const netlist = generateNetlist(schematic, title);
	return netlistToText(netlist);
}

/** Generate node labels for display on schematic */
export function generateNodeLabels(schematic: Schematic): import('../schematic/types').NodeLabel[] {
	const connectivity = analyzeConnectivity(schematic);
	const labels: import('../schematic/types').NodeLabel[] = [];

	for (const net of connectivity.nets) {
		if (net.points.length === 0) continue;

		// Find a good position for the label - prefer wire endpoints
		// Use the first point as a simple heuristic
		const pos = net.points[0];

		labels.push({
			name: net.name,
			x: pos.x,
			y: pos.y,
			isGround: net.isGround
		});
	}

	return labels;
}
