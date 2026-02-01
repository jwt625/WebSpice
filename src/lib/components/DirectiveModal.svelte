<script lang="ts">
	import { untrack } from 'svelte';
	import type { SpiceDirective, SpiceModel } from '$lib/schematic/types';
	import { ALL_MODELS } from '$lib/models/component-library';

	let {
		visible = $bindable(false),
		parameters = $bindable<Record<string, string> | undefined>({}),
		models = $bindable<SpiceModel[] | undefined>([]),
		directives = $bindable<SpiceDirective[] | undefined>([])
	}: {
		visible: boolean;
		parameters: Record<string, string> | undefined;
		models: SpiceModel[] | undefined;
		directives: SpiceDirective[] | undefined;
	} = $props();

	// Local editing state
	let paramEntries = $state<Array<{ name: string; value: string }>>([]);
	let simulationDirective = $state('');
	let activeTab = $state<'params' | 'models' | 'simulation'>('params');

	// Track previous visible state to detect when modal opens
	let wasVisible = false;

	// Sync local state when modal opens
	$effect(() => {
		const isVisible = visible;
		if (isVisible && !wasVisible) {
			// Modal just opened - sync local state from props
			untrack(() => {
				const entries = Object.entries(parameters || {}).map(([name, value]) => ({ name, value }));
				paramEntries = entries.length > 0 ? entries : [{ name: '', value: '' }];
				const simDir = (directives || []).find(d =>
					d.type === 'tran' || d.type === 'ac' || d.type === 'dc' || d.type === 'op'
				);
				simulationDirective = simDir?.text || '.tran 1u 10m';
			});
		}
		wasVisible = isVisible;
	});

	function close() {
		visible = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			close();
		}
	}

	function addParameter() {
		paramEntries = [...paramEntries, { name: '', value: '' }];
	}

	function removeParameter(index: number) {
		paramEntries = paramEntries.filter((_, i) => i !== index);
		if (paramEntries.length === 0) {
			paramEntries = [{ name: '', value: '' }];
		}
	}

	function addModelFromLibrary(modelName: string) {
		const libModel = ALL_MODELS[modelName];
		const modelList = models || [];
		if (libModel && !modelList.find(m => m.name === libModel.name)) {
			models = [...modelList, {
				name: libModel.name,
				type: libModel.type,
				params: libModel.params,
				description: libModel.description
			}];
		}
	}

	function removeModel(index: number) {
		models = (models || []).filter((_, i) => i !== index);
	}

	function save() {
		// Convert param entries back to Record
		const newParams: Record<string, string> = {};
		for (const entry of paramEntries) {
			if (entry.name.trim()) {
				newParams[entry.name.trim()] = entry.value.trim();
			}
		}
		parameters = newParams;

		// Build new directives list
		const newDirectives: SpiceDirective[] = [];
		const existingDirectives = directives || [];

		const lineHeight = 20;

		// Find position for new directives based on existing ones
		// Use the same X as existing directives, and place below the lowest Y
		let xPos = -300;
		let nextY = -200;
		for (const d of existingDirectives) {
			if (d.x !== undefined && d.y !== undefined) {
				xPos = d.x; // Use existing x coordinate
				nextY = Math.max(nextY, d.y + lineHeight);
			}
		}

		// Add .param directives for each parameter
		for (const [name, value] of Object.entries(newParams)) {
			const text = `.param ${name}=${value}`;
			// Try to find existing param directive with same name to preserve position
			const existing = existingDirectives.find(d =>
				d.type === 'param' && d.text.includes(`.param ${name}=`)
			);
			let yPos: number;
			if (existing?.y !== undefined) {
				yPos = existing.y;
			} else {
				yPos = nextY;
				nextY += lineHeight;
			}
			newDirectives.push({
				id: existing?.id || crypto.randomUUID(),
				type: 'param',
				text,
				x: existing?.x ?? xPos,
				y: yPos
			});
		}

		// Add simulation directive
		if (simulationDirective.trim()) {
			const simType = simulationDirective.split(' ')[0]?.slice(1) as 'tran' | 'ac' | 'dc' | 'op';
			const existingSim = existingDirectives.find(d =>
				d.type === 'tran' || d.type === 'ac' || d.type === 'dc' || d.type === 'op'
			);
			let yPos: number;
			if (existingSim?.y !== undefined) {
				yPos = existingSim.y;
			} else {
				yPos = nextY;
				nextY += lineHeight;
			}
			newDirectives.push({
				id: existingSim?.id || crypto.randomUUID(),
				type: simType || 'tran',
				text: simulationDirective.trim(),
				x: existingSim?.x ?? xPos,
				y: yPos
			});
		}

		// Add .model directives for each model
		const modelList = models || [];
		for (const model of modelList) {
			const text = `.model ${model.name} ${model.type}(${model.params})`;
			const existing = existingDirectives.find(d =>
				d.type === 'model' && d.text.includes(`.model ${model.name}`)
			);
			let yPos: number;
			if (existing?.y !== undefined) {
				yPos = existing.y;
			} else {
				yPos = nextY;
				nextY += lineHeight;
			}
			newDirectives.push({
				id: existing?.id || crypto.randomUUID(),
				type: 'model',
				text,
				x: existing?.x ?? xPos,
				y: yPos
			});
		}

		directives = newDirectives;
		close();
	}

	// Available library models for adding
	const libraryModelNames = Object.keys(ALL_MODELS);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if visible}
	<div class="modal-backdrop" onclick={close} onkeydown={handleKeyDown}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>SPICE Directives</h2>
				<button class="close-btn" onclick={close} aria-label="Close">×</button>
			</div>
			<div class="modal-tabs">
				<button class:active={activeTab === 'params'} onclick={() => activeTab = 'params'}>Parameters</button>
				<button class:active={activeTab === 'models'} onclick={() => activeTab = 'models'}>Models</button>
				<button class:active={activeTab === 'simulation'} onclick={() => activeTab = 'simulation'}>Simulation</button>
			</div>
			<div class="modal-body">
				{#if activeTab === 'params'}
					<div class="section">
						<p class="hint">Define parameters that can be referenced as &#123;name&#125; in component values.</p>
						<table class="param-table">
							<thead><tr><th>Name</th><th>Value</th><th></th></tr></thead>
							<tbody>
								{#each paramEntries as entry, i}
									<tr>
										<td><input type="text" bind:value={entry.name} placeholder="e.g., CC" /></td>
										<td><input type="text" bind:value={entry.value} placeholder="e.g., 1u" /></td>
										<td><button class="icon-btn" onclick={() => removeParameter(i)}>×</button></td>
									</tr>
								{/each}
							</tbody>
						</table>
						<button class="add-btn" onclick={addParameter}>+ Add Parameter</button>
					</div>
				{:else if activeTab === 'models'}
					<div class="section">
						<p class="hint">SPICE models for semiconductors. Select from library or define custom.</p>
						<div class="model-list">
							{#each models as model, i}
								<div class="model-item">
									<div class="model-header">
										<span class="model-name">{model.name}</span>
										<span class="model-type">({model.type})</span>
										<button class="icon-btn" onclick={() => removeModel(i)}>×</button>
									</div>
									{#if model.description}
										<div class="model-desc">{model.description}</div>
									{/if}
								</div>
							{/each}
						</div>
						<div class="library-picker">
							<label>Add from library:</label>
							<select onchange={(e) => { addModelFromLibrary((e.target as HTMLSelectElement).value); (e.target as HTMLSelectElement).selectedIndex = 0; }}>
								<option value="">Select model...</option>
								{#each libraryModelNames as name}
									<option value={name}>{name} - {ALL_MODELS[name].description}</option>
								{/each}
							</select>
						</div>
					</div>
				{:else if activeTab === 'simulation'}
					<div class="section">
						<p class="hint">Simulation command (e.g., .tran 1u 10m, .ac dec 10 1 1meg)</p>
						<input type="text" class="sim-input" bind:value={simulationDirective} placeholder=".tran 1u 10m" />
						<div class="sim-examples">
							<strong>Examples:</strong>
							<code>.tran 1u 10m</code> - Transient, 1µs step, 10ms duration<br/>
							<code>.ac dec 10 1 1meg</code> - AC analysis, decade sweep<br/>
							<code>.dc V1 0 5 0.1</code> - DC sweep V1 from 0 to 5V<br/>
							<code>.op</code> - DC operating point
						</div>
					</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="cancel-btn" onclick={close}>Cancel</button>
				<button class="save-btn" onclick={save}>Save</button>
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
		max-width: 600px;
		max-height: 80vh;
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

	.modal-tabs {
		display: flex;
		border-bottom: 1px solid var(--border-primary);
		background: var(--bg-secondary);
	}

	.modal-tabs button {
		flex: 1;
		padding: var(--spacing-sm) var(--spacing-md);
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		font-size: var(--font-size-sm);
		border-bottom: 2px solid transparent;
	}

	.modal-tabs button:hover {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}

	.modal-tabs button.active {
		color: var(--accent-blue);
		border-bottom-color: var(--accent-blue);
	}

	.modal-body {
		padding: var(--spacing-md);
		overflow-y: auto;
		flex: 1;
	}

	.hint {
		margin: 0 0 var(--spacing-md) 0;
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
	}

	.param-table {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: var(--spacing-md);
	}

	.param-table th {
		text-align: left;
		padding: var(--spacing-xs);
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
	}

	.param-table td {
		padding: var(--spacing-xs);
	}

	.param-table input {
		width: 100%;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		color: var(--text-primary);
		font-family: monospace;
	}

	.icon-btn {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 18px;
		padding: 4px 8px;
	}

	.icon-btn:hover {
		color: var(--accent-red, #e06c75);
	}

	.add-btn {
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		color: var(--text-primary);
		padding: var(--spacing-xs) var(--spacing-md);
		cursor: pointer;
		font-size: var(--font-size-sm);
	}

	.add-btn:hover {
		background: var(--accent-blue);
	}

	.model-list {
		margin-bottom: var(--spacing-md);
	}

	.model-item {
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		padding: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.model-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.model-name {
		font-family: monospace;
		font-weight: bold;
		color: var(--accent-green, #98c379);
	}

	.model-type {
		color: var(--text-secondary);
		font-size: var(--font-size-sm);
	}

	.model-header .icon-btn {
		margin-left: auto;
	}

	.model-desc {
		font-size: var(--font-size-xs);
		color: var(--text-secondary);
		margin-top: var(--spacing-xs);
	}

	.library-picker {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.library-picker label {
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
	}

	.library-picker select {
		flex: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		color: var(--text-primary);
	}

	.sim-input {
		width: 100%;
		padding: var(--spacing-sm);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		color: var(--text-primary);
		font-family: monospace;
		font-size: 14px;
		margin-bottom: var(--spacing-md);
	}

	.sim-examples {
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
		line-height: 1.8;
	}

	.sim-examples code {
		background: var(--bg-tertiary);
		padding: 2px 6px;
		font-family: monospace;
		color: var(--accent-blue);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		border-top: 1px solid var(--border-primary);
		background: var(--bg-secondary);
	}

	.cancel-btn {
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		color: var(--text-primary);
		padding: var(--spacing-sm) var(--spacing-lg);
		cursor: pointer;
	}

	.save-btn {
		background: var(--accent-blue);
		border: none;
		color: white;
		padding: var(--spacing-sm) var(--spacing-lg);
		cursor: pointer;
	}

	.save-btn:hover {
		background: var(--accent-green);
	}
</style>
