# DevLog 001-00: Landing Page and Examples System

**Date:** 2026-02-01  
**Status:** Completed  
**Related Issues:** N/A

## Overview

Implemented a landing page for WebSpice and reorganized the examples system with proper configuration management and schematic data support.

## Changes Implemented

### 1. Landing Page Component

**File:** `src/lib/components/LandingPage.svelte`

Created a new landing page component with the following features:

- **Hero Section**: Application title and subtitle
- **Action Buttons**: Two primary actions
  - "New Project" - Creates a blank schematic
  - "Open File" - Opens file dialog to load saved schematic JSON
- **Examples Section**: Grid of example circuit cards
  - Dynamically loaded from configuration file
  - Category icons (basic, analog, digital)
  - Click to load example with both schematic and netlist
- **Footer**: GitHub repository link with icon

**Design Consistency:**
- Follows WebSpice's LTSpice-inspired dark theme
- Sharp corners (border-radius: 0) throughout
- Uses existing CSS variables from `theme.css`
- Responsive layout with mobile support

### 2. Examples System Reorganization

**Configuration File:** `static/examples/examples.json`

Centralized example metadata in JSON format:

```json
{
  "examples": [
    {
      "id": "minimal-rc",
      "name": "RC Low-Pass Filter",
      "description": "Simple RC circuit with pulse input",
      "category": "basic",
      "schematicFile": "/examples/rc-lowpass.json",
      "netlistFile": "/test-circuits/minimal-rc.cir",
      "previewImage": null
    },
    ...
  ]
}
```

**Benefits:**
- Separation of configuration from UI code
- Easy to add new examples without modifying Svelte components
- Prepared for future preview images
- Scalable structure

### 3. Schematic Data Files

Created schematic JSON files for examples:

**File:** `static/examples/rc-lowpass.json`
- RC low-pass filter circuit
- Components: R1, C1, Vin (pulse source), ground
- Includes wires, junctions, and netlist text
- **Note:** Schematic wiring currently has connectivity issues - requires debugging

**File:** `static/examples/voltage-multiplier.json`
- Simplified representation of 6-stage Cockcroft-Walton multiplier
- Components: Vin (sine source), D1, C1, Rload, ground
- Full netlist included for complete circuit
- **Note:** Schematic shows simplified structure; full circuit is complex

### 4. Main Application Integration

**File:** `src/routes/+page.svelte`

**Conditional Rendering:**
- Added `showLanding` state variable
- Landing page displays on initial load
- Main workspace hidden until user takes action

**Navigation:**
- "WebSpice" title in toolbar is clickable
- Returns to landing page and clears current work
- Maintains plain text appearance with subtle hover effect

**Example Loading:**
- Modified `handleLoadExample()` to accept full example object
- Loads both schematic JSON and netlist text
- Updates both `schematic` and `netlistInput` state
- Better error handling with descriptive messages

**GitHub Links:**
- Landing page footer: Full link with icon and "View on GitHub" text
- Project statusbar: Icon-only link with tooltip

### 5. Component Exports

**File:** `src/lib/components/index.ts`

Added LandingPage to component exports.

## Technical Details

### Landing Page State Management

```typescript
let examples = $state<Example[]>([]);
let loading = $state(true);
let error = $state<string | null>(null);
```

Uses Svelte 5 runes for reactive state. Examples loaded via `onMount()` lifecycle hook.

### Example Interface

```typescript
interface Example {
  id: string;
  name: string;
  description: string;
  category: 'basic' | 'analog' | 'digital';
  schematicFile: string;
  netlistFile: string;
  previewImage: string | null;
}
```

### Schematic JSON Format

Follows existing format from `schematic-1769924217177.json`:

```json
{
  "version": 1,
  "schematic": {
    "components": [...],
    "wires": [...],
    "junctions": [...]
  },
  "netlist": "...",
  "savedAt": "..."
}
```

## Debugging Approach (2026-02-01 Update)

Created automated testing script `scripts/test-netlist-generation.ts` to verify schematic correctness:

**Features:**
- Loads schematic JSON and generates netlist using codebase functions
- Compares generated netlist with target netlist
- Checks topological equivalence (same circuit topology with different node names)
- Shows detailed connectivity analysis and pin connections
- No emojis (project requirement)

**Usage:**
```bash
pnpm exec tsx scripts/test-netlist-generation.ts [schematic.json] [target.cir]
```

**RC Low-Pass Filter Fix:**
- **Issue Found:** Resistor had `rotation: 90` causing pins to be at wrong positions
- **Fix Applied:** Changed rotation to 0°, simplified wiring from 8 to 6 wires
- **Result:** [PASS] Topologically equivalent to target netlist

