/**
 * LTSpice .asc to WebSpice schematic converter
 * 
 * Usage: pnpm exec tsx scripts/parse-ltspice-asc.ts <input.asc> [output.json]
 */

import { readFileSync, writeFileSync } from 'fs';

// WebSpice schematic types
interface Pin {
  id: string;
  x: number;
  y: number;
  name: string;
}

interface Component {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  mirror: boolean;
  attributes: Record<string, string>;
  pins: Pin[];
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

interface SpiceDirective {
  id: string;
  type: 'tran' | 'ac' | 'dc' | 'op' | 'param' | 'model' | 'other';
  text: string;
  x?: number;
  y?: number;
}

interface SpiceModel {
  name: string;
  type: string;
  params: string;
}

interface Schematic {
  components: Component[];
  wires: Wire[];
  junctions: Junction[];
  directives?: SpiceDirective[];
  parameters?: Record<string, string>;
  models?: SpiceModel[];
}

// LTSpice symbol to WebSpice type mapping
const SYMBOL_TYPE_MAP: Record<string, string> = {
  'cap': 'capacitor',
  'res': 'resistor',
  'ind': 'inductor',
  'voltage': 'voltage',
  'current': 'current',
  'diode': 'diode',
  'npn': 'npn',
  'pnp': 'pnp',
  'nmos': 'nmos',
  'pmos': 'pmos',
};

// LTSpice pin positions relative to SYMBOL position (at R0 rotation)
// These are the offsets from the SYMBOL x,y to where the pins actually are
// Note: LTSpice uses a different coordinate system - these are empirically determined
const LTSPICE_PIN_OFFSETS: Record<string, Array<{ name: string; x: number; y: number }>> = {
  // Capacitor: symbol pos is reference point, pins at (16, 0) and (16, 64) for R0
  cap: [{ name: '1', x: 16, y: 0 }, { name: '2', x: 16, y: 64 }],
  // Resistor: similar to capacitor
  res: [{ name: '1', x: 16, y: 0 }, { name: '2', x: 16, y: 64 }],
  // Inductor
  ind: [{ name: '1', x: 16, y: 0 }, { name: '2', x: 16, y: 64 }],
  // Diode at R0: vertical, anode at top, cathode at bottom
  // At R270: horizontal, anode at (0, -16), cathode at (64, -16) relative to symbol
  // Base R0 offsets: (16, 0) and (16, 64) - when rotated 270° CCW gives (0, -16) and (64, -16)
  diode: [{ name: 'A', x: 16, y: 0 }, { name: 'K', x: 16, y: 64 }],
  // Voltage source at R0: + at (0, 16), - at (0, 96)
  // At R90: + at (-16, 0), - at (-96, 0) relative to symbol
  voltage: [{ name: '+', x: 0, y: 16 }, { name: '-', x: 0, y: 96 }],
  // Current source - similar to voltage
  current: [{ name: '+', x: 0, y: 16 }, { name: '-', x: 0, y: 96 }],
};

// Pin definitions for LTSpice-converted components (matching LTSpice spacing)
// These are relative to component center at rotation 0
// LTSpice uses 64-unit spacing for most 2-pin components, 96-unit for voltage sources
const PIN_DEFS: Record<string, Array<{ name: string; x: number; y: number }>> = {
  resistor: [{ name: '1', x: 0, y: -32 }, { name: '2', x: 0, y: 32 }],  // 64 apart
  capacitor: [{ name: '1', x: 0, y: -32 }, { name: '2', x: 0, y: 32 }],  // 64 apart
  inductor: [{ name: '1', x: 0, y: -32 }, { name: '2', x: 0, y: 32 }],  // 64 apart
  diode: [{ name: 'A', x: 0, y: -32 }, { name: 'K', x: 0, y: 32 }],  // 64 apart
  voltage: [{ name: '+', x: 0, y: -40 }, { name: '-', x: 0, y: 40 }],  // 80 apart (16 to 96 in LTSpice)
  current: [{ name: '+', x: 0, y: -40 }, { name: '-', x: 0, y: 40 }],  // 80 apart
  ground: [{ name: '0', x: 0, y: -10 }],
  npn: [{ name: 'B', x: -32, y: 0 }, { name: 'C', x: 16, y: -32 }, { name: 'E', x: 16, y: 32 }],
  pnp: [{ name: 'B', x: -32, y: 0 }, { name: 'C', x: 16, y: -32 }, { name: 'E', x: 16, y: 32 }],
  nmos: [{ name: 'G', x: -32, y: 0 }, { name: 'D', x: 16, y: -32 }, { name: 'S', x: 16, y: 32 }],
  pmos: [{ name: 'G', x: -32, y: 0 }, { name: 'D', x: 16, y: -32 }, { name: 'S', x: 16, y: 32 }],
};

// LTSpice rotation code to degrees
// R0 = 0, R90 = 90, R180 = 180, R270 = 270
// M0 = 0 mirrored, M90 = 90 mirrored, etc.
function parseRotation(rotStr: string): { rotation: number; mirror: boolean } {
  const mirror = rotStr.startsWith('M');
  const degStr = rotStr.substring(1);
  const rotation = parseInt(degStr, 10) || 0;
  return { rotation: rotation as 0 | 90 | 180 | 270, mirror };
}

// Rotate a point around origin by given degrees (counter-clockwise, LTSpice convention)
function rotatePoint(x: number, y: number, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: Math.round(x * cos - y * sin),
    y: Math.round(x * sin + y * cos),
  };
}

