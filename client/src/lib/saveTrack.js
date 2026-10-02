import toast from 'react-hot-toast';
import { externalSearchApi, errMsg } from '../api';

/** Admin, or a user the admin switched "import" on for. */
export const canSaveToLibrary = (user) => !!user && (user.role === 'admin' || !!user.canImport);

const urlOf = (track) => track.externalUrl || track.webpage_url || '';

// remembered for the session so a row does not offer to save a track twice
const saved = new Set();
export const isSaved = (track) => saved.has(urlOf(track));

/** Download an external (YouTube / SoundCloud) track onto the server. Resolves true on success. */
export async function saveExternalTrack(track) {
  const url = urlOf(track);
  if (!url) return false;
  const t = toast.loading('Зберігаю на сервер… це може зайняти до хвилини');
  try {
    await externalSearchApi.save({ url, title: track.title, artistName: track.artistName, coverUrl: track.thumbnail });
    saved.add(url);
    toast.success('Збережено в бібліотеку', { id: t });
    return true;
  } catch (e) {
    toast.error(errMsg(e, 'Не вдалося зберегти'), { id: t });
    return false;
  }
}
