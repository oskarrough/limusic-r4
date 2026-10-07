<script module lang="ts">
	// Survives remounts, so coming back to /search shows the last search instead of a blank page.
	let lastQuery = '';
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Search01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
	import ErrorState from '$lib/components/ErrorState.svelte';
	import MediaCard from '$lib/components/MediaCard.svelte';
	import MediaCardSkeleton from '$lib/components/MediaCardSkeleton.svelte';
	import SearchSuggest from '$lib/components/SearchSuggest.svelte';
	import SectionHeading from '$lib/components/SectionHeading.svelte';
	import TrackRow from '$lib/components/TrackRow.svelte';
	import TrackRowSkeleton from '$lib/components/TrackRowSkeleton.svelte';
	import * as api from '$lib/api';
	import type { BrowseItem, SongItem } from '$lib/api';
	import * as r4 from '$lib/r4';
	import { noteSearch, openAddManyToPlaylist, openPlayer, playback } from '$lib/player.svelte';
	import { getCached, putCached } from '$lib/pagecache';
	import { t } from '$lib/i18n.svelte';

	type Results = { channels: BrowseItem[]; tracks: SongItem[] };

	let query = $state(page.url.searchParams.get('q') ?? lastQuery);
	let res = $state<Results | null>(null);
	let searched = $state('');
	let searching = $state(false);
	let error = $state<string | null>(null);
	let latest = '';
	const nowId = $derived(playback.now?.videoId);

	async function runSearch() {
		const q = query.trim();
		if (!q) return;
		latest = q;
		lastQuery = q;
		noteSearch(q);
		const key = `search:r4:${q}`;
		const hit = getCached<Results>(key);
		if (hit) res = hit;
		searching = !hit;
		error = null;
		try {
			const fresh = await r4.search(q);
			if (latest !== q) return;
			res = fresh;
			searched = q;
			putCached(key, fresh);
		} catch (e) {
			if (latest !== q) return;
			if (!hit) error = String(e);
		} finally {
			if (latest === q) searching = false;
		}
	}

	function clearSearch() {
		latest = lastQuery = query = '';
		res = null;
		error = null;
	}

	// The titlebar and the home hero land here with ?q=.
	$effect(() => {
		const q = page.url.searchParams.get('q');
		if (q && q !== latest) {
			query = q;
			runSearch();
		}
	});
	if (lastQuery && !page.url.searchParams.get('q')) runSearch();

	// A track found in search plays with the other matches queued behind it.
	function playTrack(i: number) {
		if (!res) return;
		// Straight to the player, not `playFrom`: a search isn't a place to list under recents.
		openPlayer();
		api.playPlaylist(res.tracks, i, undefined, `“${searched}”`);
	}
</script>

<div class="p-6">
	<form
		class="relative mx-auto max-w-2xl"
		onsubmit={(e) => {
			e.preventDefault();
			runSearch();
		}}
	>
		<HugeiconsIcon
			icon={Search01Icon}
			class="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted-foreground"
		/>
		<SearchSuggest
			bind:value={query}
			placeholder="Search Radio4000 channels and tracks"
			inputClass="h-12 rounded-full bg-card/80 pl-12 text-base shadow-sm md:text-base"
			onpick={() => {
				lastQuery = query;
				noteSearch(query);
			}}
		/>
		{#if query}
			<button
				type="button"
				class="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
				aria-label={t('a11y.clear_search')}
				onclick={clearSearch}
			>
				<HugeiconsIcon icon={Cancel01Icon} class="h-4 w-4" />
			</button>
		{/if}
	</form>

	<div class="mt-8 flex flex-col gap-10">
		{#if searching}
			<div class="card-grid">
				{#each Array(6) as _, i (i)}
					<MediaCardSkeleton />
				{/each}
			</div>
			<div>
				{#each Array(6) as _, i (i)}
					<TrackRowSkeleton />
				{/each}
			</div>
		{:else if error}
			<ErrorState message={error} onRetry={runSearch} />
		{:else if res}
			{#if res.channels.length}
				<section>
					<SectionHeading title="Channels" />
					<div class="card-grid content-in">
						{#each res.channels as item (item.id)}
							<MediaCard {item} />
						{/each}
					</div>
				</section>
			{/if}
			{#if res.tracks.length}
				<section>
					<SectionHeading title="Tracks" />
					<div class="content-in">
						{#each res.tracks as song, i (song.video_id + i)}
							<TrackRow
								{song}
								index={i}
								active={song.video_id === nowId}
								onplay={() => playTrack(i)}
								onAdd={() => openAddManyToPlaylist([song])}
							/>
						{/each}
					</div>
				</section>
			{/if}
			{#if !res.channels.length && !res.tracks.length}
				<p class="text-center text-sm text-muted-foreground">{t('common.nothing_here')}</p>
			{/if}
		{/if}
	</div>
</div>
