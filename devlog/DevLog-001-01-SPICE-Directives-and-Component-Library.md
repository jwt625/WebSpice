# DevLog 001-01: SPICE Directives and Component Library

**Date:** 2026-02-01  
**Status:** Planning  
**Related Issues:** N/A  
**Depends On:** DevLog-001-00 (LTSpice schematic import)

## Overview

Implement missing features to make imported LTSpice schematics simulate properly. The voltage multiplier example currently fails because:
- Parameter `{CC}` is not defined (needs `.param CC=1u`)
- Diode model `D1N4148` is not defined (needs `.model` directive)
- Simulation command `.tran` is hardcoded instead of loaded from schematic

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

1. Implement Phase 1: Extend schematic types
2. Implement Phase 3: Netlist generator enhancement
3. Test with voltage multiplier example
4. Proceed to UI phases

