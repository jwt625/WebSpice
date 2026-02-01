<script lang="ts">
	let { visible = $bindable(false) }: { visible: boolean } = $props();

	function close() {
		visible = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			close();
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if visible}
	<div class="modal-backdrop" onclick={close} onkeydown={handleKeyDown}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>WebSpice Keyboard Shortcuts & Controls</h2>
				<button class="close-btn" onclick={close} aria-label="Close help">×</button>
			</div>
			<div class="modal-body">
				<section>
					<h3>Global Shortcuts</h3>
					<table>
						<tbody>
							<tr><td><kbd>Ctrl+N</kbd></td><td>Generate netlist from schematic</td></tr>
							<tr><td><kbd>Ctrl+B</kbd></td><td>Run simulation</td></tr>
							<tr><td><kbd>Ctrl+S</kbd></td><td>Save schematic to file</td></tr>
							<tr><td><kbd>Ctrl+O</kbd></td><td>Open schematic from file</td></tr>
							<tr><td><kbd>H</kbd></td><td>Show this help dialog</td></tr>
						</tbody>
					</table>
				</section>

				<section>
					<h3>Schematic Editor - Component Placement</h3>
					<table>
						<tbody>
							<tr><td><kbd>R</kbd></td><td>Place resistor</td></tr>
							<tr><td><kbd>C</kbd></td><td>Place capacitor</td></tr>
							<tr><td><kbd>L</kbd></td><td>Place inductor</td></tr>
							<tr><td><kbd>V</kbd></td><td>Place voltage source</td></tr>
							<tr><td><kbd>I</kbd></td><td>Place current source</td></tr>
							<tr><td><kbd>G</kbd></td><td>Place ground</td></tr>
							<tr><td><kbd>D</kbd></td><td>Place diode</td></tr>
							<tr><td><kbd>Q</kbd></td><td>Place NPN transistor</td></tr>
							<tr><td><kbd>Shift+Q</kbd></td><td>Place PNP transistor</td></tr>
							<tr><td><kbd>M</kbd></td><td>Place NMOS transistor</td></tr>
							<tr><td><kbd>Shift+M</kbd></td><td>Place PMOS transistor</td></tr>
						</tbody>
					</table>
				</section>

				<section>
					<h3>Schematic Editor - Modes</h3>
					<table>
						<tbody>
							<tr><td><kbd>3</kbd> or <kbd>W</kbd></td><td>Wire mode (draw wires)</td></tr>
							<tr><td><kbd>5</kbd></td><td>Delete mode (click to delete)</td></tr>
							<tr><td><kbd>6</kbd></td><td>Duplicate mode (click to copy)</td></tr>
							<tr><td><kbd>7</kbd></td><td>Move mode (drag to move)</td></tr>
							<tr><td><kbd>P</kbd></td><td>Probe mode (measure voltage/current)</td></tr>
							<tr><td><kbd>Esc</kbd></td><td>Cancel operation / return to select mode</td></tr>
						</tbody>
					</table>
				</section>

				<section>
					<h3>Schematic Editor - Manipulation</h3>
					<table>
						<tbody>
							<tr><td><kbd>Ctrl+R</kbd></td><td>Rotate selected component</td></tr>
							<tr><td><kbd>Ctrl+E</kbd></td><td>Mirror/flip selected component</td></tr>
							<tr><td><kbd>Delete</kbd> / <kbd>Backspace</kbd></td><td>Delete selected items</td></tr>
							<tr><td><kbd>Shift+Click</kbd></td><td>Multi-select components/wires</td></tr>
							<tr><td><kbd>Space</kbd> (in wire mode)</td><td>Toggle wire direction (H-first / V-first)</td></tr>
						</tbody>
					</table>
				</section>

				<section>
					<h3>Schematic Editor - View Controls</h3>
					<table>
						<tbody>
							<tr><td><kbd>Scroll Wheel</kbd></td><td>Zoom in/out (centered on mouse)</td></tr>
							<tr><td><kbd>Click + Drag</kbd></td><td>Pan view</td></tr>
							<tr><td><kbd>Middle Click + Drag</kbd></td><td>Pan view</td></tr>
							<tr><td><kbd>Ctrl+G</kbd> or <kbd>Shift+G</kbd></td><td>Toggle grid visibility</td></tr>
							<tr><td><kbd>F</kbd> or <kbd>Home</kbd></td><td>Reset view to origin</td></tr>
							<tr><td><kbd>+</kbd> / <kbd>=</kbd></td><td>Zoom in</td></tr>
							<tr><td><kbd>-</kbd> / <kbd>_</kbd></td><td>Zoom out</td></tr>
						</tbody>
					</table>
				</section>

				<section>
					<h3>Probe Mode (P key)</h3>
					<table>
						<tbody>
							<tr><td><kbd>Click on wire</kbd></td><td>Voltage probe V(node)</td></tr>
							<tr><td><kbd>Click on component</kbd></td><td>Current probe I(component)</td></tr>
							<tr><td><kbd>Click + Hold + Drag</kbd></td><td>Differential voltage V(+) - V(-)</td></tr>
						</tbody>
					</table>
				</section>

				<section>
					<h3>Waveform Viewer - Zoom & Pan</h3>
					<table>
						<tbody>
							<tr><td><kbd>Left Click + Drag Horizontal</kbd></td><td>Zoom X-axis only</td></tr>
							<tr><td><kbd>Left Click + Drag Vertical</kbd></td><td>Zoom Y-axis only</td></tr>
							<tr><td><kbd>Left Click + Drag Diagonal</kbd></td><td>Box zoom (both axes)</td></tr>
							<tr><td><kbd>Middle Click + Drag</kbd></td><td>Pan view</td></tr>
							<tr><td><kbd>Scroll Wheel</kbd></td><td>Zoom in/out</td></tr>
							<tr><td><kbd>Double Click</kbd></td><td>Autoscale to fit all data</td></tr>
						</tbody>
					</table>
				</section>

				<section>
					<h3>Waveform Viewer - Controls</h3>
					<table>
						<tbody>
							<tr><td><kbd>A</kbd></td><td>Toggle cursor A</td></tr>
							<tr><td><kbd>B</kbd></td><td>Toggle cursor B</td></tr>
							<tr><td><kbd>F</kbd></td><td>Autoscale to fit data</td></tr>
							<tr><td><kbd>G</kbd></td><td>Toggle grid</td></tr>
							<tr><td><kbd>5</kbd></td><td>Delete mode (click legend to remove traces)</td></tr>
							<tr><td><kbd>+</kbd> / <kbd>-</kbd></td><td>Zoom in/out</td></tr>
							<tr><td><kbd>Esc</kbd></td><td>Exit delete mode</td></tr>
						</tbody>
					</table>
				</section>

				<section>
					<h3>Waveform Tabs</h3>
					<table>
						<tbody>
							<tr><td><kbd>Click tab</kbd></td><td>Switch to tab</td></tr>
							<tr><td><kbd>+ button</kbd></td><td>Add new waveform tab</td></tr>
							<tr><td><kbd>× button</kbd></td><td>Close tab (minimum 1 tab)</td></tr>
						</tbody>
					</table>
				</section>
			</div>
			<div class="modal-footer">
				<p>Press <kbd>H</kbd> anytime to show this help, or click the <strong>?</strong> icon in the toolbar.</p>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(2px);
	}

	.modal-content {
		background: var(--bg-primary);
		border: 1px solid var(--border-primary);
		max-width: 900px;
		max-height: 85vh;
		width: 90%;
		display: flex;
		flex-direction: column;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-md);
		border-bottom: 1px solid var(--border-primary);
		background: var(--bg-secondary);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 18px;
		color: var(--text-primary);
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 28px;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.close-btn:hover {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}

	.modal-body {
		padding: var(--spacing-md);
		overflow-y: auto;
		flex: 1;
	}

	.modal-footer {
		padding: var(--spacing-md);
		border-top: 1px solid var(--border-primary);
		background: var(--bg-secondary);
		text-align: center;
	}

	.modal-footer p {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
	}

	section {
		margin-bottom: var(--spacing-lg);
	}

	section:last-child {
		margin-bottom: 0;
	}

	h3 {
		margin: 0 0 var(--spacing-sm) 0;
		font-size: 14px;
		color: var(--accent-blue);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	tr {
		border-bottom: 1px solid var(--border-secondary);
	}

	tr:last-child {
		border-bottom: none;
	}

	td {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
	}

	td:first-child {
		width: 200px;
		font-weight: 500;
	}

	kbd {
		display: inline-block;
		padding: 2px 6px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		font-family: monospace;
		font-size: 11px;
		color: var(--text-primary);
		margin: 0 2px;
		white-space: nowrap;
	}
</style>

