/**
 * Generate WebSpice schematic from SPICE netlist using ELK layout
 * 
 * Usage: pnpm exec tsx scripts/generate-schematic-from-netlist.ts <netlist.cir> [output.json]
 */

import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';
import ELK from 'elkjs';
import { parseNetlist } from './lib/netlist-parser.js';
import { buildElkGraph } from './lib/elk-graph-builder.js';
import { elkToSchematic } from './lib/elk-to-schematic.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: pnpm exec tsx scripts/generate-schematic-from-netlist.ts <netlist.cir> [output.json]');
    process.exit(1);
  }

  const netlistPath = args[0];
  const outputPath = args[1] || netlistPath.replace(/\.cir$/, '-elk.json');

  console.log(`Reading netlist: ${netlistPath}`);
  const netlistText = readFileSync(netlistPath, 'utf-8');

  // Step 1: Parse the netlist
  console.log('Parsing netlist...');
  const parsed = parseNetlist(netlistText);
  console.log(`  Title: ${parsed.title}`);
  console.log(`  Components: ${parsed.components.length}`);
  console.log(`  Models: ${parsed.models.size}`);
  console.log(`  Params: ${parsed.params.size}`);

  // Step 2: Build ELK graph
  console.log('Building ELK graph...');
  const elkGraph = buildElkGraph(parsed);
  console.log(`  Nodes: ${elkGraph.children.length}`);
  console.log(`  Edges: ${elkGraph.edges.length}`);

  // Step 3: Run ELK layout
  console.log('Running ELK layout...');
  const elk = new ELK();
  const layoutResult = await elk.layout(elkGraph);

  console.log('Layout complete.');
  
  // Debug: print node positions
  if (layoutResult.children) {
    console.log('\nNode positions:');
    for (const node of layoutResult.children) {
      console.log(`  ${node.id}: (${node.x}, ${node.y})`);
    }
  }

  // Step 4: Convert to WebSpice schematic
  console.log('\nConverting to WebSpice schematic...');
  
  // Build component lookup map
  const componentMap = new Map(parsed.components.map(c => [c.name, c]));
  
  const schematic = elkToSchematic(
    layoutResult as any,
    componentMap
  );

  console.log(`  Components: ${schematic.components.length}`);
  console.log(`  Wires: ${schematic.wires.length}`);
  console.log(`  Junctions: ${schematic.junctions.length}`);

  // Step 5: Save output
  const output = {
    version: 1,
    schematic,
    netlist: netlistText,
    savedAt: new Date().toISOString(),
    generator: 'elkjs',
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved schematic to: ${outputPath}`);

  // Also print some stats about the layout
  if (layoutResult.children) {
    const xs = layoutResult.children.map(n => n.x || 0);
    const ys = layoutResult.children.map(n => n.y || 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    console.log(`\nLayout bounds: (${minX}, ${minY}) to (${maxX}, ${maxY})`);
    console.log(`Layout size: ${maxX - minX} x ${maxY - minY}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

