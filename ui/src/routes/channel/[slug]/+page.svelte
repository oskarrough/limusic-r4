<script lang="ts">
	import { page } from '$app/state';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		PlayIcon,
		ShuffleIcon,
		BookmarkAdd02Icon,
		BookmarkCheck02Icon,
		Link01Icon
	} from '@hugeicons/core-free-icons';
	import TrackRow from '$lib/components/TrackRow.svelte';
	import TrackSelectionBar from '$lib/components/TrackSelectionBar.svelte';
	import TrackSelectButton from '$lib/components/TrackSelectButton.svelte';
	import TrackFilter, { filterTracks } from '$lib/components/TrackFilter.svelte';
	import TrackRowSkeleton from '$lib/components/TrackRowSkeleton.svelte';
	import PlaylistMenu from '$lib/components/PlaylistMenu.svelte';
	import ErrorState from '$lib/components/ErrorState.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as api from '$lib/api';
	import * as r4 from '$lib/r4';
	import { trackSelection } from '$lib/selection.svelte';
	import { reveal } from '$lib/reveal.svelte';
	import { auth, isSaved, openAddManyToPlaylist, playback, playFrom, toast, toggleSaved } from '$lib/player.svelte';
	import { getCached, putCached } from '$lib/pagecache';
	import { t } from '$lib/i18n.svelte';

	let ch = $state<r4.ChannelPage | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let expanded = $state(false);
	let query = $state('');
	// Channels run to thousands of tracks; mount them in chunks as the list scrolls.
	const rv = reveal();

	const slug = $derived(page.params.slug ?? '');
	const shown = $derived(filterTracks(ch?.tracks ?? [], query));
	const selection = trackSelection(() => ch?.tracks ?? [], () => shown, () => `${auth.epoch}:r4:${slug}`);
	const nowId = $derived(playback.now?.videoId);
	const saved = $derived(ch ? isSaved(ch.item.id) : false);

	async function load(s: string) {
		const key = `channel:${s}`;
		const hit = getCached<r4.ChannelPage>(key);
		if (hit) {
			ch = hit;
			loading = false;
		} else {
			loading = true;
			ch = null;
		}
		error = null;
		expanded = false;
		query = '';
		rv.reset();
		try {
			const fresh = await r4.channelPage(s);
			if (s !== slug) return; // superseded by navigation
			ch = fresh;
			putCached(key, fresh);
		} catch (e) {
			if (s !== slug) return;
			if (!hit) error = String(e);
		} finally {
			if (s === slug) loading = false;
		}
	}

	$effect(() => {
		if (slug) load(slug);
	});

	// `start` indexes the filtered rows; the queue is always the whole channel.
	function playAll(start: number | null, shuffle = false) {
		if (!ch?.tracks.length) return;
		const at = start === null ? null : ch.tracks.indexOf(shown[start]);
		playFrom(ch.item, ch.tracks, at === -1 ? null : at, undefined, shuffle);
	}

	function toggleLibrary() {
		if (!ch) return;
		const next = !saved;
		toggleSaved(ch.item);
		toast.success(next ? t('library.saved_to_library') : t('toasts.removed_from_library'));
	}
</script>

