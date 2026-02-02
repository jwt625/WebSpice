/**
 * Schematic mutations - apply changes to schematic data
 */

import type { Schematic, Component, Wire, Junction, Point } from '../types';
import type { SchematicMutation } from './reducer';
import { nextRotation } from '../component-renderer';

/**
 * Apply a list of mutations to a schematic
 * Mutates the schematic in place for Svelte reactivity
 */
export function applyMutations(schematic: Schematic, mutations: SchematicMutation[]): void {
	for (const mutation of mutations) {
		applyMutation(schematic, mutation);
	}
}

/**
 * Apply a single mutation to a schematic
 */
function applyMutation(schematic: Schematic, mutation: SchematicMutation): void {
	switch (mutation.type) {
		case 'ADD_COMPONENT':
			schematic.components = [...schematic.components, mutation.component];
			break;

		case 'ADD_WIRE':
			schematic.wires = [...schematic.wires, mutation.wire];
			break;

		case 'ADD_JUNCTION':
			schematic.junctions = [...schematic.junctions, mutation.junction];
			break;

		case 'DELETE_COMPONENTS':
			schematic.components = schematic.components.filter(c => !mutation.ids.includes(c.id));
			break;

		case 'DELETE_WIRES':
			schematic.wires = schematic.wires.filter(w => !mutation.ids.includes(w.id));
			break;

		case 'DELETE_JUNCTIONS':
			schematic.junctions = schematic.junctions.filter(j => !mutation.ids.includes(j.id));
			break;

		case 'DELETE_DIRECTIVES':
			if (schematic.directives) {
				schematic.directives = schematic.directives.filter(d => !mutation.ids.includes(d.id));
			}
			break;

		case 'MOVE_COMPONENTS':
			for (const comp of schematic.components) {
				if (mutation.ids.includes(comp.id)) {
					comp.x += mutation.delta.x;
					comp.y += mutation.delta.y;
					// Pin positions are relative to component, so they don't change
				}
			}
			break;

		case 'MOVE_WIRES':
			for (const wire of schematic.wires) {
				if (mutation.ids.includes(wire.id)) {
					wire.x1 += mutation.delta.x;
					wire.y1 += mutation.delta.y;
					wire.x2 += mutation.delta.x;
					wire.y2 += mutation.delta.y;
				}
			}
			break;

		case 'MOVE_DIRECTIVES':
			if (schematic.directives) {
				for (const directive of schematic.directives) {
					if (mutation.ids.includes(directive.id)) {
						if (directive.x !== undefined) directive.x += mutation.delta.x;
						if (directive.y !== undefined) directive.y += mutation.delta.y;
					}
				}
			}
			break;

		case 'ROTATE_COMPONENTS':
			for (const comp of schematic.components) {
				if (mutation.ids.includes(comp.id)) {
					comp.rotation = nextRotation(comp.rotation);
				}
			}
			break;

		case 'MIRROR_COMPONENTS':
			for (const comp of schematic.components) {
				if (mutation.ids.includes(comp.id)) {
					comp.mirror = !comp.mirror;
				}
			}
			break;
	}
}

