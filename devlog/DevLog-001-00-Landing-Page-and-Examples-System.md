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

## Known Issues

1. **RC Low-Pass Filter Schematic Connectivity**
   - Generated netlist does not match expected topology
   - Wire connections need to be corrected
   - Expected: `R1 in out 1k`, `C1 out 0 1u`, `Vin in 0 PULSE(...)`
   - Requires debugging of component pin connections and wire routing

2. **Voltage Multiplier Schematic**
   - Currently shows simplified representation
   - Full 6-stage circuit with 12 diodes and 12 capacitors not fully represented in schematic
   - Netlist is complete and functional

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
- `static/examples/rc-lowpass.json` (new)
- `static/examples/voltage-multiplier.json` (new)

## Testing Notes

- Landing page loads successfully
- Examples fetch from JSON configuration
- Navigation between landing page and workspace functions correctly
- GitHub links open in new tabs
- Responsive layout tested on desktop (mobile testing pending)

## Conclusion

The landing page provides a professional entry point to WebSpice and improves discoverability of example circuits. The reorganized examples system is more maintainable and scalable. Schematic connectivity issues need to be resolved to ensure examples load correctly into the schematic editor.

