/**
 * Test script to generate netlist from schematic and compare with target
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Import the netlist generation functions
import { generateNetlist, netlistToText } from '../src/lib/netlist/netlist-generator.js';
import { analyzeConnectivity, getComponentPinPositions } from '../src/lib/netlist/connectivity.js';
import type { Schematic } from '../src/lib/schematic/types.js';

function loadSchematic(path: string): Schematic {
	const content = readFileSync(path, 'utf-8');
	const data = JSON.parse(content);
	return data.schematic;
}

function loadNetlist(path: string): string {
	return readFileSync(path, 'utf-8').trim();
}

interface ComponentInfo {
	name: string;
	nodes: string[];
	value: string;
	fullLine: string;
}

function parseNetlist(netlistText: string): Map<string, ComponentInfo> {
	const lines = netlistText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('*') && !l.startsWith('.'));
	const components = new Map<string, ComponentInfo>();

	for (const line of lines) {
		const parts = line.split(/\s+/);
		if (parts.length >= 3) {
			const name = parts[0];
			const prefix = name[0].toUpperCase();

			// Determine number of nodes based on component type
			let nodeCount = 2; // Default for R, C, L
			if (prefix === 'V' || prefix === 'I') nodeCount = 2;
			if (prefix === 'D') nodeCount = 2;
			if (prefix === 'Q') nodeCount = 3;
			if (prefix === 'M') nodeCount = 4;

			const nodes = parts.slice(1, 1 + nodeCount);
			const value = parts.slice(1 + nodeCount).join(' ');

			components.set(name, {
				name,
				nodes,
				value,
				fullLine: line
			});
		}
	}

	return components;
}

function buildNodeMapping(gen: Map<string, ComponentInfo>, target: Map<string, ComponentInfo>): Map<string, string> | null {
	// Build a mapping from generated node names to target node names
	// by matching component connections

	const mapping = new Map<string, string>();
	mapping.set('0', '0'); // Ground is always 0

	// Try to build mapping by matching components
	for (const [name, targetComp] of target) {
		const genComp = gen.get(name);
		if (!genComp) continue;

		// Match nodes
		for (let i = 0; i < targetComp.nodes.length; i++) {
			const genNode = genComp.nodes[i];
			const targetNode = targetComp.nodes[i];

			if (mapping.has(genNode)) {
				if (mapping.get(genNode) !== targetNode) {
					// Conflict - mapping is inconsistent
					return null;
				}
			} else {
				mapping.set(genNode, targetNode);
			}
		}
	}

	return mapping;
}

function checkTopologicalEquivalence(gen: Map<string, ComponentInfo>, target: Map<string, ComponentInfo>): boolean {
	// Check if the two netlists are topologically equivalent
	// (same components connected to same nodes, possibly with different node names)

	if (gen.size !== target.size) {
		console.log(`\n[ERROR] Different number of components: ${gen.size} vs ${target.size}`);
		return false;
	}

	const mapping = buildNodeMapping(gen, target);
	if (!mapping) {
		console.log('\n[ERROR] Could not build consistent node mapping');
		return false;
	}

	console.log('\nNode Mapping:');
	for (const [genNode, targetNode] of mapping) {
		console.log(`   ${genNode} -> ${targetNode}`);
	}

	// Verify all components match with the mapping
	let allMatch = true;
	for (const [name, targetComp] of target) {
		const genComp = gen.get(name);
		if (!genComp) {
			console.log(`\n[ERROR] Missing component: ${name}`);
			allMatch = false;
			continue;
		}

		// Check if nodes match via mapping
		const mappedNodes = genComp.nodes.map(n => mapping.get(n) || '?');
		const nodesMatch = mappedNodes.every((n, i) => n === targetComp.nodes[i]);

		if (!nodesMatch) {
			console.log(`\n[ERROR] ${name}: Node mismatch`);
			console.log(`   Generated: ${genComp.nodes.join(' ')} -> ${mappedNodes.join(' ')}`);
			console.log(`   Target:    ${targetComp.nodes.join(' ')}`);
			allMatch = false;
		}

		// Check value
		if (genComp.value !== targetComp.value) {
			console.log(`\n[WARN] ${name}: Value mismatch`);
			console.log(`   Generated: ${genComp.value}`);
			console.log(`   Target:    ${targetComp.value}`);
		}
	}

	return allMatch;
}

function compareNetlists(generated: string, target: string): void {
	console.log('\n=== GENERATED NETLIST ===');
	console.log(generated);
	console.log('\n=== TARGET NETLIST ===');
	console.log(target);

	const genComponents = parseNetlist(generated);
	const targetComponents = parseNetlist(target);

	console.log('\n=== COMPONENT-BY-COMPONENT COMPARISON ===');

	// Check each target component
	for (const [name, targetComp] of targetComponents) {
		const genComp = genComponents.get(name);
		if (!genComp) {
			console.log(`[MISSING] ${name}`);
			console.log(`   Target:    ${targetComp.fullLine}`);
		} else if (genComp.fullLine !== targetComp.fullLine) {
			console.log(`[DIFFERENT] ${name}`);
			console.log(`   Generated: ${genComp.fullLine}`);
			console.log(`   Target:    ${targetComp.fullLine}`);
		} else {
			console.log(`[MATCH] ${name}`);
		}
	}

	// Check for extra components in generated
	for (const [name, genComp] of genComponents) {
		if (!targetComponents.has(name)) {
			console.log(`[EXTRA] ${name}`);
			console.log(`   Generated: ${genComp.fullLine}`);
		}
	}

	console.log('\n=== TOPOLOGICAL EQUIVALENCE CHECK ===');
	const isEquivalent = checkTopologicalEquivalence(genComponents, targetComponents);

	if (isEquivalent) {
		console.log('\n[PASS] NETLISTS ARE TOPOLOGICALLY EQUIVALENT');
	} else {
		console.log('\n[FAIL] NETLISTS ARE NOT TOPOLOGICALLY EQUIVALENT');
	}
}

function main() {
	const schematicPath = process.argv[2] || 'static/examples/rc-lowpass.json';
	const netlistPath = process.argv[3] || 'static/test-circuits/minimal-rc.cir';

	console.log(`Loading schematic: ${schematicPath}`);
	console.log(`Loading target netlist: ${netlistPath}`);

	const schematic = loadSchematic(schematicPath);
	const targetNetlist = loadNetlist(netlistPath);

	console.log(`\nSchematic has:`);
	console.log(`  - ${schematic.components.length} components`);
	console.log(`  - ${schematic.wires.length} wires`);
	console.log(`  - ${schematic.junctions.length} junctions`);

	// Show component details with absolute pin positions
	console.log('\nComponents with absolute pin positions:');
	for (const comp of schematic.components) {
		const instName = comp.attributes['InstName'] || comp.id;
		console.log(`  ${instName} (${comp.type}) at (${comp.x}, ${comp.y}) rot=${comp.rotation}`);
		const pins = getComponentPinPositions(comp);
		for (const { pin, pos } of pins) {
			console.log(`    Pin ${pin}: (${pos.x}, ${pos.y})`);
		}
	}

	// Show connectivity analysis
	console.log('\nConnectivity Analysis:');
	const connectivity = analyzeConnectivity(schematic);
	console.log(`  Nets: ${connectivity.nets.length}`);
	for (const net of connectivity.nets) {
		console.log(`  Net ${net.name} (${net.isGround ? 'ground' : 'signal'}):`);
		console.log(`    Points: ${net.points.map(p => `(${p.x},${p.y})`).join(', ')}`);
	}

	console.log('\nPin Connections:');
	for (const pc of connectivity.pinConnections) {
		const net = connectivity.nets.find(n => n.id === pc.netId);
		console.log(`  ${pc.componentName}.${pc.pinName} at (${pc.position.x},${pc.position.y}) → Net ${net?.name || '?'}`);
	}

	// Generate netlist
	const result = generateNetlist(schematic, 'Test Circuit');
	const generatedNetlist = netlistToText(result);

	console.log(`\nGeneration result:`);
	console.log(`  - ${result.components.length} components`);
	console.log(`  - ${result.errors.length} errors`);
	console.log(`  - ${result.warnings.length} warnings`);

	if (result.errors.length > 0) {
		console.log('\nErrors:');
		result.errors.forEach(e => console.log(`  - ${e}`));
	}

	if (result.warnings.length > 0) {
		console.log('\nWarnings:');
		result.warnings.forEach(w => console.log(`  - ${w}`));
	}

	compareNetlists(generatedNetlist, targetNetlist);
}

main();

