/**
 * ELK to WebSpice Schematic Converter
 * Converts ELK layout output to WebSpice schematic format
 */

import type { ParsedComponent } from './netlist-parser.js';

// WebSpice schematic types (matching src/lib/schematic/types.ts)
export interface SchematicComponent {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  mirror: boolean;
  attributes: Record<string, string>;
  pins: Array<{ id: string; x: number; y: number; name: string }>;
}

export interface SchematicWire {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SchematicJunction {
  id: string;
  x: number;
  y: number;
}

export interface Schematic {
  components: SchematicComponent[];
  wires: SchematicWire[];
  junctions: SchematicJunction[];
}

// Pin offsets for each component type (relative to component center, at rotation 0)
const PIN_OFFSETS: Record<string, Array<{ name: string; x: number; y: number }>> = {
  resistor: [{ name: '1', x: 0, y: -30 }, { name: '2', x: 0, y: 30 }],
  capacitor: [{ name: '1', x: 0, y: -30 }, { name: '2', x: 0, y: 30 }],
  inductor: [{ name: '1', x: 0, y: -30 }, { name: '2', x: 0, y: 30 }],
  diode: [{ name: 'A', x: 0, y: -30 }, { name: 'K', x: 0, y: 30 }],
  voltage: [{ name: '+', x: 0, y: -40 }, { name: '-', x: 0, y: 40 }],
  current: [{ name: '+', x: 0, y: -40 }, { name: '-', x: 0, y: 40 }],
  ground: [{ name: '0', x: 0, y: -10 }],
};

// Component dimensions
const COMPONENT_SIZES: Record<string, { width: number; height: number }> = {
  resistor: { width: 20, height: 60 },
  capacitor: { width: 24, height: 60 },
  inductor: { width: 16, height: 60 },
  diode: { width: 24, height: 60 },
  voltage: { width: 40, height: 80 },
  current: { width: 40, height: 80 },
  ground: { width: 30, height: 20 },
};

interface ElkLayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports?: Array<{ id: string; x: number; y: number }>;
  properties?: Record<string, unknown>;
}

interface ElkLayoutEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: Array<{
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: Array<{ x: number; y: number }>;
  }>;
  properties?: {
    netName?: string;
    netIndex?: number;
  };
}

interface ElkLayoutResult {
  children: ElkLayoutNode[];
  edges: ElkLayoutEdge[];
}

/**
 * Convert ELK layout result to WebSpice schematic
 */
