// Radio4000 is the only catalogue. Channels come through the R4 SDK (Supabase under it) and are
// drawn as playlists; their YouTube tracks become SongItems the Rust player streams like any
// other video. Tracks on other providers (SoundCloud, Vimeo, …) are dropped: the engine only
// speaks YouTube.
import { sdk, type Channel, type Track } from '@radio4000/sdk';
import type { BrowseItem, SearchSuggestions, SongItem } from './api';

/** Prefix that marks a BrowseItem id as an R4 channel slug. */
export const R4_PREFIX = 'R4:';
export const isChannelId = (id: string | undefined | null): boolean =>
	!!id && id.startsWith(R4_PREFIX);
export const slugOf = (id: string) => id.slice(R4_PREFIX.length);
export const channelHref = (slug: string) => `/channel/${encodeURIComponent(slug)}`;
export const channelUrl = (slug: string) => `https://radio4000.com/${slug}`;

const CLOUDINARY = 'https://res.cloudinary.com/radio4000/image/upload';
export const channelImage = (id: string | null | undefined, size = 400) =>
	id ? `${CLOUDINARY}/w_${size},h_${size},c_thumb,q_70,fl_awebp/${id}.webp` : undefined;

export interface ChannelPage {
	channel: Channel;
	item: BrowseItem;
	tracks: SongItem[];
	/** Tracks the player can't stream (not on YouTube), left out of `tracks`. */
	skipped: number;
}

const unwrap = <T>({ data, error }: { data: T | null; error: unknown }): T => {
	if (error) throw new Error((error as { message?: string }).message ?? String(error));
	return data as T;
};

export function channelItem(c: Pick<Channel, 'slug' | 'name' | 'image' | 'track_count'>): BrowseItem {
	return {
		kind: 'playlist',
		id: R4_PREFIX + c.slug,
		title: c.name || c.slug,
		subtitle: c.track_count ? `${c.track_count} tracks` : `@${c.slug}`,
		thumbnail: channelImage(c.image)
	};
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** R4 titles are mostly "Artist - Title"; split on the first dash when there is one. */
function splitTitle(raw: string): { artists: string; title: string } {
	const m = raw.match(/^(.+?)\s+[-–—]\s+(.+)$/);
	return m ? { artists: m[1].trim(), title: m[2].trim() } : { artists: '', title: raw.trim() };
}

export const isPlayable = (t: Track) => t.provider === 'youtube' && !!t.media_id;

export function trackSong(t: Track, channelName?: string): SongItem {
	const { artists, title } = splitTitle(t.title || '');
	return {
		video_id: t.media_id!,
		title: title || 'Untitled',
		artists: artists || channelName || '',
		duration: t.duration ? clock(t.duration) : undefined,
		thumbnail: `https://i.ytimg.com/vi/${t.media_id}/hqdefault.jpg`,
		queued_from: channelName
	};
}

/** Channels with tracks, freshest first. */
export async function recentChannels(limit = 120): Promise<BrowseItem[]> {
	const rows = unwrap(
		await sdk.supabase
			.from('channels_with_tracks')
			.select('slug,name,image,track_count')
			.gt('track_count', 0)
			.order('latest_track_at', { ascending: false, nullsFirst: false })
			.limit(limit)
	);
	return (rows as Channel[]).map(channelItem);
}

export async function channelPage(slug: string): Promise<ChannelPage> {
	const [channel, tracks] = await Promise.all([
		sdk.channels.readChannel(slug).then(unwrap),
		sdk.channels.readChannelTracks(slug).then(unwrap)
	]);
	const playable = tracks.filter(isPlayable);
	return {
		channel,
		item: channelItem(channel),
		tracks: playable.map((t) => trackSong(t, channel.name)),
		skipped: tracks.length - playable.length
	};
}

export async function search(query: string): Promise<{ channels: BrowseItem[]; tracks: SongItem[] }> {
	const { channels, tracks } = unwrap(await sdk.search.searchAll(query, { limit: 60 }));
	return {
		channels: channels.filter((c) => c.track_count !== 0).map(channelItem),
		tracks: tracks.filter(isPlayable).map((t) => trackSong(t, t.slug ?? undefined))
	};
}

const songCard = (s: SongItem): BrowseItem => ({
	kind: 'song',
	id: s.video_id,
	title: s.title,
	subtitle: s.artists,
	thumbnail: s.thumbnail,
	duration: s.duration
});

/** The typeahead: a few channels, then a few tracks. Same shape as the YouTube suggestions. */
export async function suggest(query: string): Promise<SearchSuggestions> {
	const { channels, tracks } = await search(query);
	return { queries: [], items: [...channels.slice(0, 5), ...tracks.slice(0, 4).map(songCard)] };
}