## Programmatic Schematic Generation (2026-02-01 Update)

Created `scripts/generate-voltage-multiplier.ts` for programmatic schematic generation:

**Approach:**
1. Define node positions in a grid layout
2. Create helper function to place components between nodes
3. Automatically generate wires and junctions
4. Generate all 26 components (12 diodes, 12 capacitors, 1 resistor, 1 voltage source)

**Benefits:**
- Systematic layout for complex circuits
- Easier to maintain and modify
- Guaranteed correct connectivity
- Scalable to larger circuits

**Voltage Multiplier Generation:**
- 6-stage Cockcroft-Walton voltage multiplier
- 27 components total (including ground symbol)
- 53 wires, 52 junctions
- Grid-based layout with 150px horizontal and 100px vertical spacing
- [PASS] Topologically equivalent to target netlist

## Known Issues

1. **RC Low-Pass Filter Schematic** - RESOLVED
   - Fixed rotation from 90° to 0°
   - Simplified wiring from 8 to 6 wires
   - [PASS] Topologically equivalent to target netlist

2. **Voltage Multiplier Schematic** - IN PROGRESS
   - Generated programmatically with correct 26-component circuit
   - [FAIL] Manhattan routing creates short circuit (all components connected to ground)
   - See Known Issues section for details

## Future Enhancements

1. **Preview Images**
   - Add thumbnail generation for example circuits
   - Display preview images in example cards
   - Auto-generate from schematic canvas

2. **Additional Examples**
   - Add more example circuits across categories
   - Digital circuits (logic gates, flip-flops)
   - Analog circuits (amplifiers, filters, oscillators)

3. **Example Categories**
   - Implement category filtering
   - Add search functionality
   - Sort by complexity or popularity

4. **Configuration Format**
   - Consider YAML format as alternative to JSON
   - Add validation schema

## Files Modified

- `src/lib/components/LandingPage.svelte` (new)
- `src/lib/components/index.ts`
- `src/routes/+page.svelte`
- `static/examples/examples.json` (new)
- `static/examples/rc-lowpass.json` (new, fixed 2026-02-01)
- `static/examples/voltage-multiplier.json` (new, regenerated 2026-02-01)
- `scripts/test-netlist-generation.ts` (new, 2026-02-01)
- `scripts/generate-voltage-multiplier.ts` (new, 2026-02-01)

## Testing Notes

- Landing page loads successfully
- Examples fetch from JSON configuration
- Navigation between landing page and workspace functions correctly
- GitHub links open in new tabs
- Responsive layout tested on desktop (mobile testing pending)

## Known Issues

### Deployment Path Issue - FIXED
- Examples failed to load when deployed to `/WebSpice` subroute
- Fixed: Added `base` path import in `LandingPage.svelte`
- `+page.svelte` already handles paths correctly, no changes needed

### Voltage Multiplier Schematic Issues - IN PROGRESS

**Issue 1: Manhattan Routing**
- Requirement: Wires must be Manhattan-style (horizontal/vertical only), no diagonal routing
- Status: Implementation creates massive short circuit
- Problem: Manhattan routing creates shared wire endpoints that connect unintended nets
- Attempted fixes:
  1. Midpoint component placement - all components at same x-coordinate, wires share endpoints
  2. Adjacent component placement - horizontal wires at same y-coordinate connect everything
  3. Unique y-coordinate routing - still creates shared endpoints, everything connects to ground
- Current result: All 27 components show as connected to node 0 (ground) in generated netlist
- Root cause: Wire endpoints connect when they touch. Manhattan routing from multiple components to shared nodes creates intermediate points that unintentionally connect.

**Issue 2: Overlapping Parallel Components**
- Components in parallel (same two nodes) are perfectly overlapping
- Requirement: Minimum 6 grid points separation
- Status: Not started (blocked by routing issue)
- Example: C7 and Rload both connect n13 to 0

**Issue 3: Missing Component Models**
- `.model D1N4148 ...` directive missing from generated netlist
- Netlist generator does not support component model definitions
- Status: Not started (future feature)
- Requires: Model storage in schematic, model output in netlist generator

## Conclusion

The landing page provides a professional entry point to WebSpice and improves discoverability of example circuits. The reorganized examples system is more maintainable and scalable.

**Update 2026-02-01 (Morning):** RC lowpass filter schematic fixed and verified. Voltage multiplier programmatic generation created but Manhattan routing implementation has critical connectivity issues requiring fundamental redesign.

