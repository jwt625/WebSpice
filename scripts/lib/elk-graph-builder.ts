/**
 * ELK Graph Builder
 * Converts parsed netlist to ELK graph format with ports for proper routing
 */

import type { ParsedComponent, ParsedNetlist } from './netlist-parser.js';

// ELK types (simplified)
export interface ElkPort {
  id: string;
  x?: number;  // Position relative to node top-left
  y?: number;
  width: number;
  height: number;
  properties?: Record<string, unknown>;
}

export interface ElkNode {
  id: string;
  width: number;
  height: number;
  ports?: ElkPort[];
  properties?: Record<string, unknown>;
  labels?: Array<{ text: string }>;
}

export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  properties?: Record<string, unknown>;  // Store net name for routing offset
}

export interface ElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkNode[];
  edges: ElkEdge[];
}

// Component dimensions (matching WebSpice component-defs.ts)
const COMPONENT_SIZES: Record<string, { width: number; height: number }> = {
  resistor: { width: 20, height: 60 },
  capacitor: { width: 24, height: 60 },
  inductor: { width: 16, height: 60 },
  diode: { width: 24, height: 60 },
  voltage: { width: 40, height: 80 },
  current: { width: 40, height: 80 },
  ground: { width: 30, height: 20 },
  npn: { width: 40, height: 60 },
  pnp: { width: 40, height: 60 },
  nmos: { width: 40, height: 60 },
  pmos: { width: 40, height: 60 },
};

// Pin positions relative to component CENTER (matching component-defs.ts)
// These will be converted to positions relative to node top-left for ELK
const PIN_OFFSETS: Record<string, Array<{ name: string; x: number; y: number }>> = {
  resistor: [{ name: '1', x: 0, y: -30 }, { name: '2', x: 0, y: 30 }],
  capacitor: [{ name: '1', x: 0, y: -30 }, { name: '2', x: 0, y: 30 }],
  inductor: [{ name: '1', x: 0, y: -30 }, { name: '2', x: 0, y: 30 }],
  diode: [{ name: 'A', x: 0, y: -30 }, { name: 'K', x: 0, y: 30 }],
  voltage: [{ name: '+', x: 0, y: -40 }, { name: '-', x: 0, y: 40 }],
  current: [{ name: '+', x: 0, y: -40 }, { name: '-', x: 0, y: 40 }],
  ground: [{ name: '0', x: 0, y: -10 }],
  npn: [{ name: 'B', x: -30, y: 0 }, { name: 'C', x: 10, y: -30 }, { name: 'E', x: 10, y: 30 }],
  pnp: [{ name: 'B', x: -30, y: 0 }, { name: 'C', x: 10, y: -30 }, { name: 'E', x: 10, y: 30 }],
  nmos: [{ name: 'G', x: -30, y: 0 }, { name: 'D', x: 10, y: -30 }, { name: 'S', x: 10, y: 30 }],
  pmos: [{ name: 'G', x: -30, y: 0 }, { name: 'D', x: 10, y: -30 }, { name: 'S', x: 10, y: 30 }],
};

/**
 * Build an ELK graph from a parsed netlist
 */
export function buildElkGraph(netlist: ParsedNetlist): ElkGraph {
  const graph: ElkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '200',  // More spacing between layers
      'elk.spacing.nodeNode': '100',  // More spacing between nodes
      'elk.spacing.edgeEdge': '10',   // Edge-to-edge spacing (must be > TOLERANCE*2 = 2)
      'elk.spacing.edgeNode': '50',   // Edge-to-node spacing
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.portConstraints': 'FIXED_POS',  // Use FIXED_POS so ports stay at exact positions
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      // Each edge gets its own routing slot to avoid sharing channels
      'elk.layered.edgeRouting.selfLoopDistribution': 'EQUALLY',
      'elk.layered.edgeRouting.slotAssignment': 'SEPARATE_SLOTS',
    },
    children: [],
    edges: [],
  };

  // Create nodes for each component
  for (const comp of netlist.components) {
    const node = createElkNode(comp);
    graph.children.push(node);
  }

  // Add a ground node (virtual node for node "0")
  // Ground has pin at (0, -10) relative to center, so at (15, 0) relative to top-left of 30x20 box
  graph.children.push({
    id: 'GND',
    width: 30,
    height: 20,
    ports: [{ id: 'GND_0', x: 15, y: 0, width: 1, height: 1 }],
    labels: [{ text: 'GND' }],
  });

  // Build net-to-pins mapping
  const netToPins = buildNetToPinsMap(netlist.components);

  // Create edges for each net (connecting all pins on the same net)
  // Store net index for routing offset calculation
  let edgeId = 0;
  let netIndex = 0;
  for (const [netName, pins] of netToPins.entries()) {
    // For ground net, add the GND node
    if (netName === '0') {
      pins.push('GND_0');
    }

    // Create edges connecting all pins on this net (star topology from first pin)
    if (pins.length >= 2) {
      const sourcePin = pins[0];
      for (let i = 1; i < pins.length; i++) {
        graph.edges.push({
          id: `e${edgeId++}`,
          sources: [sourcePin],
          targets: [pins[i]],
          properties: {
            netName,
            netIndex,  // Used for routing offset to avoid wire overlaps
          },
        });
      }
    }
    netIndex++;
  }

  return graph;
}

/**
 * Create an ELK node for a component
 */
function createElkNode(comp: ParsedComponent): ElkNode {
  const size = COMPONENT_SIZES[comp.type] || { width: 40, height: 60 };
  const pinOffsets = PIN_OFFSETS[comp.type] || [];

  // Convert pin positions from center-relative to top-left-relative
  // ELK uses top-left corner as origin, WebSpice uses center
  const ports: ElkPort[] = [];
  for (let i = 0; i < comp.nodes.length && i < pinOffsets.length; i++) {
    const pin = pinOffsets[i];
    // Convert from center-relative to top-left-relative
    // Node center is at (width/2, height/2)
    const portX = size.width / 2 + pin.x;
    const portY = size.height / 2 + pin.y;

    ports.push({
      id: `${comp.name}_${pin.name}`,
      x: portX,
      y: portY,
      width: 1,
      height: 1,
    });
  }

  return {
    id: comp.name,
    width: size.width,
    height: size.height,
    ports,
    labels: [{ text: comp.name }],
    properties: {
      componentType: comp.type,
      value: comp.value,
    },
  };
}

/**
 * Build a map from net name to list of port IDs connected to that net
 */
function buildNetToPinsMap(components: ParsedComponent[]): Map<string, string[]> {
  const netToPins = new Map<string, string[]>();

  for (const comp of components) {
    const pinOffsets = PIN_OFFSETS[comp.type] || [];

    for (let i = 0; i < comp.nodes.length && i < pinOffsets.length; i++) {
      const netName = comp.nodes[i];
      const portId = `${comp.name}_${pinOffsets[i].name}`;

      if (!netToPins.has(netName)) {
        netToPins.set(netName, []);
      }
      netToPins.get(netName)!.push(portId);
    }
  }

  return netToPins;
}

