import { Archive, CircleCheck, Trash2 } from 'lucide-react';
import { EcgCanvas, MiniEcg } from './EcgStrip.jsx';
import BulkBar from './BulkBar.jsx';
import { TONE_COLOR } from '../lib/format.js';

export default { title: 'Komponen/EKG', parameters: { layout: 'padded' } };

const WAVES = [[-0.2, 0.025, 150], [-0.035, 0.01, -120], [0, 0.011, 1150], [0.035, 0.012, -280], [0.26, 0.045, 320]];
function beats(bpm, seconds = 10) {
  const hz = 250; const rr = 60 / bpm; const samples = [];
  for (let i = 0; i < seconds * hz; i++) {
    const t = i / hz; const bt = t - (Math.floor(t / rr) + 0.5) * rr;
    samples.push(Math.round(WAVES.reduce((v, [mu, s, a]) => v + a * Math.exp(-((bt - mu) ** 2) / (2 * s * s)), 0)));
  }
  return [{ started_at: 0, samples }];
}

export const StripBesar = {
  name: 'Strip Lead II (25 mm/s, 10 mm/mV)',
  render: () => (
    <div className="rounded-xl bg-[#0b1c30] p-2">
      <EcgCanvas chunks={beats(76)} hz={250} from={0} to={10000} grid height={240} color={TONE_COLOR.ok} />
    </div>
  ),
};

export const StripMiniPerIrama = {
  name: 'Strip mini (daftar sesi)',
  render: () => (
    <div className="grid max-w-md gap-3">
      <MiniEcg code="a7f3b9c" live bpm={76} rhythm="Normal Sinus" tone="ok" />
      <MiniEcg code="7834144" live bpm={54} rhythm="Sinus Brady" tone="slow" />
      <MiniEcg code="1a7f421" live bpm={108} rhythm="Elevated" tone="warn" />
      <MiniEcg code="e78e7ce" live tone="idle" />
    </div>
  ),
};

export const BilahAksiMassal = {
  name: 'Bilah aksi massal',
  render: () => (
    <div className="h-40">
      <BulkBar count={1} onClear={() => {}} actions={[
        { key: 'c', icon: CircleCheck, label: 'Selesai', onClick: () => {} },
        { key: 'a', icon: Archive, label: 'Arsip', onClick: () => {} },
        { key: 'd', icon: Trash2, danger: true, title: 'Hapus', onClick: () => {} },
      ]} />
    </div>
  ),
};
