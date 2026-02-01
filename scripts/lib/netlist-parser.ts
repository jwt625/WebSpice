/**
 * SPICE Netlist Parser
 * Parses a SPICE netlist into structured component and net data
 */

export interface ParsedComponent {
  name: string;           // e.g., "R1", "C1", "D1"
  type: string;           // e.g., "resistor", "capacitor", "diode"
  prefix: string;         // e.g., "R", "C", "D"
  nodes: string[];        // Node names in order
  value: string;          // Component value or model name
  model?: string;         // Model name for semiconductors
}

export interface ParsedNetlist {
  title: string;
  components: ParsedComponent[];
  models: Map<string, string>;  // Model name -> model definition
  params: Map<string, string>;  // Parameter name -> value
  directives: string[];         // .tran, .ac, etc.
}

// Map SPICE prefix to component type
const PREFIX_TO_TYPE: Record<string, string> = {
  'R': 'resistor',
  'C': 'capacitor',
  'L': 'inductor',
  'V': 'voltage',
  'I': 'current',
  'D': 'diode',
  'Q': 'npn',  // Default to NPN, could be PNP based on model
  'M': 'nmos', // Default to NMOS, could be PMOS based on model
};

// Number of nodes for each component type
const NODE_COUNT: Record<string, number> = {
  'R': 2,
  'C': 2,
  'L': 2,
  'V': 2,
  'I': 2,
  'D': 2,
  'Q': 3,  // BJT: C B E (or C B E S for 4-terminal)
  'M': 4,  // MOSFET: D G S B
};

/**
 * Parse a SPICE netlist string into structured data
 */
export function parseNetlist(netlistText: string): ParsedNetlist {
  const lines = netlistText.split('\n');
  const result: ParsedNetlist = {
    title: '',
    components: [],
    models: new Map(),
    params: new Map(),
    directives: [],
  };

  let isFirstLine = true;
  let continuationLine = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // First non-comment line is the title
    if (isFirstLine && !line.startsWith('*') && !line.startsWith('.')) {
      result.title = line;
      isFirstLine = false;
      continue;
    }
    isFirstLine = false;

    // Handle comments (title comments)
    if (line.startsWith('*')) {
      if (!result.title && line.length > 1) {
        result.title = line.substring(1).trim();
      }
      continue;
    }

    // Handle line continuation (+ at start of line)
    if (line.startsWith('+')) {
      continuationLine += ' ' + line.substring(1).trim();
      continue;
    } else if (continuationLine) {
      line = continuationLine;
      continuationLine = '';
    }

    // Handle directives
    if (line.startsWith('.')) {
      const upperLine = line.toUpperCase();
      
      if (upperLine.startsWith('.MODEL')) {
        // Parse model definition
        const match = line.match(/\.model\s+(\S+)\s+(\S+)\s*\(?(.*)\)?/i);
        if (match) {
          result.models.set(match[1], line);
        }
      } else if (upperLine.startsWith('.PARAM')) {
        // Parse parameter
        const match = line.match(/\.param\s+(\S+)\s*=\s*(\S+)/i);
        if (match) {
          result.params.set(match[1], match[2]);
        }
      } else if (upperLine.startsWith('.END')) {
        break;
      } else {
        result.directives.push(line);
      }
      continue;
    }

    // Parse component line
    const component = parseComponentLine(line);
    if (component) {
      result.components.push(component);
    }
  }

  return result;
}

/**
 * Parse a single component line
 */
function parseComponentLine(line: string): ParsedComponent | null {
  const parts = line.split(/\s+/);
  if (parts.length < 3) return null;

  const name = parts[0];
  const prefix = name[0].toUpperCase();
  const type = PREFIX_TO_TYPE[prefix];

  if (!type) return null;

  const nodeCount = NODE_COUNT[prefix] || 2;
  const nodes = parts.slice(1, 1 + nodeCount);
  const valueAndRest = parts.slice(1 + nodeCount).join(' ');

  // For diodes and transistors, the value is the model name
  let value = valueAndRest;
  let model: string | undefined;

  if (prefix === 'D' || prefix === 'Q' || prefix === 'M') {
    model = parts[1 + nodeCount];
    value = model || '';
  }

  return {
    name,
    type,
    prefix,
    nodes,
    value,
    model,
  };
}

