<script lang="ts">
	import type { Component, SpiceModel } from '$lib/schematic/types';
	import { ALL_MODELS } from '$lib/models/component-library';
	import SourceEditModal from './SourceEditModal.svelte';

	let {
		visible = $bindable(false),
		component = $bindable<Component | null>(null),
		models = [],
		onsave
	}: {
		visible: boolean;
		component: Component | null;
		models?: SpiceModel[];
		onsave?: (component: Component) => void;
	} = $props();

	// Check if this is a source component that should use the specialized modal
	function isSourceComponent(comp: Component | null): boolean {
		return comp?.type === 'voltage' || comp?.type === 'current';
	}

	// Local editing state
	let instName = $state('');
	let value = $state('');

	// Sync local state when modal opens or component changes
	$effect(() => {
		if (visible && component) {
			instName = component.attributes.InstName || '';
			value = component.attributes.Value || '';
		}
	});

	function close() {
		visible = false;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			close();
		} else if (e.key === 'Enter' && !e.shiftKey) {
			save();
		}
	}

	function save() {
		if (!component) return;

		const updatedComponent: Component = {
			...component,
			attributes: {
				...component.attributes,
				InstName: instName,
				Value: value
			}
		};

		onsave?.(updatedComponent);
		close();
	}

	function needsModel(type: string): boolean {
		return ['diode', 'npn', 'pnp', 'nmos', 'pmos'].includes(type);
	}

	function getTypeLabel(type: string): string {
		switch (type) {
			case 'resistor': return 'Resistor';
			case 'capacitor': return 'Capacitor';
			case 'inductor': return 'Inductor';
			case 'voltage': return 'Voltage Source';
			case 'current': return 'Current Source';
			case 'diode': return 'Diode';
			case 'npn': return 'NPN Transistor';
			case 'pnp': return 'PNP Transistor';
			case 'nmos': return 'NMOS Transistor';
			case 'pmos': return 'PMOS Transistor';
			case 'ground': return 'Ground';
			default: return type;
		}
	}

	function getValueLabel(type: string): string {
		if (needsModel(type)) return 'Model';
		return 'Value';
	}

	function getValueHint(type: string): string {
		switch (type) {
			case 'resistor': return 'e.g., 1k, 10k, 4.7k';
			case 'capacitor': return 'e.g., 1u, 100n, 10p or {PARAM}';
			case 'inductor': return 'e.g., 1m, 100u';
			case 'voltage': return 'e.g., 5, DC 5, PULSE(0 5 0 1n 1n 1m 2m)';
			case 'current': return 'e.g., 1m, DC 1m';
			case 'diode': return 'e.g., 1N4148, 1N4001, LED_RED';
			case 'npn': return 'e.g., 2N2222, 2N3904';
			case 'pnp': return 'e.g., 2N3906';
			default: return '';
		}
	}

	// Available models for the component type
	function getAvailableModels(type: string): string[] {
		const schematicModels = (models || []).map(m => m.name);
		const libraryModels = Object.keys(ALL_MODELS).filter(name => {
			const model = ALL_MODELS[name];
			if (type === 'diode') return model.type === 'D';
			if (type === 'npn') return model.type === 'NPN';
			if (type === 'pnp') return model.type === 'PNP';
			return false;
		});
		return [...new Set([...schematicModels, ...libraryModels])];
	}

	function selectModel(modelName: string) {
		if (modelName) {
			value = modelName;
		}
	}
</script>

<!-- Use specialized SourceEditModal for voltage/current sources -->
{#if visible && component && isSourceComponent(component)}
	<SourceEditModal bind:visible bind:component {onsave} />
{:else if visible && component}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={close} onkeydown={handleKeyDown}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Edit {getTypeLabel(component.type)}</h2>
				<button class="close-btn" onclick={close} aria-label="Close">×</button>
			</div>
			<div class="modal-body">
				<div class="form-group">
					<label for="inst-name">Instance Name</label>
					<input id="inst-name" type="text" bind:value={instName} placeholder="e.g., R1, C1" />
				</div>

				{#if component.type !== 'ground'}
					<div class="form-group">
						<label for="comp-value">{getValueLabel(component.type)}</label>
						{#if needsModel(component.type)}
							<div class="value-with-select">
								<input id="comp-value" type="text" bind:value={value} placeholder={getValueHint(component.type)} />
								<select onchange={(e) => selectModel((e.target as HTMLSelectElement).value)}>
									<option value="">Library...</option>
									{#each getAvailableModels(component.type) as name}
										<option value={name}>{name}</option>
									{/each}
								</select>
							</div>
						{:else}
							<input id="comp-value" type="text" bind:value={value} placeholder={getValueHint(component.type)} />
						{/if}
						{#if getValueHint(component.type)}
							<span class="hint">{getValueHint(component.type)}</span>
						{/if}
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
		max-width: 400px;
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
		font-size: 16px;
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
	}

	.form-group {
		margin-bottom: var(--spacing-md);
	}

	.form-group:last-child {
		margin-bottom: 0;
	}

	.form-group label {
		display: block;
		margin-bottom: var(--spacing-xs);
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
	}

	.form-group input,
	.form-group select {
		width: 100%;
		padding: var(--spacing-sm);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		color: var(--text-primary);
		font-family: monospace;
		font-size: 14px;
	}

	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: var(--accent-blue);
	}

	.value-with-select {
		display: flex;
		gap: var(--spacing-xs);
	}

	.value-with-select input {
		flex: 1;
	}

	.value-with-select select {
		width: auto;
		flex-shrink: 0;
	}

	.hint {
		display: block;
		margin-top: var(--spacing-xs);
		font-size: var(--font-size-xs);
		color: var(--text-secondary);
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

