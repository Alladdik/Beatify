import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { discoverApi, errMsg } from '../api';
import { fileUrl } from '../lib/config';
import { formatTotalDuration, tracksLabel } from '../lib/format';
import { useCoverTint } from '../hooks/useAccent';
import { Collage } from '../components/ui/Cover';
import DetailHead, { PlayActions } from '../components/DetailHead';
import TrackList from '../components/TrackRow';
import { SkeletonRows, EmptyState } from '../components/Section';

export default function MixPage() {
  const { id } = useParams();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['mix', id], queryFn: () => discoverApi.mix(id).then((r) => r.data), retry: false });
  const tracks = data?.tracks ?? [];
  const covers = useMemo(() => [...new Set(tracks.map((t) => t.coverPath).filter(Boolean))].slice(0, 4).map((c) => fileUrl('covers', c)), [tracks]);
  const tint = useCoverTint(covers[0]);
  const total = tracks.reduce((s, t) => s + (t.duration || 0), 0);

  if (isError) return <div className="page"><EmptyState title="Мікс поки порожній" text={errMsg(error, 'Послухайте більше музики — і він наповниться.')} action={<Link className="btn" to="/">На головну</Link>} /></div>;

  return (
    <div className="tint" style={tint}>
      <DetailHead tint={tint} art={<Collage covers={covers} title={data?.title} />} title={data?.title ?? ' '} meta={[data?.subtitle, tracks.length > 0 && tracksLabel(tracks.length), total > 0 && formatTotalDuration(total)]}>
        <PlayActions tracks={tracks} />
      </DetailHead>
      <div className="page" style={{ paddingTop: 'var(--s-6)' }}>
        {isLoading ? <SkeletonRows /> : <TrackList tracks={tracks} />}
      </div>
    </div>
  );
}
