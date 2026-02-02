<script lang="ts">
	import type { Component } from '$lib/schematic/types';

	let {
		visible = $bindable(false),
		component = $bindable<Component | null>(null),
		onsave
	}: {
		visible: boolean;
		component: Component | null;
		onsave?: (component: Component) => void;
	} = $props();

	// Source type definitions with parameters
	type SourceTypeConfig = {
		label: string;
		params: { name: string; label: string; hint: string; default: string }[];
	};

	const SOURCE_TYPES: Record<string, SourceTypeConfig> = {
		DC: {
			label: 'DC (Constant)',
			params: [
				{ name: 'value', label: 'Value', hint: 'e.g., 5, 3.3, 12', default: '5' }
			]
		},
		PULSE: {
			label: 'PULSE (Square/Pulse)',
			params: [
				{ name: 'V1', label: 'Initial Value (V1)', hint: 'e.g., 0', default: '0' },
				{ name: 'V2', label: 'Pulsed Value (V2)', hint: 'e.g., 5', default: '5' },
				{ name: 'TD', label: 'Delay (TD)', hint: 'e.g., 0, 1n', default: '0' },
				{ name: 'TR', label: 'Rise Time (TR)', hint: 'e.g., 1n, 10n', default: '1n' },
				{ name: 'TF', label: 'Fall Time (TF)', hint: 'e.g., 1n, 10n', default: '1n' },
				{ name: 'PW', label: 'Pulse Width (PW)', hint: 'e.g., 1m, 500u', default: '1m' },
				{ name: 'PER', label: 'Period (PER)', hint: 'e.g., 2m, 1m', default: '2m' }
			]
		},
		SIN: {
			label: 'SIN (Sinusoidal)',
			params: [
				{ name: 'VO', label: 'Offset (VO)', hint: 'e.g., 0, 2.5', default: '0' },
				{ name: 'VA', label: 'Amplitude (VA)', hint: 'e.g., 1, 5', default: '1' },
				{ name: 'FREQ', label: 'Frequency (FREQ)', hint: 'e.g., 1k, 1MEG', default: '1k' },
				{ name: 'TD', label: 'Delay (TD)', hint: 'e.g., 0, 1m', default: '0' },
				{ name: 'THETA', label: 'Damping (THETA)', hint: 'e.g., 0', default: '0' },
				{ name: 'PHASE', label: 'Phase (degrees)', hint: 'e.g., 0, 90', default: '0' }
			]
		},
		EXP: {
			label: 'EXP (Exponential)',
			params: [
				{ name: 'V1', label: 'Initial Value (V1)', hint: 'e.g., 0', default: '0' },
				{ name: 'V2', label: 'Pulsed Value (V2)', hint: 'e.g., 5', default: '5' },
				{ name: 'TD1', label: 'Rise Delay (TD1)', hint: 'e.g., 0, 1n', default: '0' },
				{ name: 'TAU1', label: 'Rise Time Const (TAU1)', hint: 'e.g., 1m', default: '1m' },
				{ name: 'TD2', label: 'Fall Delay (TD2)', hint: 'e.g., 5m', default: '5m' },
				{ name: 'TAU2', label: 'Fall Time Const (TAU2)', hint: 'e.g., 1m', default: '1m' }
			]
		},
		PWL: {
			label: 'PWL (Piecewise Linear)',
			params: [
				{ name: 'points', label: 'Time-Value Pairs', hint: 'e.g., 0 0 1m 5 2m 5 3m 0', default: '0 0 1m 5 2m 0' }
			]
		},
		SFFM: {
			label: 'SFFM (Single-Freq FM)',
			params: [
				{ name: 'VO', label: 'Offset (VO)', hint: 'e.g., 0', default: '0' },
				{ name: 'VA', label: 'Amplitude (VA)', hint: 'e.g., 1', default: '1' },
				{ name: 'FM', label: 'Mod Frequency (FM)', hint: 'e.g., 100', default: '100' },
				{ name: 'MDI', label: 'Mod Index (MDI)', hint: 'e.g., 5', default: '5' },
				{ name: 'FC', label: 'Carrier Freq (FC)', hint: 'e.g., 1k', default: '1k' }
			]
		},
		AM: {
			label: 'AM (Amplitude Mod)',
			params: [
				{ name: 'VO', label: 'Offset (VO)', hint: 'e.g., 0', default: '0' },
				{ name: 'VMO', label: 'Mod Offset (VMO)', hint: 'e.g., 1', default: '1' },
				{ name: 'VMA', label: 'Mod Amplitude (VMA)', hint: 'e.g., 1', default: '1' },
				{ name: 'FM', label: 'Mod Frequency (FM)', hint: 'e.g., 1k', default: '1k' },
				{ name: 'FC', label: 'Carrier Freq (FC)', hint: 'e.g., 100k', default: '100k' }
			]
		}
	};

	// Local editing state
	let instName = $state('');
	let sourceType = $state<string>('DC');
	let paramValues = $state<Record<string, string>>({});
	let acMag = $state('');
	let acPhase = $state('');

	// Parse existing value to determine source type and parameters
	function parseSourceValue(value: string): { type: string; params: Record<string, string>; acMag?: string; acPhase?: string } {
		if (!value || value.trim() === '') {
			return { type: 'DC', params: { value: '0' } };
		}

		const trimmed = value.trim();
		const upperVal = trimmed.toUpperCase();

		// Check for AC component
		let mainPart = trimmed;
		let acMagParsed = '';
		let acPhaseParsed = '';
		const acMatch = upperVal.match(/AC\s+([\d.]+[A-Z]*)\s*([\d.]*)/i);
		if (acMatch) {
			acMagParsed = acMatch[1] || '';
			acPhaseParsed = acMatch[2] || '';
			mainPart = trimmed.replace(/AC\s+[\d.]+[A-Z]*\s*[\d.]*/i, '').trim();
		}

		// Parse source type
		if (upperVal.startsWith('PULSE') || upperVal.includes('PULSE(')) {
			const match = mainPart.match(/PULSE\s*\(\s*([^)]+)\s*\)/i);
			if (match) {
				const parts = match[1].trim().split(/\s+/);
				const paramNames = ['V1', 'V2', 'TD', 'TR', 'TF', 'PW', 'PER'];
				const params: Record<string, string> = {};
				paramNames.forEach((name, i) => { params[name] = parts[i] || SOURCE_TYPES.PULSE.params[i]?.default || ''; });
				return { type: 'PULSE', params, acMag: acMagParsed, acPhase: acPhaseParsed };
			}
		}

		if (upperVal.startsWith('SIN') || upperVal.includes('SIN(')) {
			const match = mainPart.match(/SIN\s*\(\s*([^)]+)\s*\)/i);
			if (match) {
				const parts = match[1].trim().split(/\s+/);
				const paramNames = ['VO', 'VA', 'FREQ', 'TD', 'THETA', 'PHASE'];
				const params: Record<string, string> = {};
				paramNames.forEach((name, i) => { params[name] = parts[i] || SOURCE_TYPES.SIN.params[i]?.default || ''; });
				return { type: 'SIN', params, acMag: acMagParsed, acPhase: acPhaseParsed };
			}
		}

		if (upperVal.startsWith('EXP') || upperVal.includes('EXP(')) {
			const match = mainPart.match(/EXP\s*\(\s*([^)]+)\s*\)/i);
			if (match) {
				const parts = match[1].trim().split(/\s+/);
				const paramNames = ['V1', 'V2', 'TD1', 'TAU1', 'TD2', 'TAU2'];
				const params: Record<string, string> = {};
				paramNames.forEach((name, i) => { params[name] = parts[i] || SOURCE_TYPES.EXP.params[i]?.default || ''; });
				return { type: 'EXP', params, acMag: acMagParsed, acPhase: acPhaseParsed };
			}
		}

		if (upperVal.startsWith('PWL') || upperVal.includes('PWL(')) {
			const match = mainPart.match(/PWL\s*\(\s*([^)]+)\s*\)/i);
			if (match) {
				return { type: 'PWL', params: { points: match[1].trim() }, acMag: acMagParsed, acPhase: acPhaseParsed };
			}
		}

		if (upperVal.startsWith('SFFM') || upperVal.includes('SFFM(')) {
			const match = mainPart.match(/SFFM\s*\(\s*([^)]+)\s*\)/i);
			if (match) {
				const parts = match[1].trim().split(/\s+/);
				const paramNames = ['VO', 'VA', 'FM', 'MDI', 'FC'];
				const params: Record<string, string> = {};
				paramNames.forEach((name, i) => { params[name] = parts[i] || SOURCE_TYPES.SFFM.params[i]?.default || ''; });
				return { type: 'SFFM', params, acMag: acMagParsed, acPhase: acPhaseParsed };
			}
		}

		if (upperVal.startsWith('AM') || upperVal.includes('AM(')) {
			const match = mainPart.match(/AM\s*\(\s*([^)]+)\s*\)/i);
			if (match) {
				const parts = match[1].trim().split(/\s+/);
				const paramNames = ['VO', 'VMO', 'VMA', 'FM', 'FC'];
				const params: Record<string, string> = {};
				paramNames.forEach((name, i) => { params[name] = parts[i] || SOURCE_TYPES.AM.params[i]?.default || ''; });
				return { type: 'AM', params, acMag: acMagParsed, acPhase: acPhaseParsed };
			}
		}

		// Default to DC - strip "DC" prefix if present
		let dcValue = mainPart.replace(/^DC\s*/i, '').trim() || '0';
		return { type: 'DC', params: { value: dcValue }, acMag: acMagParsed, acPhase: acPhaseParsed };
	}

	// Build value string from source type and parameters
	function buildSourceValue(): string {
		const config = SOURCE_TYPES[sourceType];
		if (!config) return '';

		let result = '';

		if (sourceType === 'DC') {
			result = paramValues.value || '0';
		} else if (sourceType === 'PWL') {
			result = `PWL(${paramValues.points || '0 0'})`;
		} else {
			const paramList = config.params.map(p => paramValues[p.name] || p.default).join(' ');
			result = `${sourceType}(${paramList})`;
		}

		// Add AC component if specified
		if (acMag && acMag.trim()) {
			result += ` AC ${acMag.trim()}`;
			if (acPhase && acPhase.trim()) {
				result += ` ${acPhase.trim()}`;
			}
		}

		return result;
	}

	// Sync local state when modal opens or component changes
	$effect(() => {
		if (visible && component) {
			instName = component.attributes.InstName || '';
			const parsed = parseSourceValue(component.attributes.Value || '');
			sourceType = parsed.type;
			paramValues = { ...parsed.params };
			acMag = parsed.acMag || '';
			acPhase = parsed.acPhase || '';
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
				Value: buildSourceValue()
			}
		};

		onsave?.(updatedComponent);
		close();
	}

	function handleSourceTypeChange(newType: string) {
		sourceType = newType;
		// Initialize default values for new type
		const config = SOURCE_TYPES[newType];
		if (config) {
			const newParams: Record<string, string> = {};
			config.params.forEach(p => {
				newParams[p.name] = paramValues[p.name] || p.default;
			});
			paramValues = newParams;
		}
	}

	function getTypeLabel(): string {
		return component?.type === 'voltage' ? 'Voltage Source' : 'Current Source';
	}

	$effect(() => {
		// Keep paramValues in sync when sourceType changes
		if (sourceType && SOURCE_TYPES[sourceType]) {
			const config = SOURCE_TYPES[sourceType];
			const currentParams = { ...paramValues };
			config.params.forEach(p => {
				if (currentParams[p.name] === undefined) {
					currentParams[p.name] = p.default;
				}
			});
			// Only update if actually different
			const needsUpdate = config.params.some(p => paramValues[p.name] === undefined);
			if (needsUpdate) {
				paramValues = currentParams;
			}
		}
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if visible && component}
	<div class="modal-backdrop" onclick={close} onkeydown={handleKeyDown}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Edit {getTypeLabel()}</h2>
				<button class="close-btn" onclick={close} aria-label="Close">×</button>
			</div>
			<div class="modal-body">
				<div class="form-group">
					<label for="inst-name">Instance Name</label>
					<input id="inst-name" type="text" bind:value={instName} placeholder="e.g., V1, I1" />
				</div>

				<div class="form-group">
					<label for="source-type">Source Type</label>
					<select id="source-type" value={sourceType} onchange={(e) => handleSourceTypeChange((e.target as HTMLSelectElement).value)}>
						{#each Object.entries(SOURCE_TYPES) as [key, config]}
							<option value={key}>{config.label}</option>
						{/each}
					</select>
				</div>

				<div class="params-section">
					<h3>Parameters</h3>
					{#each SOURCE_TYPES[sourceType]?.params || [] as param}
						<div class="form-group param-row">
							<label for="param-{param.name}">{param.label}</label>
							<input
								id="param-{param.name}"
								type="text"
								bind:value={paramValues[param.name]}
								placeholder={param.hint}
							/>
						</div>
					{/each}
				</div>

				<div class="ac-section">
					<h3>AC Analysis (optional)</h3>
					<div class="form-row">
						<div class="form-group half">
							<label for="ac-mag">AC Magnitude</label>
							<input id="ac-mag" type="text" bind:value={acMag} placeholder="e.g., 1" />
						</div>
						<div class="form-group half">
							<label for="ac-phase">AC Phase (deg)</label>
							<input id="ac-phase" type="text" bind:value={acPhase} placeholder="e.g., 0" />
						</div>
					</div>
				</div>

				<div class="preview-section">
					<span class="preview-label">Preview</span>
					<code class="preview">{buildSourceValue()}</code>
				</div>
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
		max-width: 500px;
		width: 95%;
		max-height: 90vh;
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
		overflow-y: auto;
		flex: 1;
	}

	.form-group {
		margin-bottom: var(--spacing-sm);
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
		box-sizing: border-box;
	}

	.form-group input:focus,
	.form-group select:focus {
		outline: none;
		border-color: var(--accent-blue);
	}

	.params-section,
	.ac-section {
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-sm);
		border-top: 1px solid var(--border-primary);
	}

	.params-section h3,
	.ac-section h3 {
		margin: 0 0 var(--spacing-sm) 0;
		font-size: var(--font-size-sm);
		color: var(--accent-blue);
		font-weight: 600;
	}

	.param-row {
		display: grid;
		grid-template-columns: 1fr 120px;
		gap: var(--spacing-xs);
		align-items: center;
	}

	.param-row label {
		margin: 0;
		font-size: var(--font-size-sm);
	}

	.param-row input {
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.form-row {
		display: flex;
		gap: var(--spacing-sm);
	}

	.half {
		flex: 1;
	}

	.preview-section {
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-sm);
		border-top: 1px solid var(--border-primary);
	}

	.preview-label {
		display: block;
		margin-bottom: var(--spacing-xs);
		font-size: var(--font-size-sm);
		color: var(--text-secondary);
	}

	.preview {
		display: block;
		padding: var(--spacing-sm);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-primary);
		font-family: monospace;
		font-size: 13px;
		color: var(--accent-green);
		word-break: break-all;
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

