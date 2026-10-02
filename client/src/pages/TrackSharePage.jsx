import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tracksApi, discoverApi } from '../api';
import { coverUrl } from '../lib/config';
import { formatTime } from '../lib/format';
import { useCoverTint } from '../hooks/useAccent';
import Cover from '../components/ui/Cover';
import DetailHead, { PlayActions } from '../components/DetailHead';
import TrackList from '../components/TrackRow';
import { Section, EmptyState, SkeletonRows } from '../components/Section';

// Landing page for a shared link: /track/42
export default function TrackSharePage() {
  const { id } = useParams();
  const track = useQuery({ queryKey: ['track', id], queryFn: () => tracksApi.getById(id).then((r) => r.data), retry: false });
  const similar = useQuery({ queryKey: ['similar', id], queryFn: () => discoverApi.similar(id, 10).then((r) => r.data), enabled: track.isSuccess });
  const t = track.data;
  const tint = useCoverTint(coverUrl(t));

  if (track.isError) return <div className="page"><EmptyState title="Трек не знайдено" text="Можливо, його вже прибрали з каталогу." action={<Link className="btn" to="/">На головну</Link>} /></div>;

  return (
    <div className="tint" style={tint}>
      <DetailHead
        tint={tint}
        art={<Cover track={t} title={t?.title} lazy={false} />}
        title={t?.title ?? ' '}
        meta={[t && <Link key="a" to={`/artist/${t.artistId}`}>{t.artistName}</Link>, t?.albumTitle && <Link key="al" to={`/album/${t.albumId}`}>{t.albumTitle}</Link>, t && formatTime(t.duration)]}
      >
        {t && <PlayActions tracks={[t]} />}
      </DetailHead>
      <div className="page" style={{ paddingTop: 'var(--s-6)' }}>
        <Section title="Схожі треки">
          {similar.isLoading ? <SkeletonRows n={4} /> : <TrackList tracks={similar.data ?? []} />}
        </Section>
      </div>
    </div>
  );
}