// Calculate LTSpice pin positions in absolute coordinates
function getLTSpicePinPositions(
  symbolType: string,
  symbolX: number,
  symbolY: number,
  rotation: number,
  mirror: boolean
): Array<{ name: string; x: number; y: number }> {
  const pinOffsets = LTSPICE_PIN_OFFSETS[symbolType];
  if (!pinOffsets) return [];

  return pinOffsets.map(pin => {
    // Apply rotation to pin offset
    let { x, y } = rotatePoint(pin.x, pin.y, rotation);

    // Apply mirror if needed (flip x)
    if (mirror) {
      x = -x;
    }

    return {
      name: pin.name,
      x: symbolX + x,
      y: symbolY + y,
    };
  });
}

// Coordinate scaling factor (LTSpice uses larger units)
const SCALE = 1;

interface ParsedSymbol {
  ltspiceType: string;  // Original LTSpice symbol type (cap, res, diode, etc.)
  type: string;         // WebSpice type (capacitor, resistor, diode, etc.)
  x: number;
  y: number;
  rotation: number;
  mirror: boolean;
  attributes: Record<string, string>;
  pinPositions: Array<{ name: string; x: number; y: number }>;  // Absolute pin positions
}

/** Parse a SPICE directive and determine its type */
function parseDirectiveType(text: string): SpiceDirective['type'] {
  const lower = text.toLowerCase();
  if (lower.startsWith('.tran')) return 'tran';
  if (lower.startsWith('.ac')) return 'ac';
  if (lower.startsWith('.dc')) return 'dc';
  if (lower.startsWith('.op')) return 'op';
  if (lower.startsWith('.param')) return 'param';
  if (lower.startsWith('.model')) return 'model';
  return 'other';
}

/** Parse .param directive: .param name=value */
function parseParamDirective(text: string): { name: string; value: string } | null {
  // Match: .param name=value or .param name = value
  const match = text.match(/\.param\s+(\w+)\s*=\s*(.+)/i);
  if (match) {
    return { name: match[1], value: match[2].trim() };
  }
  return null;
}

/** Parse .model directive: .model name type(params) */
function parseModelDirective(text: string): SpiceModel | null {
  // Match: .model name type(params) or .model name type (params)
  const match = text.match(/\.model\s+(\S+)\s+(\w+)\s*\(([^)]+)\)/i);
  if (match) {
    return {
      name: match[1],
      type: match[2].toUpperCase(),
      params: match[3].trim()
    };
  }
  return null;
}

interface ParsedAscResult {
  symbols: ParsedSymbol[];
  wires: Wire[];
  flags: Array<{ x: number; y: number; name: string }>;
  directives: SpiceDirective[];
  parameters: Record<string, string>;
  models: SpiceModel[];
}

