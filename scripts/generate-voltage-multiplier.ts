/**
 * Programmatic generator for Cockcroft-Walton voltage multiplier schematic
 */

import { writeFileSync } from 'fs';

interface Component {
	id: string;
	type: string;
	x: number;
	y: number;
	rotation: number;
	mirror: boolean;
	attributes: {
		InstName: string;
		Value: string;
	};
	pins: Array<{
		x: number;
		y: number;
		name: string;
		id: string;
	}>;
}

interface Wire {
	id: string;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

interface Junction {
	id: string;
	x: number;
	y: number;
}

// Component pin definitions (relative to component origin)
const DIODE_PINS = [
	{ x: 0, y: -30, name: 'A', id: '0' },
	{ x: 0, y: 30, name: 'K', id: '1' }
];

const CAPACITOR_PINS = [
	{ x: 0, y: -30, name: '1', id: '0' },
	{ x: 0, y: 30, name: '2', id: '1' }
];

const RESISTOR_PINS = [
	{ x: 0, y: -30, name: '1', id: '0' },
	{ x: 0, y: 30, name: '2', id: '1' }
];

const VOLTAGE_PINS = [
	{ x: 0, y: -40, name: '+', id: '0' },
	{ x: 0, y: 40, name: '-', id: '1' }
];

const GROUND_PINS = [
	{ x: 0, y: -10, name: '0', id: '0' }
];

function createComponent(
	id: string,
	type: string,
	x: number,
	y: number,
	rotation: number,
	instName: string,
	value: string,
	pins: any[]
): Component {
	return {
		id,
		type,
		x,
		y,
		rotation,
		mirror: false,
		attributes: { InstName: instName, Value: value },
		pins: JSON.parse(JSON.stringify(pins))
	};
}

function createWire(id: string, x1: number, y1: number, x2: number, y2: number): Wire {
	return { id, x1, y1, x2, y2 };
}

function createJunction(id: string, x: number, y: number): Junction {
	return { id, x, y };
}

function generateVoltageMultiplier() {
	const components: Component[] = [];
	const wires: Wire[] = [];
	const junctions: Junction[] = [];

	// Simplified approach: place all components in a grid layout
	// Then connect them according to the netlist

	// Define node positions in a grid
	const GRID_X = 150;  // Horizontal spacing
	const GRID_Y = 100;  // Vertical spacing
	const START_X = -400;
	const START_Y = -300;

	// Map each node to a grid position (x, y)
	const nodePos: Record<string, {x: number, y: number}> = {
		'0': { x: START_X, y: START_Y + 12 * GRID_Y },  // Ground at bottom
		'in': { x: START_X, y: START_Y },  // Input at top
		'n2': { x: START_X + 2 * GRID_X, y: START_Y + 1 * GRID_Y },
		'n3': { x: START_X + 3 * GRID_X, y: START_Y + 2 * GRID_Y },
		'n4': { x: START_X + 2 * GRID_X, y: START_Y + 3 * GRID_Y },
		'n5': { x: START_X + 3 * GRID_X, y: START_Y + 4 * GRID_Y },
		'n6': { x: START_X + 2 * GRID_X, y: START_Y + 5 * GRID_Y },
		'n7': { x: START_X + 3 * GRID_X, y: START_Y + 6 * GRID_Y },
		'n8': { x: START_X + 2 * GRID_X, y: START_Y + 7 * GRID_Y },
		'n9': { x: START_X + 3 * GRID_X, y: START_Y + 8 * GRID_Y },
		'n10': { x: START_X + 2 * GRID_X, y: START_Y + 9 * GRID_Y },
		'n11': { x: START_X + 3 * GRID_X, y: START_Y + 10 * GRID_Y },
		'n12': { x: START_X + 2 * GRID_X, y: START_Y + 11 * GRID_Y },
		'n13': { x: START_X + 3 * GRID_X, y: START_Y + 12 * GRID_Y }
	};

	let compId = 0;
	let wireId = 0;
	let juncId = 0;

	// Helper to place a vertical component between two nodes
	function placeVerticalComponent(
		type: string,
		instName: string,
		value: string,
		node1: string,
		node2: string,
		pins: any[]
	) {
		const pos1 = nodePos[node1];
		const pos2 = nodePos[node2];
		const midX = (pos1.x + pos2.x) / 2;
		const midY = (pos1.y + pos2.y) / 2;

		components.push(createComponent(`${type}-${compId++}`, type, midX, midY, 0, instName, value, pins));

		// Wires from component pins to nodes
		wires.push(createWire(`w${wireId++}`, midX, midY - 30, pos1.x, pos1.y));
		wires.push(createWire(`w${wireId++}`, midX, midY + 30, pos2.x, pos2.y));

		// Junctions at nodes
		junctions.push(createJunction(`j${juncId++}`, pos1.x, pos1.y));
		junctions.push(createJunction(`j${juncId++}`, pos2.x, pos2.y));
	}

	// Add voltage source
	const vinY = (nodePos['in'].y + nodePos['0'].y) / 2;
	components.push(createComponent('vin', 'voltage', START_X, vinY, 0, 'Vin', 'SIN(0 6 5000)', VOLTAGE_PINS));
	wires.push(createWire(`w${wireId++}`, START_X, vinY - 40, nodePos['in'].x, nodePos['in'].y));
	wires.push(createWire(`w${wireId++}`, START_X, vinY + 40, nodePos['0'].x, nodePos['0'].y));
	junctions.push(createJunction(`j${juncId++}`, nodePos['in'].x, nodePos['in'].y));
	junctions.push(createJunction(`j${juncId++}`, nodePos['0'].x, nodePos['0'].y));

	// Add ground symbol
	components.push(createComponent('gnd', 'ground', nodePos['0'].x, nodePos['0'].y + 40, 0, '', '', GROUND_PINS));
	wires.push(createWire(`w${wireId++}`, nodePos['0'].x, nodePos['0'].y, nodePos['0'].x, nodePos['0'].y + 30));

	// Add all diodes
	placeVerticalComponent('diode', 'D1', 'D1N4148', '0', 'n2', DIODE_PINS);
	placeVerticalComponent('diode', 'D2', 'D1N4148', 'n2', 'n3', DIODE_PINS);
	placeVerticalComponent('diode', 'D3', 'D1N4148', 'n3', 'n4', DIODE_PINS);
	placeVerticalComponent('diode', 'D4', 'D1N4148', 'n4', 'n5', DIODE_PINS);
	placeVerticalComponent('diode', 'D5', 'D1N4148', 'n5', 'n6', DIODE_PINS);
	placeVerticalComponent('diode', 'D6', 'D1N4148', 'n6', 'n7', DIODE_PINS);
	placeVerticalComponent('diode', 'D7', 'D1N4148', 'n8', 'n9', DIODE_PINS);
	placeVerticalComponent('diode', 'D8', 'D1N4148', 'n7', 'n8', DIODE_PINS);
	placeVerticalComponent('diode', 'D9', 'D1N4148', 'n10', 'n11', DIODE_PINS);
	placeVerticalComponent('diode', 'D10', 'D1N4148', 'n9', 'n10', DIODE_PINS);
	placeVerticalComponent('diode', 'D11', 'D1N4148', 'n12', 'n13', DIODE_PINS);
	placeVerticalComponent('diode', 'D12', 'D1N4148', 'n11', 'n12', DIODE_PINS);

	// Add coupling capacitors
	placeVerticalComponent('capacitor', 'C1', '1u', 'in', 'n2', CAPACITOR_PINS);
	placeVerticalComponent('capacitor', 'C2', '1u', 'in', 'n4', CAPACITOR_PINS);
	placeVerticalComponent('capacitor', 'C3', '1u', 'in', 'n6', CAPACITOR_PINS);
	placeVerticalComponent('capacitor', 'C4', '1u', 'in', 'n8', CAPACITOR_PINS);
	placeVerticalComponent('capacitor', 'C5', '1u', 'in', 'n10', CAPACITOR_PINS);
	placeVerticalComponent('capacitor', 'C6', '1u', 'in', 'n12', CAPACITOR_PINS);

	// Add output capacitors
	placeVerticalComponent('capacitor', 'C7', '1u', 'n13', '0', CAPACITOR_PINS);
	placeVerticalComponent('capacitor', 'C8', '1u', 'n11', '0', CAPACITOR_PINS);
	placeVerticalComponent('capacitor', 'C9', '1u', 'n9', '0', CAPACITOR_PINS);
	placeVerticalComponent('capacitor', 'C10', '1u', 'n7', '0', CAPACITOR_PINS);
	placeVerticalComponent('capacitor', 'C11', '1u', 'n3', '0', CAPACITOR_PINS);
	placeVerticalComponent('capacitor', 'C12', '1u', 'n5', '0', CAPACITOR_PINS);

	// Add load resistor
	placeVerticalComponent('resistor', 'Rload', '100k', 'n13', '0', RESISTOR_PINS);

	return { components, wires, junctions };
}

const result = generateVoltageMultiplier();

const schematic = {
	version: 1,
	schematic: result,
	netlist: '',
	savedAt: new Date().toISOString()
};

writeFileSync('static/examples/voltage-multiplier-generated.json', JSON.stringify(schematic, null, 2));
console.log('Generated voltage multiplier schematic');

