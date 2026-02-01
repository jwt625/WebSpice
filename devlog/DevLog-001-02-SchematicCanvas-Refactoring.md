# DevLog 001-02: SchematicCanvas Refactoring

**Date:** 2026-02-01
**Status:** In Progress
**Related Issues:** N/A
**Depends On:** DevLog-001-01

## Overview

The `SchematicCanvas.svelte` component has grown to 1,538 lines and needs refactoring for maintainability. This devlog tracks the extraction of functionality into separate modules.

## Current State

**File:** `src/lib/schematic/SchematicCanvas.svelte` (1,538 lines)

Contains mixed concerns:
- Canvas rendering (grid, wires, components, directives, probes)
- Hit testing (finding elements at positions)
- Geometry utilities (coordinate transforms, snapping)
- Event handlers (mouse, keyboard)
- Mode-specific logic (wire drawing, delete, duplicate, move, probe)
- State management

## Target Structure

```
src/lib/schematic/
  SchematicCanvas.svelte     (~400-500 lines) - Main component, state, orchestration
  canvas/
    index.ts                 - Re-exports
    geometry.ts              (~80 lines)  - Coordinate transforms, snapping, wire segments
    hit-testing.ts           (~100 lines) - Find elements at positions
    drawing.ts               (~250 lines) - All draw* functions
    probes.ts                (~150 lines) - Probe logic and rendering
  handlers/
    index.ts                 - Re-exports
    wire-handler.ts          (~80 lines)  - Wire drawing mode
    delete-handler.ts        (~50 lines)  - Delete mode
    duplicate-handler.ts     (~60 lines)  - Duplicate mode
    junction-handler.ts      (~50 lines)  - Junction management
  types.ts                   (existing)
  component-renderer.ts      (existing)
  component-defs.ts          (existing)
```

## Implementation Phases

### Phase 1: Extract Geometry Utilities

**File:** `src/lib/schematic/canvas/geometry.ts`

Extract pure functions:
- `screenToSchematic(sx, sy, view, dpr)` - Convert screen to schematic coords
- `schematicToScreen(px, py, view, dpr)` - Convert schematic to screen coords
- `snapToGrid(point, gridSize, snapEnabled)` - Snap point to grid
- `getWireSegments(start, end, direction)` - Calculate Manhattan wire segments
- `getComponentPinPositions(comp)` - Get absolute pin positions for a component

### Phase 2: Extract Hit Testing

**File:** `src/lib/schematic/canvas/hit-testing.ts`

Extract functions:
- `findComponentAt(pos, components)` - Find component at position
- `findWireAt(pos, wires, tolerance)` - Find wire at position
- `hitTestWire(wire, px, py, tolerance)` - Test if point is on wire
- `findDirectiveAtPos(pos, directives, ctx, viewScale)` - Find directive at position
- `findJunctionAt(pos, junctions, tolerance)` - Find junction at position

### Phase 3: Extract Probe Logic

**File:** `src/lib/schematic/canvas/probes.ts`

Extract:
- `ProbeState` interface
- `getNodeAtPosition(pos, schematic, findWireAtFn)` - Get node name at position
- `findNodeForWire(wire, schematic)` - Find node name for a wire
- Probe rendering helpers (drawVoltageProbe, drawCurrentClamp)

### Phase 4: Extract Mode Handlers

**Files:**
- `src/lib/schematic/handlers/wire-handler.ts`
- `src/lib/schematic/handlers/junction-handler.ts`
- `src/lib/schematic/handlers/delete-handler.ts`
- `src/lib/schematic/handlers/duplicate-handler.ts`

### Phase 5: Extract Drawing Functions

**File:** `src/lib/schematic/canvas/drawing.ts`

Extract all draw* functions with a shared `DrawContext` interface.

### Phase 6: Final Cleanup

Simplify main component to orchestration only.

## Design Decisions

### State Passing Strategy

Pure functions receive state as parameters rather than accessing component state directly. This enables:
- Unit testing without Svelte component context
- Clear dependencies
- Potential reuse in other contexts

### DrawContext Interface

```typescript
interface DrawContext {
  ctx: CanvasRenderingContext2D;
  view: ViewTransform;
  scale: number;
  schematic: Schematic;
  selectedIds: Set<string>;
  selectedWireIds: Set<string>;
  selectedDirectiveIds: Set<string>;
}
```

## Progress Tracking

- [x] Phase 1: Geometry utilities (1,538 -> 1,473 lines, -65 lines)
- [x] Phase 2: Hit testing (1,473 -> 1,413 lines, -60 lines)
- [x] Phase 3: Probe logic (1,413 -> 1,322 lines, -91 lines)
- [x] Phase 4: Mode handlers (1,322 -> 1,296 lines, -26 lines)
  - Extracted `isPointOnWireSegment` to geometry.ts
  - Note: Handlers themselves (handleWireClick, handleDeleteClick, etc.) are tightly coupled with Svelte state mutations and are better left in the main component
- [x] Phase 5: Drawing functions (1,296 -> 1,183 lines, -113 lines)
  - Created src/lib/schematic/canvas/drawing.ts (217 lines)
  - Extracted: drawGrid, drawOrigin, drawWires, drawJunctions, drawNodeLabels, drawDirectives
  - Note: drawComponents and drawProbeCursor remain in main component due to tight coupling with placement state and probe state
- [ ] Phase 6: Final cleanup

## Testing Strategy

After each phase:
1. Verify no TypeScript errors
2. Test affected functionality manually:
   - Phase 1: Pan, zoom, component placement snapping
   - Phase 2: Selection of components, wires, directives
   - Phase 3: Voltage and current probing
   - Phase 4: Wire drawing, delete, duplicate modes
   - Phase 5: Visual rendering of all elements
   - Phase 6: Full integration test

