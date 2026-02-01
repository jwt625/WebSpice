# DevLog 001-01: SPICE Directives and Component Library

**Date:** 2026-02-01
**Status:** Phases 1-6 Complete (with known issues)
**Related Issues:** N/A
**Depends On:** DevLog-001-00 (LTSpice schematic import)

## Overview

Implement missing features to make imported LTSpice schematics simulate properly. The voltage multiplier example currently fails because:
- Parameter `{CC}` is not defined (needs `.param CC=1u`)
- Diode model `D1N4148` is not defined (needs `.model` directive)
- Simulation command `.tran` is hardcoded instead of loaded from schematic

## Implementation Progress

### Completed (2026-02-01)

#### Phase 1: Schematic Data Model Extension - DONE

Extended `src/lib/schematic/types.ts`:
- Added `DirectiveType` type: `'tran' | 'ac' | 'dc' | 'op' | 'param' | 'model' | 'other'`
- Added `SpiceDirective` interface with id, type, text, and optional x/y position
- Added `SpiceModel` interface with name, type, params, and optional description
- Extended `Schematic` interface with `directives`, `parameters`, and `models` fields

Updated `src/routes/+page.svelte` save/load functions to include new schematic fields.

#### Phase 2: LTSpice Parser Enhancement - DONE

Enhanced `scripts/parse-ltspice-asc.ts`:
- Added parsing of TEXT commands with `!` prefix (SPICE directives in LTSpice)
- Added `parseDirectiveType()` to classify directives
- Added `parseParamDirective()` to extract `.param name=value`
- Added `parseModelDirective()` to extract `.model name type(params)`
- Updated `parseAscFile()` to return directives, parameters, and models
- Updated `convertToSchematic()` to include these in the output

#### Phase 3: Netlist Generator Enhancement - DONE

Enhanced `src/lib/netlist/netlist-generator.ts`:
- Added `expandParameters()` function to replace `{paramName}` with actual values
- Added `fixTranDirective()` to handle LTSpice `.tran` with TSTEP=0 (ngspice requires TSTEP > 0)
- Added `parseSpiceValue()` and `formatSpiceValue()` helper functions
- Updated `generateNetlist()` to:
  - Read parameters from schematic
  - Output `.param` directives at the top
  - Collect model references from components (diodes)
  - Look up models from component library
  - Output `.model` directives
  - Use simulation directive from schematic (with TSTEP fix)
- Updated `componentToSpice()` to expand parameters in component values
- Special handling for diodes: model name goes in `extra` field

#### Phase 6: Component Library - DONE

Created `src/lib/models/component-library.ts`:
- Built-in diode models: 1N4148, 1N4001, 1N4007, 1N5817, LED_RED
- Built-in BJT models: 2N2222, 2N3904, 2N3906
- `findModel(name)`: Case-insensitive lookup with alias support
- `getModelDirective(model)`: Returns the `.model` SPICE directive string
- Integrated with netlist generator to auto-include models when components reference them

#### Directive Canvas Display - DONE

Enhanced `src/lib/schematic/SchematicCanvas.svelte`:
- Added `drawDirectives()` function to render SPICE directives on the canvas
- Directives display with dark purple background and light purple text
- Uses x/y positions from directive objects

### Voltage Multiplier Example - WORKING

The voltage multiplier example now loads and simulates correctly:
- Parser extracts `.tran 0 2 0 1m` and `.param CC=1u` from the LTSpice .asc file
- Netlist generator expands `{CC}` to `1u` in capacitor values
- Netlist generator auto-includes `1N4148` model from component library
- Netlist generator fixes `.tran 0 2 0 1m` to `.tran 2m 2 0 1m` for ngspice compatibility
- Directives are visible on the schematic canvas

### Key Technical Fixes

**LTSpice .tran Compatibility:**
LTSpice allows `.tran 0 Tstop ...` where TSTEP=0 means auto-calculate. NGSpice/eecircuit-engine requires TSTEP > 0. The fix calculates TSTEP as Tstop/1000 when the original is 0.

**Model Library vs Schematic Storage:**
Decided to use a component library approach. Schematics reference model names (e.g., "1N4148"), and the netlist generator looks up definitions from the library. This keeps schematics portable and lightweight.

#### Current Probing for Capacitors and Diodes - DONE

Enhanced `src/lib/netlist/current-calculator.ts`:
- Added `expandParameters()` function to replace `{paramName}` with actual values from schematic parameters
- Added `parseDiodeParams()` to extract Is, N, Rs from SPICE model strings
- Added `calculateDiodeCurrent()` implementing the Shockley diode equation: `I = Is * (exp(V/(N*Vt)) - 1)`
- Diode model parameters are looked up from the component library based on the diode's model name
- Overflow protection implemented for large forward voltages (exponent clamped at 40)

Updated `src/routes/+page.svelte`:
- Removed restrictive component type check that only allowed resistors/capacitors for current calculation
- Now attempts current calculation for all component types including diodes

