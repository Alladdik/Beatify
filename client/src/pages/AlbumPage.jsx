import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { albumsApi, errMsg } from '../api';
import { fileUrl } from '../lib/config';
import { formatTotalDuration, tracksLabel } from '../lib/format';
import { useCoverTint } from '../hooks/useAccent';
import Cover from '../components/ui/Cover';
import DetailHead, { PlayActions } from '../components/DetailHead';
import TrackList from '../components/TrackRow';
import { SkeletonRows, EmptyState } from '../components/Section';

export default function AlbumPage() {
  const { id } = useParams();
  const album = useQuery({ queryKey: ['album', id], queryFn: () => albumsApi.getById(id).then((r) => r.data) });
  const tracks = useQuery({ queryKey: ['albumTracks', id], queryFn: () => albumsApi.getTracks(id).then((r) => r.data) });

  const a = album.data;
  const list = tracks.data ?? [];
  const cover = fileUrl('covers', a?.coverPath) ?? fileUrl('covers', list.find((t) => t.coverPath)?.coverPath);
  const tint = useCoverTint(cover);
  const total = list.reduce((s, t) => s + (t.duration || 0), 0);

  if (album.isError) {
    return <div className="page"><EmptyState title="Альбом не знайдено" text={errMsg(album.error, 'Можливо, його видалили.')} action={<Link className="btn" to="/">На головну</Link>} /></div>;
  }

  return (
    <div className="tint" style={tint}>
      <DetailHead
        tint={tint}
        art={<Cover src={cover} title={a?.title} lazy={false} />}
        title={a?.title ?? ' '}
        meta={[
          a && <Link key="ar" to={`/artist/${a.artistId}`}>{a.artistName}</Link>,
          a?.year,
          list.length > 0 && tracksLabel(list.length),
          total > 0 && formatTotalDuration(total),
        ]}
      >
        <PlayActions tracks={list} />
      </DetailHead>

      <div className="page detail-body" style={{ paddingTop: 'var(--s-6)' }}>
        {tracks.isLoading ? <SkeletonRows /> : list.length === 0
          ? <EmptyState title="В альбомі ще немає треків" />
          : <TrackList tracks={list} showAlbum={false} />}
      </div>
    </div>
  );
}
