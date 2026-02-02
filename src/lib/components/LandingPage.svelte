<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';

	interface Example {
		id: string;
		name: string;
		description: string;
		category: 'basic' | 'analog' | 'digital';
		schematicFile: string;
		netlistFile: string;
		previewImage: string | null;
	}

	let examples = $state<Example[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let { onnewproject, onopenfile, onloadexample }: {
		onnewproject: () => void;
		onopenfile: () => void;
		onloadexample: (example: Example) => void;
	} = $props();

	onMount(async () => {
		try {
			// @ts-ignore - base is deprecated but still functional
			const response = await fetch(`${base}/examples/examples.json`);
			if (!response.ok) {
				throw new Error(`Failed to load examples: ${response.statusText}`);
			}
			const data = await response.json();
			examples = data.examples;
			loading = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load examples';
			loading = false;
		}
	});

	function handleNewProject() {
		onnewproject();
	}

	function handleOpenFile() {
		onopenfile();
	}

	function handleExampleClick(example: Example) {
		onloadexample(example);
	}

	function getCategoryIcon(category: string) {
		switch (category) {
			case 'basic':
				return 'M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z';
			case 'analog':
				return 'M3 12h4l3 9 4-18 3 9h4';
			case 'digital':
				return 'M4 6h16M4 12h16M4 18h16';
			default:
				return 'M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z';
		}
	}
</script>

<div class="landing-page">
	<div class="landing-content">
		<div class="hero">
			<h1 class="hero-title">WebSpice</h1>
			<p class="hero-subtitle">Browser-based SPICE circuit simulator</p>
		</div>

		<div class="action-buttons">
			<button class="action-btn primary" onclick={handleNewProject}>
				<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				<span>New Project</span>
			</button>

			<button class="action-btn secondary" onclick={handleOpenFile}>
				<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
				</svg>
				<span>Open File</span>
			</button>
		</div>

		<div class="examples-section">
			<h3 class="examples-title">Or try an example:</h3>
			{#if loading}
				<p class="examples-loading">Loading examples...</p>
			{:else if error}
				<p class="examples-error">Error: {error}</p>
			{:else if examples.length === 0}
				<p class="examples-empty">No examples available</p>
			{:else}
				<div class="examples-grid">
					{#each examples as example (example.id)}
						<button class="example-card" class:has-preview={example.previewImage} onclick={() => handleExampleClick(example)}>
							{#if example.previewImage}
								<div class="example-preview">
									<img src="{base}{example.previewImage}" alt="{example.name} preview" />
								</div>
							{:else}
								<div class="example-icon">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getCategoryIcon(example.category)} />
									</svg>
								</div>
							{/if}
							<div class="example-info">
								<span class="example-name">{example.name}</span>
								<span class="example-desc">{example.description}</span>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<footer class="landing-footer">
			<a href="https://github.com/jwt625/WebSpice" target="_blank" rel="noopener noreferrer" class="github-link">
				<svg viewBox="0 0 24 24" fill="currentColor" class="github-icon">
					<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
				</svg>
				<span>View on GitHub</span>
			</a>
		</footer>
	</div>
</div>

<style>
	.landing-page {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		background: var(--bg-primary);
		padding: 2rem;
	}

	.landing-content {
		max-width: 800px;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.hero {
		text-align: center;
	}

	.hero-title {
		font-size: 3rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 0.5rem 0;
	}

	.hero-subtitle {
		font-size: 1.125rem;
		color: var(--text-secondary);
		margin: 0;
	}

	.action-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.action-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem 1.5rem;
		background: var(--bg-secondary);
		border: 2px solid var(--border-primary);
		border-radius: 0;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 1.125rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.action-btn:hover {
		background: var(--bg-tertiary);
		border-color: var(--btn-primary-bg);
	}

	.action-btn.primary {
		border-color: var(--btn-primary-bg);
	}

	.action-btn.primary:hover {
		background: var(--btn-primary-bg);
		border-color: var(--btn-primary-hover);
	}

	.btn-icon {
		width: 48px;
		height: 48px;
		color: currentColor;
	}

	.examples-section {
		text-align: left;
	}

	.examples-title {
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.examples-loading,
	.examples-error,
	.examples-empty {
		padding: 2rem;
		text-align: center;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.examples-error {
		color: var(--accent-red, #ff6b6b);
	}

	.examples-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 1rem;
	}

	.example-card {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: var(--bg-secondary);
		border: 1px solid var(--border-primary);
		border-radius: 0;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}

	.example-card:hover {
		background: var(--bg-tertiary);
		border-color: var(--btn-primary-bg);
	}

	.example-card.has-preview {
		flex-direction: column;
		gap: 0.75rem;
	}

	.example-preview {
		width: 100%;
		aspect-ratio: 16 / 10;
		overflow: hidden;
		background: var(--bg-primary);
		border: 1px solid var(--border-primary);
	}

	.example-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.example-icon {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-primary);
		color: var(--btn-primary-bg);
	}

	.example-icon svg {
		width: 28px;
		height: 28px;
	}

	.example-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.example-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.example-desc {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.landing-footer {
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border-primary);
		text-align: center;
	}

	.github-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-secondary);
		text-decoration: none;
		font-size: 0.875rem;
		transition: color 0.2s ease;
	}

	.github-link:hover {
		color: var(--text-primary);
	}

	.github-icon {
		width: 20px;
		height: 20px;
	}

	@media (max-width: 640px) {
		.action-buttons {
			grid-template-columns: 1fr;
		}

		.examples-grid {
			grid-template-columns: 1fr;
		}

		.hero-title {
			font-size: 2rem;
		}
	}
</style>