function parseAscFile(content: string): ParsedAscResult {
  const lines = content.split('\n');
  const symbols: ParsedSymbol[] = [];
  const wires: Wire[] = [];
  const flags: Array<{ x: number; y: number; name: string }> = [];
  const directives: SpiceDirective[] = [];
  const parameters: Record<string, string> = {};
  const models: SpiceModel[] = [];

  let currentSymbol: ParsedSymbol | null = null;
  let wireId = 0;
  let directiveId = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('WIRE ')) {
      // WIRE x1 y1 x2 y2
      const parts = trimmed.split(/\s+/);
      wires.push({
        id: `w${wireId++}`,
        x1: parseInt(parts[1], 10) * SCALE,
        y1: parseInt(parts[2], 10) * SCALE,
        x2: parseInt(parts[3], 10) * SCALE,
        y2: parseInt(parts[4], 10) * SCALE,
      });
    } else if (trimmed.startsWith('TEXT ')) {
      // TEXT x y alignment size !directive
      // e.g., TEXT -24 360 Left 2 !.tran 0 .5m
      // The ! prefix indicates a SPICE command
      const match = trimmed.match(/^TEXT\s+(-?\d+)\s+(-?\d+)\s+\S+\s+\d+\s+!(.+)$/);
      if (match) {
        const x = parseInt(match[1], 10) * SCALE;
        const y = parseInt(match[2], 10) * SCALE;
        const directiveText = match[3].trim();
        const type = parseDirectiveType(directiveText);

        directives.push({
          id: `dir${directiveId++}`,
          type,
          text: directiveText,
          x,
          y
        });

        // Also extract into structured data
        if (type === 'param') {
          const param = parseParamDirective(directiveText);
          if (param) {
            parameters[param.name] = param.value;
          }
        } else if (type === 'model') {
          const model = parseModelDirective(directiveText);
          if (model) {
            models.push(model);
          }
        }
      }
    } else if (trimmed.startsWith('SYMBOL ')) {
      // SYMBOL type x y rotation
      // e.g., SYMBOL cap 144 160 R0
      const parts = trimmed.split(/\s+/);
      const ltspiceType = parts[1].toLowerCase();
      const x = parseInt(parts[2], 10) * SCALE;
      const y = parseInt(parts[3], 10) * SCALE;
      const { rotation, mirror } = parseRotation(parts[4] || 'R0');

      // Calculate absolute pin positions in LTSpice coordinates
      const pinPositions = getLTSpicePinPositions(ltspiceType, x, y, rotation, mirror);

      currentSymbol = {
        ltspiceType,
        type: SYMBOL_TYPE_MAP[ltspiceType] || ltspiceType,
        x,
        y,
        rotation,
        mirror,
        attributes: {},
        pinPositions,
      };
      symbols.push(currentSymbol);
    } else if (trimmed.startsWith('SYMATTR ') && currentSymbol) {
      // SYMATTR AttrName Value
      const match = trimmed.match(/^SYMATTR\s+(\S+)\s+(.*)$/);
      if (match) {
        currentSymbol.attributes[match[1]] = match[2];
      }
    } else if (trimmed.startsWith('FLAG ')) {
      // FLAG x y name
      const parts = trimmed.split(/\s+/);
      flags.push({
        x: parseInt(parts[1], 10) * SCALE,
        y: parseInt(parts[2], 10) * SCALE,
        name: parts[3] || '0',
      });
    }
  }

  return { symbols, wires, flags, directives, parameters, models };
}

// Calculate WebSpice component position so its pins align with LTSpice pin positions
function calculateWebSpicePosition(
  ltspicePinPositions: Array<{ name: string; x: number; y: number }>,
  webspicePinDefs: Array<{ name: string; x: number; y: number }>,
  rotation: number,
  mirror: boolean
): { x: number; y: number } {
  // If we have pin positions, use the first pin to calculate component center
  if (ltspicePinPositions.length > 0 && webspicePinDefs.length > 0) {
    const ltPin = ltspicePinPositions[0];
    const wsPin = webspicePinDefs[0];

    // Apply rotation to WebSpice pin offset
    let rotatedPin = rotatePoint(wsPin.x, wsPin.y, rotation);
    if (mirror) {
      rotatedPin.x = -rotatedPin.x;
    }

    // Component center = LTSpice pin position - rotated WebSpice pin offset
    return {
      x: ltPin.x - rotatedPin.x,
      y: ltPin.y - rotatedPin.y,
    };
  }

  return { x: 0, y: 0 };
}

