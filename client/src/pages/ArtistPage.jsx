import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import toast from 'react-hot-toast';
import { artistsApi, discoverApi, errMsg } from '../api';
import { fileUrl } from '../lib/config';
import { formatCount, pluralUk, tracksLabel } from '../lib/format';
import { usePlayerStore } from '../store/playerStore';
import { useCoverTint } from '../hooks/useAccent';
import Cover, { Collage } from '../components/ui/Cover';
import Tile from '../components/Tile';
import DetailHead, { PlayActions } from '../components/DetailHead';
import TrackList from '../components/TrackRow';
import { Section, Shelf, SkeletonRows, EmptyState } from '../components/Section';

export default function ArtistPage() {
  const { id } = useParams();
  const [showAll, setShowAll] = useState(false);
  const artist = useQuery({ queryKey: ['artist', id], queryFn: () => artistsApi.getById(id).then((r) => r.data) });
  const tracks = useQuery({ queryKey: ['artistTracks', id], queryFn: () => artistsApi.getTracks(id).then((r) => r.data) });
  const albums = useQuery({ queryKey: ['artistAlbums', id], queryFn: () => artistsApi.getAlbums(id).then((r) => r.data) });
  const similar = useQuery({ queryKey: ['artistSimilar', id], queryFn: () => artistsApi.getSimilar(id).then((r) => r.data) });

  const a = artist.data;
  const list = tracks.data ?? [];
  const covers = (a?.covers ?? []).map((c) => fileUrl('covers', c));
  const photo = fileUrl('artists', a?.imagePath);
  const tint = useCoverTint(photo ?? covers[0]);

  const radio = async () => {
    try {
      const res = await discoverApi.mix(`artist-${id}`);
      usePlayerStore.getState().playQueue(res.data.tracks, 0);
    } catch (e) { toast.error(errMsg(e, 'Радіо виконавця поки недоступне')); }
  };

  if (artist.isError) {
    return <div className="page"><EmptyState title="Виконавця не знайдено" action={<Link className="btn" to="/">На головну</Link>} /></div>;
  }

  return (
    <div className="tint" style={tint}>
      <DetailHead
        tint={tint}
        art={photo ? <Cover src={photo} title={a?.name} round lazy={false} /> : <Collage covers={covers} title={a?.name} round />}
        title={a?.name ?? ' '}
        meta={[
          list.length > 0 && tracksLabel(list.length),
          (albums.data?.length ?? 0) > 0 && `${albums.data.length} ${pluralUk(albums.data.length, ['альбом', 'альбоми', 'альбомів'])}`,
          a?.monthlyListeners > 0 && `${formatCount(a.monthlyListeners)} слухачів на місяць`,
          a?.genre && a.genre !== 'Various' ? a.genre : null,
        ]}
      >
        <PlayActions tracks={list}>
          <button className="btn lg" onClick={radio}><Radio size={18} /> Радіо виконавця</button>
        </PlayActions>
      </DetailHead>

      <div className="page" style={{ paddingTop: 'var(--s-6)' }}>
        <Section title="Популярні треки">
          {tracks.isLoading ? <SkeletonRows /> : (
            <>
              <TrackList tracks={showAll ? list : list.slice(0, 6)} queue={list} showAlbum />
              {list.length > 6 && (
                <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Показати менше' : `Усі ${list.length} треків`}
                </button>
              )}
            </>
          )}
        </Section>

        {albums.data?.length > 0 && (
          <Section title="Альбоми">
            <Shelf>
              {albums.data.map((al) => (
                <Tile key={al.id} to={`/album/${al.id}`} art={<Cover src={fileUrl('covers', al.coverPath)} title={al.title} />} title={al.title} sub={`${al.year} · ${tracksLabel(al.trackCount)}`} />
              ))}
            </Shelf>
          </Section>
        )}

        {similar.data?.length > 0 && (
          <Section title="Схожі виконавці">
            <Shelf>
              {similar.data.map((s) => (
                <Tile key={s.id} to={`/artist/${s.id}`} round art={<Collage covers={(s.covers || []).map((c) => fileUrl('covers', c))} title={s.name} round />} title={s.name} sub={tracksLabel(s.trackCount)} />
              ))}
            </Shelf>
          </Section>
        )}

        {a?.bio && a.bio !== 'Новий виконавець на Beatify' && (
          <Section title="Про виконавця"><p className="page-lede">{a.bio}</p></Section>
        )}
      </div>
    </div>
  );
}
