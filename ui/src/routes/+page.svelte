<script lang="ts">
	import MediaCard from '$lib/components/MediaCard.svelte';
	import MediaCardSkeleton from '$lib/components/MediaCardSkeleton.svelte';
	import ErrorState from '$lib/components/ErrorState.svelte';
	import HomeHero from '$lib/components/HomeHero.svelte';
	import Shortcuts from '$lib/components/Shortcuts.svelte';
	import RecentRail from '$lib/components/RecentRail.svelte';
	import TrackFilter from '$lib/components/TrackFilter.svelte';
	import type { BrowseItem } from '$lib/api';
	import * as r4 from '$lib/r4';
	import { personal } from '$lib/player.svelte';
	import { recentItems } from '$lib/personal';
	import { getCached, putCached } from '$lib/pagecache';
	import { reveal } from '$lib/reveal.svelte';
	import { t } from '$lib/i18n.svelte';

	const KEY = 'home:r4';

	const cached = getCached<BrowseItem[]>(KEY) ?? [];
	let channels = $state<BrowseItem[]>(cached);
	let loading = $state(!cached.length);
	let error = $state<string | null>(null);
	let query = $state('');
	const rv = reveal();

	// Shortcuts are what you play on purpose; recents are what isn't already up there.
	const pinned = $derived(new Set(personal.picks.map((p) => p.id)));
	const recent = $derived(
		recentItems(personal, 100)
			.filter((r) => !pinned.has(r.id))
			.slice(0, 9)
	);

	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return channels;
		return channels.filter(
			(c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
		);
	});

	async function load() {
		error = null;
		try {
			channels = await r4.recentChannels(300);
			putCached(KEY, channels);
		} catch (e) {
			if (!channels.length) error = String(e);
		} finally {
			loading = false;
		}
	}

	load();
</script>

<div class="relative isolate">
	<HomeHero />
	<div class="flex flex-col gap-10 px-6 pb-10 pt-4">
		<Shortcuts />
		{#if recent.length}<RecentRail items={recent} />{/if}

		<section>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="font-heading text-xl font-bold">Fresh on Radio4000</h2>
				<TrackFilter bind:value={query} placeholder={t('common.search')} />
			</div>
			{#if loading}
				<div class="card-grid">
					{#each Array(12) as _, i (i)}
						<MediaCardSkeleton />
					{/each}
				</div>
			{:else if error}
				<ErrorState message={error} onRetry={load} />
			{:else if shown.length}
				<div class="card-grid content-in">
					{#each shown.slice(0, rv.count(shown.length)) as item (item.id)}
						<MediaCard {item} />
					{/each}
				</div>
				{#if rv.more(shown.length)}<div {@attach rv.sentinel}></div>{/if}
			{:else}
				<p class="text-sm text-muted-foreground">{t('common.nothing_here')}</p>
			{/if}
		</section>
	</div>
</div>
