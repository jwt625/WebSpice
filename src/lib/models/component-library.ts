/**
 * Built-in component model library
 * 
 * Contains SPICE model definitions for common components.
 * The netlist generator automatically includes models from this library
 * when components reference them.
 */

import type { SpiceModel } from '../schematic/types';

/** Model category for organization */
export type ModelCategory = 'diode' | 'bjt' | 'mosfet' | 'jfet' | 'other';

/** Extended model info with metadata */
export interface LibraryModel extends SpiceModel {
	category: ModelCategory;
	aliases?: string[];  // Alternative names (e.g., "D1N4148" for "1N4148")
}

/**
 * Built-in diode models
 */
export const DIODE_MODELS: Record<string, LibraryModel> = {
	'1N4148': {
		name: '1N4148',
		type: 'D',
		params: 'Is=2.52e-9 Rs=0.568 N=1.752 Cjo=4e-12 M=0.4 tt=20e-9',
		description: 'Small signal switching diode',
		category: 'diode',
		aliases: ['D1N4148', '1N4148']
	},
	'1N4001': {
		name: '1N4001',
		type: 'D',
		params: 'Is=1e-10 Rs=0.1 N=1.8 Cjo=25e-12 M=0.333 tt=5e-6 BV=50 IBV=5e-6',
		description: '1A general purpose rectifier',
		category: 'diode',
		aliases: ['D1N4001']
	},
	'1N4007': {
		name: '1N4007',
		type: 'D',
		params: 'Is=1e-10 Rs=0.1 N=1.8 Cjo=25e-12 M=0.333 tt=5e-6 BV=1000 IBV=5e-6',
		description: '1A 1000V rectifier',
		category: 'diode',
		aliases: ['D1N4007']
	},
	'1N5817': {
		name: '1N5817',
		type: 'D',
		params: 'Is=3.2e-8 Rs=0.042 N=1.05 Cjo=110e-12 M=0.35 tt=10e-9 BV=20 IBV=1e-4',
		description: '1A Schottky barrier diode',
		category: 'diode',
		aliases: ['D1N5817']
	},
	'LED_RED': {
		name: 'LED_RED',
		type: 'D',
		params: 'Is=1e-20 Rs=2 N=1.5 Cjo=10e-12 M=0.33 tt=10e-9 BV=5',
		description: 'Red LED (typical)',
		category: 'diode'
	}
};

/**
 * Built-in BJT models
 */
export const BJT_MODELS: Record<string, LibraryModel> = {
	'2N2222': {
		name: '2N2222',
		type: 'NPN',
		params: 'Is=1e-14 Bf=200 Vaf=100 Ikf=0.3 Ise=0 Ne=1.5 Br=3 Var=0 Ikr=0 Isc=0 Nc=2 Rb=10 Rc=1 Cjc=8e-12 Cje=25e-12 Tf=0.4e-9 Tr=40e-9',
		description: 'General purpose NPN transistor',
		category: 'bjt',
		aliases: ['Q2N2222']
	},
	'2N3904': {
		name: '2N3904',
		type: 'NPN',
		params: 'Is=1e-14 Bf=300 Vaf=100 Ikf=0.4 Ise=0 Ne=1.5 Br=4 Var=0 Ikr=0 Isc=0 Nc=2 Rb=10 Rc=1 Cjc=4e-12 Cje=8e-12 Tf=0.35e-9 Tr=250e-9',
		description: 'General purpose NPN transistor',
		category: 'bjt',
		aliases: ['Q2N3904']
	},
	'2N3906': {
		name: '2N3906',
		type: 'PNP',
		params: 'Is=1e-14 Bf=200 Vaf=100 Ikf=0.4 Ise=0 Ne=1.5 Br=4 Var=0 Ikr=0 Isc=0 Nc=2 Rb=10 Rc=1 Cjc=4.5e-12 Cje=10e-12 Tf=0.5e-9 Tr=350e-9',
		description: 'General purpose PNP transistor',
		category: 'bjt',
		aliases: ['Q2N3906']
	}
};

/**
 * All models combined
 */
export const ALL_MODELS: Record<string, LibraryModel> = {
	...DIODE_MODELS,
	...BJT_MODELS
};

/**
 * Look up a model by name (case-insensitive, checks aliases)
 */
export function findModel(name: string): LibraryModel | undefined {
	const upperName = name.toUpperCase();
	
	// Direct lookup
	for (const [key, model] of Object.entries(ALL_MODELS)) {
		if (key.toUpperCase() === upperName) {
			return model;
		}
		// Check aliases
		if (model.aliases) {
			for (const alias of model.aliases) {
				if (alias.toUpperCase() === upperName) {
					return model;
				}
			}
		}
	}
	
	return undefined;
}

/**
 * Get all models in a category
 */
export function getModelsByCategory(category: ModelCategory): LibraryModel[] {
	return Object.values(ALL_MODELS).filter(m => m.category === category);
}

/**
 * Get model definition string for SPICE netlist
 */
export function getModelDirective(model: LibraryModel): string {
	return `.model ${model.name} ${model.type}(${model.params})`;
}

