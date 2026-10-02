import DownloadTab from './admin/DownloadTab';

/** Import by link — for admins and for users the admin gave the "import" permission. */
export default function ImportPage() {
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="display">Імпорт</h1>
        <p className="page-lede">Вставте посилання на трек чи плейлист з YouTube, SoundCloud або Spotify — композиції з’являться в каталозі для всіх слухачів.</p>
      </header>
      <DownloadTab />
    </div>
  );
}
