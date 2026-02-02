# DevLog 002-00: Educational Example Circuits

**Date:** 2026-02-02

## Overview

This document outlines the plan for creating a comprehensive set of educational example circuits for WebSpice. The goal is to provide 10 examples covering fundamental concepts from basic circuits to oscillators and amplifiers.

## Available Components

### Component Model Requirements

ngspice does NOT have built-in device models. All transistors and diodes require explicit `.model` statements.

**No Model Required (passive components and sources):**
| Component | Type | Notes |
|-----------|------|-------|
| Resistor | resistor | Works directly with value (e.g., 1k) |
| Capacitor | capacitor | Works directly with value (e.g., 1u) |
| Inductor | inductor | Works directly with value (e.g., 1m) |
| Ground | ground | Defines node 0, not a SPICE component |
| Voltage Source | voltage | Works directly with value (e.g., DC 5, SIN(...)) |
| Current Source | current | Works directly with value (e.g., DC 1m) |

**Diodes - Model Required, Library Supported, Auto-Included:**
| Model | Description |
|-------|-------------|
| 1N4148 | Small signal switching diode |
| 1N4001 | 1A general purpose rectifier |
| 1N4007 | 1A 1000V rectifier |
| 1N5817 | 1A Schottky barrier diode |
| LED_RED | Red LED (typical) |

The netlist generator automatically includes `.model` directives for diodes when their Value attribute matches a library model name.

**BJTs - Model Required, Library Supported, Auto-Included:**
| Model | Type | Description |
|-------|------|-------------|
| 2N2222 | NPN | General purpose NPN transistor |
| 2N3904 | NPN | General purpose NPN transistor |
| 2N3906 | PNP | General purpose PNP transistor |

The netlist generator automatically includes `.model` directives for BJTs when their Value attribute matches a library model name (implemented 2026-02-02).

**MOSFETs - Model Required, NO Library Models, Auto-Include NOT IMPLEMENTED:**
| Component | Type | Status |
|-----------|------|--------|
| NMOS | nmos | No models in library |
| PMOS | pmos | No models in library |

MOSFET examples are NOT recommended until models are added to the library and auto-inclusion is implemented.

## Example List

### Existing Examples (3)

1. **RC Low-Pass Filter** - `rc-lowpass.json`
   - Components: R, C, V, GND
   - Demonstrates basic filtering, time constant concepts

2. **Voltage Multiplier** - `voltage-multiplier-ltspice.json`
   - Components: D, C, V, GND
   - 6-stage Cockcroft-Walton multiplier

3. **Coupled LC Resonators** - `coupled-lc-resonators.json`
   - Components: R, L, C, V, GND
   - Circuit QED-like microwave resonators at 5 GHz
   - Parameters: f1 ~ 5.0 GHz, f2 ~ 5.2 GHz, g/2pi ~ 100 MHz, Q ~ 10000

### New Examples to Create (7)

#### Basic Circuits

4. **Voltage Divider**
   - Components: R (x2), V, GND
   - Educational value: Most fundamental circuit, Ohm's law, voltage division
   - Suggested values: R1=1k, R2=1k, Vin=10V DC

5. **RC High-Pass Filter**
   - Components: R, C, V, GND
   - Educational value: Complements low-pass, shows phase shift
   - Suggested values: R=1k, C=1u, f_cutoff = 159 Hz

#### Filter Circuits

6. **RLC Bandpass Filter**
   - Components: R, L, C, V, GND
   - Educational value: Resonance, Q factor, bandwidth
   - Suggested topology: Series RLC
   - Suggested values: R=100, L=10m, C=100n, f0 ~ 5 kHz

7. **Twin-T Notch Filter**
   - Components: R (x3), C (x3), V, GND
   - Educational value: Frequency rejection, 60 Hz hum elimination
   - Suggested values: R=2.65k, C=1u for 60 Hz notch

#### Power Electronics

8. **Half-Wave Rectifier**
   - Components: D, R, C, V, GND
   - Educational value: AC-DC conversion, ripple voltage
   - Suggested values: D=1N4148, R=1k, C=10u, Vin=SIN(0 10 60)

#### Transistor Circuits

9. **Common Emitter Amplifier**
   - Components: NPN, R (x4), C (x2), V, GND
   - Educational value: Transistor biasing, voltage gain, coupling capacitors
   - Topology: Voltage divider bias with emitter degeneration
   - Suggested transistor: 2N2222

10. **Colpitts Oscillator**
    - Components: NPN, R (x2), L, C (x3), V, GND
    - Educational value: Positive feedback, LC resonance, oscillation conditions
    - Suggested transistor: 2N2222

## File Structure

Each example requires:
- Schematic JSON file: `static/examples/<name>.json`
- Preview image: `static/previewImage/<name>.png`
- Entry in: `static/examples/examples.json`

## Implementation Notes

### Schematic JSON Format

```json
{
  "version": 1,
  "schematic": {
    "components": [...],
    "wires": [...],
    "junctions": [...],
    "directives": [
      {
        "id": "...",
        "type": "tran",
        "text": ".tran 1u 10m",
        "x": -200,
        "y": -100
      }
    ],
    "parameters": {},
    "models": []
  },
  "netlist": "...",
  "savedAt": "..."
}
```

### Simulation Directives

Each example should include appropriate simulation directives:
- Transient analysis (.tran) for time-domain behavior
- Consider adding AC analysis (.ac) for frequency response where relevant

### Preview Images

Preview images should be captured at a consistent zoom level showing the complete circuit with component labels visible.

## Progress Tracking

| Example | Schematic | Preview | Added to List |
|---------|-----------|---------|---------------|
| RC Low-Pass Filter | Done | Done | Done |
| Voltage Multiplier | Done | Done | Done |
| Coupled LC Resonators | Done | Done | Done |
| Voltage Divider | Done | TODO | Done |
| RC High-Pass Filter | TODO | TODO | TODO |
| RLC Bandpass Filter | TODO | TODO | TODO |
| Twin-T Notch Filter | TODO | TODO | TODO |
| Half-Wave Rectifier | TODO | TODO | TODO |
| Common Emitter Amplifier | TODO | TODO | TODO |
| Colpitts Oscillator | TODO | TODO | TODO |

## Next Steps

1. Create schematic JSON files for each new example
2. Verify netlist generation and simulation for each circuit
3. Capture preview images
4. Add entries to examples.json
5. Test loading from landing page

