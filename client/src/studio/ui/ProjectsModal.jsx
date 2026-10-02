import { useEffect, useState } from 'react';
import { X, Trash2, Cloud, HardDrive, Loader2, FolderOpen, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { useStudio, readLibrary } from '../store';
import { studioApi, errMsg } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { newId } from '../presets';

const when = (t) => (t ? new Date(t).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function ProjectsModal({ onClose }) {
  const user = useAuthStore((s) => s.user);
  const [local, setLocal] = useState(readLibrary);
  const [cloud, setCloud] = useState(null);
  const [busy, setBusy] = useState('');
  const project = useStudio((s) => s.project);

  const loadCloud = () => studioApi.list().then((r) => setCloud(r.data)).catch(() => setCloud([]));
  useEffect(() => { if (user) loadCloud(); }, [user]);

  const openLocal = (p) => { useStudio.getState().open(p); toast.success(`Відкрито: ${p.name}`); onClose(); };
  const delLocal = (id) => { const next = local.filter((x) => x.id !== id); try { localStorage.setItem('beatify_studio_projects', JSON.stringify(next)); } catch { /* quota */ } setLocal(next); };

  const openCloud = async (item) => {
    setBusy(item.id);
    try { const { data } = await studioApi.get(item.id); useStudio.getState().open({ ...data, id: item.id }); toast.success(`Відкрито: ${data.name}`); onClose(); }
    catch (e) { toast.error(errMsg(e, 'Не вдалося відкрити')); }
    finally { setBusy(''); }
  };
  const delCloud = async (id) => { try { await studioApi.remove(id); loadCloud(); } catch (e) { toast.error(errMsg(e, 'Не вдалося видалити')); } };

  const saveCloud = async () => {
    setBusy('save');
    try {
      const id = project.id && project.id.length >= 8 && !project.id.startsWith('prj') ? project.id : newId('c').replace(/[^a-z0-9]/gi, '').padEnd(10, 'x');
      const saved = { ...project, id };
      await studioApi.save(id, saved);
      useStudio.setState({ project: saved });
      toast.success('Збережено в акаунті');
      loadCloud();
    } catch (e) { toast.error(errMsg(e, 'Не вдалося зберегти')); }
    finally { setBusy(''); }
  };

  const importFile = (file) => {
    if (!file) return;
    file.text().then((t) => { const p = JSON.parse(t); if (p?.v !== 2) throw new Error('Невідомий формат'); useStudio.getState().open({ ...p, id: null }); toast.success('Проєкт імпортовано'); onClose(); })
      .catch((e) => toast.error(`Не вдалося імпортувати: ${e.message}`));
  };
  const exportFile = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(project)], { type: 'application/json' }));
    a.download = `${project.name || 'project'}.beatify.json`;
    a.click();
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-label="Проєкти">
        <div className="modal-head"><span className="h2">Проєкти</span><button className="ibtn" onClick={onClose} aria-label="Закрити"><X size={18} /></button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
          <div className="chips">
            <button className="btn sm" onClick={() => { useStudio.getState().saveLocal(); setLocal(readLibrary()); }}><HardDrive size={14} /> Зберегти тут</button>
            <button className="btn sm" onClick={saveCloud} disabled={!user || busy === 'save'}>{busy === 'save' ? <Loader2 size={14} className="spin" /> : <Cloud size={14} />} Зберегти в акаунті</button>
            <button className="btn sm" onClick={exportFile}>Експорт файлу</button>
            <label className="btn sm"><Upload size={14} /> Імпорт файлу<input type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files[0])} /></label>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>На цьому пристрої</div>
            {local.length === 0 ? <p className="muted" style={{ fontSize: '0.85rem' }}>Збережених проєктів ще немає.</p> : local.map((p) => (
              <div key={p.id} className="proj"><button className="proj-main" onClick={() => openLocal(p)}><FolderOpen size={16} /><span className="trunc">{p.name}</span><span className="mono muted">{p.bpm} BPM</span><span className="mono muted">{when(p.savedAt)}</span></button><button className="ibtn sm" onClick={() => delLocal(p.id)} aria-label={`Видалити ${p.name}`}><Trash2 size={14} /></button></div>
            ))}
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>В акаунті {user ? '' : '(потрібен вхід)'}</div>
            {user && cloud === null && <Loader2 size={16} className="spin muted" />}
            {user && cloud?.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>У хмарі нічого немає. Збережіть проєкт — і він буде на всіх ваших пристроях.</p>}
            {cloud?.map((p) => (
              <div key={p.id} className="proj"><button className="proj-main" onClick={() => openCloud(p)} disabled={busy === p.id}><Cloud size={16} /><span className="trunc">{p.name}</span><span className="mono muted">{p.bpm} BPM</span><span className="mono muted">{when(p.updatedAt)}</span></button><button className="ibtn sm" onClick={() => delCloud(p.id)} aria-label={`Видалити ${p.name}`}><Trash2 size={14} /></button></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
