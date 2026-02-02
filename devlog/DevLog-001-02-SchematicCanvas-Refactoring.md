# DevLog 001-02: SchematicCanvas Refactoring

**Date:** 2026-02-01 (Round 1), 2026-02-02 (Round 2)
**Status:** Complete
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
- [x] Phase 6: Final cleanup (1,183 -> 1,179 lines, -4 lines)
  - Removed unused schematicToScreen wrapper and import
  - Fixed unused parameter warning in handleProbeMouseUp

## Final Results

**Total reduction: 1,538 -> 1,179 lines (-359 lines, -23%)**

### Module breakdown:
- `SchematicCanvas.svelte`: 1,179 lines (main component with state and event handlers)
- `canvas/geometry.ts`: 164 lines (coordinate transforms, snapping, wire routing)
- `canvas/hit-testing.ts`: 127 lines (element detection at positions)
- `canvas/probes.ts`: 132 lines (probe drawing and node finding)
- `canvas/drawing.ts`: 217 lines (grid, wires, junctions, labels, directives)
- `canvas/index.ts`: 10 lines (re-exports)

**Total canvas utilities: 650 lines**

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

---

## Round 2: State Machine Refactoring

**Date:** 2026-02-02
**Goal:** Reduce coupling by introducing clear state management architecture

### Problem Analysis

The component remains at 1,179 lines because handlers are tightly coupled to state. Every handler function directly reads AND writes multiple state variables. For example, `handleMouseDown` touches: mode, selectedIds, selectedWireIds, selectedDirectiveIds, isMoving, moveStartSchematicPos, dragStart, and reads from schematic.

Current state inventory (15+ separate $state calls):
- Canvas/View: canvas, ctx, view, grid, container, resizeObserver
- Interaction: isDragging, dragStart, mousePos, schematicPos
- Mode: mode
- Selection: selectedIds, selectedWireIds, selectedDirectiveIds
- Move: isMoving, moveStartSchematicPos
- Placement: placingType, placingRotation, placingMirror
- Wire Drawing: wireDraw
- Probe: probeState
- Counters: componentCounters

### Architecture: State Machine + Command Pattern

Separate concerns into:
1. State - what data exists (EditorState interface)
2. Actions - what can happen (discriminated union)
3. Reducer - how state changes (pure function)
4. Input Mapper - event to action translation

### Target Structure

```
src/lib/schematic/
  SchematicCanvas.svelte     (~300 lines) - Canvas, render, event binding
  editor/
    index.ts                 - Re-exports
    state.ts                 (~80 lines)  - EditorState, SelectionState, ModeState types
    actions.ts               (~60 lines)  - EditorAction union type
    reducer.ts               (~250 lines) - State transition logic
    input-mapper.ts          (~150 lines) - MouseEvent/KeyboardEvent to Action[]
    schematic-mutations.ts   (~100 lines) - Schematic modification helpers
  canvas/                    (existing, ~650 lines)
```

### Implementation Phases

#### Phase 2.1: Define State Types
Create `editor/state.ts` with:
- EditorState interface (consolidated state)
- SelectionState interface
- ModeState discriminated union (idle, placing, drawing-wire, moving, probing, dragging-view)
- Initial state factory function

#### Phase 2.2: Define Actions
Create `editor/actions.ts` with EditorAction union:
- View: PAN, ZOOM, RESET_VIEW
- Mode: SET_MODE, CANCEL
- Selection: SELECT, CLEAR_SELECTION
- Schematic: PLACE_COMPONENT, ADD_WIRE, DELETE_ITEMS, MOVE_ITEMS, ROTATE_SELECTED, MIRROR_SELECTED
- Wire: START_WIRE, COMMIT_WIRE_SEGMENT
- Probe: PROBE_START, PROBE_COMPLETE

#### Phase 2.3: Implement Reducer
Create `editor/reducer.ts`:
- Pure function: (state, action, schematic) => { state, schematicMutations? }
- Handle each action type
- Return new state (immutable updates)

#### Phase 2.4: Implement Input Mapper
Create `editor/input-mapper.ts`:
- mapMouseDown(e, state, pos, hitTest) => Action[]
- mapMouseMove(e, state, pos) => Action[]
- mapMouseUp(e, state, pos) => Action[]
- mapKeyDown(e, state) => Action[]

#### Phase 2.5: Refactor SchematicCanvas
- Replace 15+ $state calls with single EditorState
- Add dispatch(action) function
- Replace event handlers with input mapper calls
- Keep render() and drawing logic

#### Phase 2.6: Extract Schematic Mutations
Create `editor/schematic-mutations.ts`:
- applyMutations(schematic, mutations)
- Mutation types for add/delete/move operations

### Progress Tracking (Round 2)

- [x] Phase 2.1: Define state types (128 lines)
- [x] Phase 2.2: Define actions (112 lines)
- [x] Phase 2.3: Implement reducer (572 lines)
- [x] Phase 2.4: Implement input mapper (319 lines)
- [x] Phase 2.5: Refactor SchematicCanvas
- [x] Phase 2.6: Extract schematic mutations (107 lines)

### Final Results

**Round 1:** 1,538 -> 1,179 lines (359 lines extracted to canvas/ module)
**Round 2:** 1,179 -> 803 lines (376 lines reduction + 1,248 lines in editor/ module)

**Final Architecture:**
```
src/lib/schematic/
  SchematicCanvas.svelte        803 lines  (main component)
  canvas/                       650 lines  (drawing, geometry, hit-testing, probes)
  editor/                     1,248 lines  (state machine architecture)
    state.ts                    128 lines  (EditorState, ModeState types)
    actions.ts                  112 lines  (EditorAction discriminated union)
    reducer.ts                  572 lines  (pure state transition logic)
    input-mapper.ts             319 lines  (event to action translation)
    schematic-mutations.ts      107 lines  (schematic modification helpers)
    index.ts                     10 lines  (re-exports)
```

**Total codebase:** 2,701 lines (803 + 650 + 1,248) vs original 1,538 lines

**Benefits achieved:**
1. Clear separation of concerns (state vs actions vs reducers vs mutations)
2. Testable pure functions (reducer, input-mapper)
3. Single source of truth for editor state
4. Discriminated unions provide type safety for mode handling
5. Event handlers are now thin wrappers that dispatch actions
6. SchematicCanvas is now focused on rendering and event binding

### Bugs Fixed During Refactoring

1. **Wire preview from origin**: Fixed dashed preview line showing from (0,0) before first point placed in wire mode. Added check for `startPoint !== (0,0)` before rendering preview.

2. **Delete/Duplicate modes not working**: ModeState discriminated union was missing 'delete' and 'duplicate' types. Added them to state.ts, getEditorMode(), and getModeStateForMode().

3. **Duplicate not functioning**: handleDuplicateAt() was a stub. Implemented full duplication with deep copy, proper instance name incrementing, and pins from component definition.

4. **Corrupted pin coordinates after move**: MOVE_COMPONENTS mutation was incorrectly updating pin positions. Pins are relative coordinates and should not change when component moves. Removed pin position updates from move logic.

### Completion

Round 2 refactoring complete. All modes functional: select, wire, delete, duplicate, move, probe. Component placement, rotation, mirroring working. No TypeScript errors.