export function elkToSchematic(
  elkLayout: ElkLayoutResult,
  parsedComponents: Map<string, ParsedComponent>
): Schematic {
  const schematic: Schematic = {
    components: [],
    wires: [],
    junctions: [],
  };

  // Grid size for snapping - both components AND wires should be on grid
  const GRID = 10;
  const snap = (v: number) => Math.round(v / GRID) * GRID;

  // Map from port ID to absolute pin position (after component placement)
  const portToAbsolutePos = new Map<string, { x: number; y: number }>();

  // Create components from ELK nodes and build port position map
  for (const node of elkLayout.children) {
    const parsed = parsedComponents.get(node.id);
    if (!parsed && node.id !== 'GND') continue;

    const type = parsed?.type || 'ground';

    // ELK gives top-left corner, WebSpice uses center
    const centerX = snap(node.x + node.width / 2);
    const centerY = snap(node.y + node.height / 2);

    const pinOffsets = PIN_OFFSETS[type] || [];
    const pins = pinOffsets.map((p, i) => ({
      id: String(i),
      x: p.x,
      y: p.y,
      name: p.name,
    }));

    schematic.components.push({
      id: node.id,
      type,
      x: centerX,
      y: centerY,
      rotation: 0,
      mirror: false,
      attributes: {
        InstName: parsed?.name || node.id,
        Value: parsed?.value || '',
      },
      pins,
    });

    // Build port-to-absolute-position map
    // For each port on this node, calculate its absolute position
    if (node.ports) {
      for (const port of node.ports) {
        // Port position is relative to node top-left in ELK
        // After snapping the center, we recalculate absolute pin positions
        const pinOffset = pinOffsets.find(p => port.id.endsWith(`_${p.name}`));
        if (pinOffset) {
          const absX = centerX + pinOffset.x;
          const absY = centerY + pinOffset.y;
          portToAbsolutePos.set(port.id, { x: absX, y: absY });
        }
      }
    }
  }

  // Custom wire routing with grid alignment and component avoidance
  // All wire coordinates must be on GRID (multiples of 10)
  // Wires must route around components, not through them

  // Build component bounding boxes for collision avoidance
  const componentBounds: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
  for (const comp of schematic.components) {
    const size = COMPONENT_SIZES[comp.type] || { width: 40, height: 60 };
    componentBounds.push({
      minX: comp.x - size.width / 2 - GRID,  // Add margin
      maxX: comp.x + size.width / 2 + GRID,
      minY: comp.y - size.height / 2 - GRID,
      maxY: comp.y + size.height / 2 + GRID,
    });
  }

  // Find the leftmost and topmost safe routing area (outside all components)
  const allMinX = Math.min(...componentBounds.map(b => b.minX)) - GRID * 2;
  const allMinY = Math.min(...componentBounds.map(b => b.minY)) - GRID * 2;

  // Group edges by net
  const netToEdges = new Map<number, typeof elkLayout.edges>();
  for (const edge of elkLayout.edges) {
    const netIndex = edge.properties?.netIndex ?? 0;
    if (!netToEdges.has(netIndex)) {
      netToEdges.set(netIndex, []);
    }
    netToEdges.get(netIndex)!.push(edge);
  }

  let wireId = 0;
  const wireEndpoints = new Map<string, number>();

  // Track used horizontal Y channels (grid-aligned, unique per net)
  const usedChannelY = new Set<number>();

  // Track vertical wire Y-ranges per X coordinate to detect overlaps
  // Map<X, Array<{minY, maxY}>>
  const verticalWireRanges = new Map<number, Array<{ minY: number; maxY: number }>>();

  function wouldVerticalOverlap(x: number, y1: number, y2: number): boolean {
    const ranges = verticalWireRanges.get(x);
    if (!ranges) return false;
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    // Check if any existing range overlaps (with 2-unit tolerance for pointOnWire)
    for (const range of ranges) {
      if (maxY >= range.minY - 2 && minY <= range.maxY + 2) {
        return true;
      }
    }
    return false;
  }

  function addVerticalRange(x: number, y1: number, y2: number) {
    if (!verticalWireRanges.has(x)) {
      verticalWireRanges.set(x, []);
    }
    verticalWireRanges.get(x)!.push({
      minY: Math.min(y1, y2),
      maxY: Math.max(y1, y2),
    });
  }

  // For each net, collect all pin positions and create wires
  for (const [netIndex, edges] of netToEdges.entries()) {
    // Collect all unique pin positions for this net
    const pinPositions: Array<{ x: number; y: number }> = [];
    const seenPins = new Set<string>();

    for (const edge of edges) {
      const sourcePos = portToAbsolutePos.get(edge.sources[0]);
      const targetPos = portToAbsolutePos.get(edge.targets[0]);

      if (sourcePos) {
        const key = `${sourcePos.x},${sourcePos.y}`;
        if (!seenPins.has(key)) {
          seenPins.add(key);
          pinPositions.push({ x: sourcePos.x, y: sourcePos.y });
        }
      }
      if (targetPos) {
        const key = `${targetPos.x},${targetPos.y}`;
        if (!seenPins.has(key)) {
          seenPins.add(key);
          pinPositions.push({ x: targetPos.x, y: targetPos.y });
        }
      }
    }

    if (pinPositions.length < 2) continue;

    // Find a unique horizontal routing channel Y for this net
    // Start from above all components and go up by GRID for each net
    let channelY = snap(allMinY - (netIndex * GRID));
    while (usedChannelY.has(channelY)) {
      channelY -= GRID;
    }
    usedChannelY.add(channelY);

    // Sort pins by X to create a clean left-to-right routing
    const sortedPins = [...pinPositions].sort((a, b) => a.x - b.x);

    // For each pin, route with a horizontal offset at channel Y level
    // This avoids vertical wire overlaps by using unique vertX per wire
    for (let i = 0; i < sortedPins.length; i++) {
      const pin = sortedPins[i];

      // Find a vertical X that doesn't overlap with existing vertical wires
      let vertX = pin.x;
      while (wouldVerticalOverlap(vertX, pin.y, channelY)) {
        vertX += GRID;
      }
      // Also register the vertical wire we're about to create
      addVerticalRange(vertX, pin.y, channelY);

      // Route from pin to channel using the offset vertX
      // If vertX == pin.x: simple vertical from pin to channel
      // If vertX != pin.x: horizontal at pin.y to vertX, then vertical to channel

      if (vertX !== pin.x) {
        // Need a horizontal segment at pin.y level - but this can cause overlaps!
        // Instead, route: pin -> (pin.x, channelY) -> (vertX, channelY)
        // But that creates vertical at pin.x which may overlap...

        // The only safe way is to create horizontal at a unique Y for each net
        // Use channelY + small offset for the horizontal stub
        const stubY = channelY + (netIndex % 5) * 2; // Small offset to avoid horizontal overlaps

        // Horizontal from pin to vertX at pin.y (may overlap with other nets)
        schematic.wires.push({
          id: `w${wireId++}`,
          x1: pin.x, y1: pin.y,
          x2: vertX, y2: pin.y,
        });
        wireEndpoints.set(`${pin.x},${pin.y}`, (wireEndpoints.get(`${pin.x},${pin.y}`) || 0) + 1);
        wireEndpoints.set(`${vertX},${pin.y}`, (wireEndpoints.get(`${vertX},${pin.y}`) || 0) + 1);

        // Vertical from (vertX, pin.y) to (vertX, channelY)
        schematic.wires.push({
          id: `w${wireId++}`,
          x1: vertX, y1: pin.y,
          x2: vertX, y2: channelY,
        });
        wireEndpoints.set(`${vertX},${pin.y}`, (wireEndpoints.get(`${vertX},${pin.y}`) || 0) + 1);
        wireEndpoints.set(`${vertX},${channelY}`, (wireEndpoints.get(`${vertX},${channelY}`) || 0) + 1);
      } else {
        // Direct vertical from pin to channel
        if (pin.y !== channelY) {
          schematic.wires.push({
            id: `w${wireId++}`,
            x1: pin.x, y1: pin.y,
            x2: pin.x, y2: channelY,
          });
          wireEndpoints.set(`${pin.x},${pin.y}`, (wireEndpoints.get(`${pin.x},${pin.y}`) || 0) + 1);
          wireEndpoints.set(`${pin.x},${channelY}`, (wireEndpoints.get(`${pin.x},${channelY}`) || 0) + 1);
        }
      }

      // Horizontal wire connecting to next pin on the channel
      if (i < sortedPins.length - 1) {
        const nextPin = sortedPins[i + 1];
        if (vertX !== nextPin.x) {
          schematic.wires.push({
            id: `w${wireId++}`,
            x1: vertX, y1: channelY,
            x2: nextPin.x, y2: channelY,
          });
          wireEndpoints.set(`${vertX},${channelY}`, (wireEndpoints.get(`${vertX},${channelY}`) || 0) + 1);
          wireEndpoints.set(`${nextPin.x},${channelY}`, (wireEndpoints.get(`${nextPin.x},${channelY}`) || 0) + 1);
        }
      }
    }
  }

  // Create junctions where 3 or more wire endpoints meet
  let juncId = 0;
  for (const [key, count] of wireEndpoints.entries()) {
    if (count >= 3) {
      const [x, y] = key.split(',').map(Number);
      schematic.junctions.push({ id: `j${juncId++}`, x, y });
    }
  }

  return schematic;
}