#### Wire Probing Bug Fix - DONE

**Bug:** Clicking on wire segments would not always return the correct node voltage trace. Wires connected to node 1 through multiple junctions would fail to probe correctly.

**Root Cause:** The `getNodeAtPosition()` function used `pointOnWire()` from connectivity.ts which has a tolerance of 1 unit. However, visual wire selection used `findWireAt()` with a tolerance of 5 units. This mismatch meant clicking near a wire would visually select it (yellow highlight) but `pointOnWire()` would return false, so `findNodeForWire()` was never called.

**Fix in `src/lib/schematic/SchematicCanvas.svelte`:**
- Changed `getNodeAtPosition()` to use `findWireAt(pos)` instead of `schematic.wires.find(w => pointOnWire(pos, w))`
- This ensures the same tolerance is used for both visual selection and node lookup
- Refactored `findNodeForWire()` to use `analyzeConnectivity()` directly instead of reimplementing BFS
- The connectivity analysis uses Union-Find to properly group all connected points including junctions in the middle of wire segments

#### Phase 4: Directive Editor Modal - DONE (with issues)

Created `src/lib/components/DirectiveModal.svelte`:
- Tabbed interface: Parameters, Models, Simulation
- Add/remove parameters with name/value pairs
- Add models from built-in library dropdown
- Edit simulation commands (.tran, .ac, .dc, .op)
- Directives button moved to Schematic panel header via ResizablePanel headerActions snippet

Added `headerActions` snippet prop to `src/lib/components/ResizablePanel.svelte`.

Known issues:
- New directives positioning logic is fragile. New directives should use the same x coordinate as existing directives and be placed below the last one. Current implementation attempts this but may have edge cases.
- Directive dragging/repositioning on canvas is not implemented.

#### Phase 5: Component Property Editor - DONE

Created `src/lib/components/ComponentEditModal.svelte`:
- Opens on double-click of any component on the schematic canvas
- Edit Instance Name and Value fields
- For semiconductors, model dropdown populated from schematic models and component library

Updated `src/lib/schematic/SchematicCanvas.svelte`:
- Added `oneditcomponent` callback prop
- Added `oneditdirectives` callback prop
- Added `findDirectiveAt()` function for hit-testing directive text boxes
- Updated `handleDoubleClick()` to check directives first, then components

Updated `src/lib/components/index.ts` to export DirectiveModal and ComponentEditModal.

Updated `src/routes/+page.svelte`:
- Wired up DirectiveModal with bind to schematic.parameters, schematic.models, schematic.directives
- Wired up ComponentEditModal for double-click component editing
- Added oneditdirectives callback to SchematicCanvas

## Current State Analysis

### Netlist Generator (`src/lib/netlist/netlist-generator.ts`)
- Line 59: Hardcoded `.tran 1u 10m` directive
- No support for `.param` or `.model` directives
- Component values like `{CC}` are passed through without expansion

### Schematic Types (`src/lib/schematic/types.ts`)
- `Schematic` interface has: components, wires, junctions, nodeLabels
- No fields for directives, parameters, or models
- `Component.attributes` stores InstName and Value only

### LTSpice Parser (`scripts/parse-ltspice-asc.ts`)
- Parses SYMBOL, WIRE, FLAG, SYMATTR commands
- Does not parse TEXT commands (which contain directives in LTSpice)

### Reference Netlist (`static/test-circuits/voltage-multiplier.cir`)
```
.param CC=1u
.model D1N4148 D(Is=2.52e-9 Rs=0.568 N=1.752 Cjo=4e-12 M=0.4 tt=20e-9)
.tran 1u 2m
```

### Existing Modal Pattern (`src/lib/components/HelpModal.svelte`)
- Uses `$bindable(false)` for visibility
- Backdrop click and Escape key to close
- Modal content with `e.stopPropagation()` to prevent close on content click

## Requirements

### R1: SPICE Directives in Schematic
- Store `.param`, `.model`, `.tran`, `.ac`, `.dc` directives in schematic JSON
- Display directives on schematic canvas (like LTSpice text labels)
- Parse directives from LTSpice TEXT commands during import

### R2: Netlist Generator Enhancement
- Read directives from schematic instead of hardcoding
- Include `.param` definitions before components
- Include `.model` definitions before simulation commands
- Expand parameter references in component values

### R3: Directive Editor UI
- Button in toolbar to open directive editor modal
- Edit parameters (name=value pairs)
- Edit models (select from library or custom)
- Edit simulation commands

### R4: Component Property Editor
- Double-click on component to edit properties
- Modal with fields: Instance Name, Value, Model (for semiconductors)
- Update component attributes on save

### R5: Component Library
- Built-in library starting with D1N4148
- Interface to browse and add models to schematic
- Store model definitions with schematic

## Implementation Plan

### Phase 1: Schematic Data Model Extension