function convertToSchematic(parsed: ReturnType<typeof parseAscFile>): Schematic {
  const components: Component[] = [];
  let compId = 0;

  for (const sym of parsed.symbols) {
    const instName = sym.attributes['InstName'] || `${sym.type.charAt(0).toUpperCase()}${compId}`;
    const value = sym.attributes['Value'] || '';

    const pinDefs = PIN_DEFS[sym.type] || [];
    const pins: Pin[] = pinDefs.map((p, i) => ({
      id: String(i),
      x: p.x,
      y: p.y,
      name: p.name,
    }));

    // Calculate WebSpice component position based on LTSpice pin positions
    const pos = calculateWebSpicePosition(sym.pinPositions, pinDefs, sym.rotation, sym.mirror);

    components.push({
      id: instName,
      type: sym.type,
      x: pos.x,
      y: pos.y,
      rotation: sym.rotation as 0 | 90 | 180 | 270,
      mirror: sym.mirror,
      attributes: {
        InstName: instName,
        Value: value,
      },
      pins,
    });
    compId++;
  }

  // Add ground symbol for FLAG 0
  for (const flag of parsed.flags) {
    if (flag.name === '0') {
      components.push({
        id: `GND${compId++}`,
        type: 'ground',
        x: flag.x,
        y: flag.y + 10, // Ground symbol pin is at y-10, so shift down
        rotation: 0,
        mirror: false,
        attributes: { InstName: 'GND', Value: '' },
        pins: [{ id: '0', x: 0, y: -10, name: '0' }],
      });
    }
  }

  // Find junctions (points where 3+ wire endpoints meet)
  const endpointCount = new Map<string, number>();
  for (const wire of parsed.wires) {
    const key1 = `${wire.x1},${wire.y1}`;
    const key2 = `${wire.x2},${wire.y2}`;
    endpointCount.set(key1, (endpointCount.get(key1) || 0) + 1);
    endpointCount.set(key2, (endpointCount.get(key2) || 0) + 1);
  }

  const junctions: Junction[] = [];
  let juncId = 0;
  for (const [key, count] of endpointCount.entries()) {
    if (count >= 3) {
      const [x, y] = key.split(',').map(Number);
      junctions.push({ id: `j${juncId++}`, x, y });
    }
  }

  return {
    components,
    wires: parsed.wires,
    junctions,
    directives: parsed.directives,
    parameters: parsed.parameters,
    models: parsed.models,
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: pnpm exec tsx scripts/parse-ltspice-asc.ts <input.asc> [output.json]');
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1] || inputPath.replace(/\.asc$/, '.json');

  console.log(`Reading LTSpice file: ${inputPath}`);
  const content = readFileSync(inputPath, 'utf-8');

  console.log('Parsing .asc file...');
  const parsed = parseAscFile(content);
  console.log(`  Symbols: ${parsed.symbols.length}`);
  console.log(`  Wires: ${parsed.wires.length}`);
  console.log(`  Flags: ${parsed.flags.length}`);
  console.log(`  Directives: ${parsed.directives.length}`);
  console.log(`  Parameters: ${Object.keys(parsed.parameters).length}`);
  console.log(`  Models: ${parsed.models.length}`);

  console.log('Converting to WebSpice format...');
  const schematic = convertToSchematic(parsed);
  console.log(`  Components: ${schematic.components.length}`);
  console.log(`  Wires: ${schematic.wires.length}`);
  console.log(`  Junctions: ${schematic.junctions.length}`);

  const output = {
    version: 1,
    schematic,
    netlist: '',
    savedAt: new Date().toISOString(),
    source: 'ltspice-asc',
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved to: ${outputPath}`);

  // Print component details
  console.log('\nComponents:');
  for (const comp of schematic.components) {
    console.log(`  ${comp.attributes.InstName}: ${comp.type} at (${comp.x}, ${comp.y}) rot=${comp.rotation} mirror=${comp.mirror}`);
  }

  // Print directives
  if (schematic.directives && schematic.directives.length > 0) {
    console.log('\nDirectives:');
    for (const dir of schematic.directives) {
      console.log(`  [${dir.type}] ${dir.text}`);
    }
  }

  // Print parameters
  if (schematic.parameters && Object.keys(schematic.parameters).length > 0) {
    console.log('\nParameters:');
    for (const [name, value] of Object.entries(schematic.parameters)) {
      console.log(`  ${name} = ${value}`);
    }
  }

  // Print models
  if (schematic.models && schematic.models.length > 0) {
    console.log('\nModels:');
    for (const model of schematic.models) {
      console.log(`  ${model.name} (${model.type}): ${model.params}`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