{#if loading}
	<div class="flex flex-col gap-5 p-6 pt-10">
		<div class="flex items-end gap-5">
			<Skeleton class="h-28 w-28 shrink-0 rounded-xl" />
			<div class="flex-1 space-y-3">
				<Skeleton class="h-3 w-16 rounded" />
				<Skeleton class="h-10 w-1/2 rounded-lg" />
				<Skeleton class="h-4 w-40 rounded" />
			</div>
		</div>
		{#each Array(8) as _, i (i)}
			<TrackRowSkeleton />
		{/each}
	</div>
{:else if error}
	<div class="p-6"><ErrorState message={error} onRetry={() => load(slug)} /></div>
{:else if ch}
	<div class="content-in relative overflow-hidden">
		<div class="art-wash absolute inset-0 overflow-hidden">
			{#if ch.item.thumbnail}
				<img
					src={r4.channelImage(ch.channel.image, 96)}
					alt=""
					class="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
				/>
			{/if}
			<div
				class="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/40"
			></div>
		</div>

		<div class="absolute right-6 top-6 z-10">
			<TrackFilter bind:value={query} placeholder={t('common.search')} />
		</div>

		<div class="relative flex flex-col gap-5 p-6 pt-10">
			<div class="flex items-end gap-5">
				{#if ch.item.thumbnail}
					<img
						src={ch.item.thumbnail}
						alt=""
						style="width:7rem;height:7rem"
						class="shrink-0 rounded-xl object-cover shadow-2xl"
					/>
				{:else}
					<div style="width:7rem;height:7rem" class="shrink-0 rounded-xl bg-muted"></div>
				{/if}
				<div class="min-w-0">
					<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Radio4000 · @{ch.channel.slug}
					</div>
					<h1 class="mt-1 font-heading text-4xl font-bold tracking-tight drop-shadow">
						{ch.item.title}
					</h1>
					<div class="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
						<span>{ch.tracks.length} tracks</span>
						{#if ch.skipped}
							<span class="text-muted-foreground/60">•</span>
							<span title="Only YouTube tracks can play here">{ch.skipped} not on YouTube</span>
						{/if}
					</div>
				</div>
			</div>

			{#if ch.channel.description}
				<div class="max-w-2xl">
					<p class="whitespace-pre-line text-sm text-foreground/80 {expanded ? '' : 'line-clamp-2'}">
						{ch.channel.description}
					</p>
					<button
						class="mt-1 cursor-pointer text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
						onclick={() => (expanded = !expanded)}
					>
						{expanded ? t('common.less') : t('common.more')}
					</button>
				</div>
			{/if}

			<div class="relative flex items-center gap-3">
				<button
					class="flex cursor-pointer items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-foreground transition hover:opacity-90 disabled:opacity-50"
					onclick={() => playAll(null)}
					disabled={!ch.tracks.length}
				>
					<HugeiconsIcon icon={PlayIcon} class="h-4 w-4" /> {t('player.play')}
				</button>
				<button
					class="flex cursor-pointer items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition hover:bg-accent/10 disabled:opacity-50"
					onclick={() => playAll(null, true)}
					disabled={!ch.tracks.length}
				>
					<HugeiconsIcon icon={ShuffleIcon} class="h-4 w-4" /> {t('common.shuffle')}
				</button>
				<button
					class="flex cursor-pointer items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition hover:bg-accent/10"
					class:border-primary={saved}
					class:text-primary={saved}
					onclick={toggleLibrary}
				>
					<HugeiconsIcon
						icon={BookmarkAdd02Icon}
						altIcon={BookmarkCheck02Icon}
						showAlt={saved}
						class="h-4 w-4"
					/>
					{saved ? t('library.in_library') : t('library.save_to_library')}
				</button>
				<TrackSelectButton
					{selection}
					class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border transition hover:bg-accent/10 hover:text-foreground"
				/>
				<button
					class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border text-muted-foreground transition hover:bg-accent/10 hover:text-foreground"
					onclick={() => api.openExternal(r4.channelUrl(ch!.channel.slug))}
					aria-label="Open on radio4000.com"
					title="Open on radio4000.com"
				>
					<HugeiconsIcon icon={Link01Icon} class="h-5 w-5" />
				</button>
				<PlaylistMenu
					item={ch.item}
					vertical
					iconClass="h-5 w-5"
					triggerClass="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border text-muted-foreground transition hover:bg-accent/10 hover:text-foreground"
				/>
			</div>
		</div>
	</div>

	<div class="content-in p-6 pt-2">
		<TrackSelectionBar {selection} from={ch.item.title} />
		{#each shown.slice(0, rv.count(shown.length)) as item, i (JSON.stringify([item.video_id, i]))}
			<TrackRow
				song={item}
				{selection}
				selectionKey={selection.visibleKeys[i]}
				index={i}
				active={item.video_id === nowId}
				onplay={() => playAll(i)}
				onAdd={() => openAddManyToPlaylist([item])}
			/>
		{:else}
			<p class="p-4 text-sm text-muted-foreground">
				{query.trim()
					? t('library.no_matching_tracks', { query: query.trim() })
					: t('common.nothing_here')}
			</p>
		{/each}
		{#if rv.more(shown.length)}<div {@attach rv.sentinel}></div>{/if}
	</div>
{/if}