**File:** `src/lib/schematic/types.ts`

Add new interfaces:
- `SpiceDirective`: id, type (tran/ac/dc/op/other), text, optional x/y position
- `SpiceModel`: name, type (D/NPN/NMOS/etc), params string
- Extend `Schematic` with: directives, parameters (Record<string,string>), models

**File:** `src/routes/+page.svelte`

Update save/load functions to include new schematic fields.

### Phase 2: LTSpice Parser Enhancement

**File:** `scripts/parse-ltspice-asc.ts`

Parse TEXT commands from LTSpice:
```
TEXT -24 360 Left 2 !.tran 0 .5m
TEXT -24 384 Left 2 !.model 1N4148 D(...)
TEXT -24 408 Left 2 !.param CC=1u
```

Extract directives starting with `!` prefix (SPICE command indicator in LTSpice).

### Phase 3: Netlist Generator Enhancement

**File:** `src/lib/netlist/netlist-generator.ts`

Step 1: Accept directives/params/models from schematic
Step 2: Output `.param` lines at top (after title)
Step 3: Expand `{paramName}` in component values using params map
Step 4: Output `.model` lines before simulation commands
Step 5: Output simulation directive from schematic (or default if none)

### Phase 4: Directive Editor Modal

**New File:** `src/lib/components/DirectiveModal.svelte`

Sections:
1. Parameters table (name, value, add/remove buttons)
2. Models table (name, type, params, add/remove/library buttons)
3. Simulation command (dropdown for type, text input for params)

**File:** `src/routes/+page.svelte`

Add "Directives" button to toolbar, wire up modal visibility.

### Phase 5: Component Property Editor

**New File:** `src/lib/components/ComponentEditModal.svelte`

Fields:
- Instance Name (text input)
- Value (text input, with parameter syntax hint)
- Model (dropdown for semiconductors, populated from schematic models)

**File:** `src/lib/schematic/SchematicCanvas.svelte`

Add `ondblclick` handler:
- Find component at click position
- Emit event with component data
- Parent handles modal display

**File:** `src/routes/+page.svelte`

Handle component edit event, show modal, update schematic on save.

### Phase 6: Component Library

**New File:** `src/lib/models/component-library.ts`

Built-in models:
```typescript
export const DIODE_MODELS = {
  'D1N4148': {
    type: 'D',
    params: 'Is=2.52e-9 Rs=0.568 N=1.752 Cjo=4e-12 M=0.4 tt=20e-9',
    description: 'Small signal switching diode'
  }
};
```

**New File:** `src/lib/components/ComponentLibraryModal.svelte`

Browse library, select model, add to schematic.

## File Changes Summary

### New Files
- `src/lib/components/DirectiveModal.svelte`
- `src/lib/components/ComponentEditModal.svelte`
- `src/lib/components/ComponentLibraryModal.svelte`
- `src/lib/models/component-library.ts`

### Modified Files
- `src/lib/schematic/types.ts` - Add directive/model types
- `src/lib/netlist/netlist-generator.ts` - Read from schematic, expand params
- `src/lib/schematic/SchematicCanvas.svelte` - Add dblclick handler
- `src/routes/+page.svelte` - Toolbar buttons, modal wiring
- `src/lib/components/index.ts` - Export new components
- `scripts/parse-ltspice-asc.ts` - Parse TEXT commands

## Testing Strategy

1. Parse LTSpice file with TEXT directives, verify extraction
2. Generate netlist from schematic with directives, verify output matches reference
3. Run voltage multiplier simulation, verify it completes without errors
4. Manual UI testing for modals and double-click editing

## Open Questions

1. **Directive Display**: Position directives on canvas (like LTSpice) or separate panel only?
   - Recommendation: Start with panel only, add canvas display later

2. **Model Storage**: Embed in schematic or reference global library?
   - Recommendation: Embed in schematic for portability, library for convenience

3. **Priority**: Which phase first?
   - Recommendation: Phase 1-3 first (data model + netlist) to enable simulation
   - Then Phase 5 (double-click editing) for UX
   - Phase 4 and 6 (directive modal, library) can follow

## Next Steps

1. [DONE] Implement Phase 1: Extend schematic types
2. [DONE] Implement Phase 2: LTSpice parser enhancement
3. [DONE] Implement Phase 3: Netlist generator enhancement
4. [DONE] Implement Phase 6: Component library
5. [DONE] Test with voltage multiplier example - now loading and simulating correctly
6. [DONE] Implement Phase 4: Directive editor modal
7. [DONE] Implement Phase 5: Component property editor (double-click to edit)

## Known Issues

- Directive positioning when adding new directives via the modal needs refinement. The logic to place new directives below existing ones and use the same x coordinate has edge cases.
- Directives cannot be dragged/repositioned on the canvas. They are drawn but not interactive for movement.
- Double-clicking a directive opens the full DirectiveModal, not a focused editor for just that directive.
