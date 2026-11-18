import { useState } from 'react';
import { Check, Plus, Stethoscope, Trash2, UserPlus, UserSearch } from 'lucide-react';
import {
  Avatar, Button, Card, CodeTag, ConfirmDialog, EmptyState, Input, LoadingBlock, Modal, PageHeader, Pagination,
  SearchFilterBar, SectionCard, Select, StatusPill, Textarea, Toggle, useToast,
} from './ui.jsx';

export default { title: 'Komponen/UI', parameters: { layout: 'padded' } };

export const Tombol = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button icon={Check}>Simpan</Button>
      <Button variant="tertiary" icon={Check}>Mulai Sesi</Button>
      <Button variant="secondary">Batal</Button>
      <Button variant="ghost">Reset</Button>
      <Button variant="danger" icon={Trash2}>Hapus Permanen</Button>
      <Button loading>Memproses</Button>
      <Button icon={Plus} disabled>Nonaktif</Button>
    </div>
  ),
};

export const StatusDanAvatar = {
  name: 'Status & Avatar',
  render: () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <StatusPill tone="active">Aktif</StatusPill><StatusPill tone="leave">Cuti</StatusPill><StatusPill tone="inactive">Nonaktif</StatusPill>
        <StatusPill tone="running">Sedang Berjalan</StatusPill><StatusPill tone="completed">Selesai</StatusPill><StatusPill tone="archived">Diarsipkan</StatusPill>
        <StatusPill tone="error">Gagal</StatusPill>
      </div>
      <div className="flex gap-2">
        {['dr. Andi Pratama, Sp.JP (K)', 'dr. Rina Kartika', 'Ns. Dewi Wulandari', 'Budi Santoso', 'Siti Aminah'].map((n, i) => <Avatar key={n} name={n} index={i} />)}
        <Avatar name="dr. Maya Anggraini" muted />
      </div>
      <div className="flex gap-2"><CodeTag>#DOC-042-ANDI</CodeTag><CodeTag>#a7f3b9c</CodeTag></div>
    </div>
  ),
};

export const HeaderHalaman = {
  name: 'Header Halaman',
  render: () => (
    <div className="space-y-2">
      <PageHeader title="Daftar Dokter" badge="12 Terdaftar" actions={<Button icon={UserPlus}>Tambah</Button>} />
      <PageHeader back={{ to: '/', label: 'Kembali ke Daftar Pasien' }} code={<CodeTag>#RM-2026-0982</CodeTag>} actions={<Button icon={Check}>Simpan Perubahan</Button>} />
    </div>
  ),
};

export const IsianFormulir = {
  name: 'Isian Formulir',
  render: () => {
    const [on, setOn] = useState(true);
    return (
      <SectionCard icon={Stethoscope} title="Informasi Pribadi" subtitle="Identitas dan legalitas praktik">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Nama Lengkap & Gelar" required defaultValue="dr. Andi Pratama, Sp.JP (K)" />
          <Input label="NIK" required defaultValue="31710419820" error="Harus 16 digit angka" mono />
          <Select label="Spesialisasi" required options={[{ value: 'a', label: 'Aritmia & Elektrofisiologi Klinis (PERKI)' }]} />
          <Input label="Frekuensi Sampling & Sadapan" value="Lead II (250 Hz - Standar AAMI/AHA)" disabled mono />
          <Textarea label="Catatan" className="sm:col-span-2" placeholder="Tambahkan instruksi…" />
          <Toggle checked={on} onChange={setOn} label={on ? 'Aktif' : 'Nonaktif'} />
        </div>
      </SectionCard>
    );
  },
};

export const PencarianDanFilter = {
  name: 'Pencarian & Filter',
  render: () => {
    const [search, setSearch] = useState('');
    const [value, setValue] = useState({ status: 'active', sub: 'aritmia' });
    return (
      <SearchFilterBar search={search} onSearch={setSearch} placeholder="Cari nama dokter, spesialisasi..." value={value} onChange={setValue}
        filters={[
          { key: 'status', label: 'Status Praktik', chip: 'Status', options: [{ value: 'active', label: 'Aktif' }, { value: 'leave', label: 'Cuti' }, { value: 'inactive', label: 'Nonaktif' }] },
          { key: 'sub', label: 'Subspesialisasi', chip: 'Subspesialis', options: [{ value: 'aritmia', label: 'Aritmia & Elektrofisiologi' }, { value: 'pediatrik', label: 'Pediatrik' }] },
        ]} />
    );
  },
};

export const DialogDanNotifikasi = {
  name: 'Dialog & Notifikasi',
  render: () => {
    const [modal, setModal] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const toast = useToast();
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setModal(true)}>Buka Dialog</Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>Konfirmasi Hapus</Button>
        <Button onClick={() => toast({ title: 'Berhasil Dihapus', text: 'Sesi pemeriksaan telah dihapus secara permanen.' })}>Toast Sukses</Button>
        <Button variant="secondary" onClick={() => toast({ tone: 'error', title: 'Gagal menyimpan', text: 'NIK sudah dipakai.' })}>Toast Gagal</Button>
        <Modal open={modal} onClose={() => setModal(false)} title="Tambah Tenaga Perawat" icon={UserPlus}
          footer={<><Button variant="secondary" onClick={() => setModal(false)}>Batal</Button><Button icon={Check}>Simpan Data Perawat</Button></>}>
          <Input label="Nama Lengkap beserta Gelar" required placeholder="Contoh: Ns. Anita Rahmawati, S.Kep" />
        </Modal>
        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} confirmLabel="Hapus Permanen"
          title="Hapus sesi pemeriksaan?" text="1 sesi beserta rekaman EKG, telemetri, catatan, dan hasil analisis AI akan dihapus permanen." />
      </div>
    );
  },
};

export const KeadaanKosong = {
  name: 'Keadaan Kosong & Memuat',
  render: () => (
    <div className="grid gap-4 md:grid-cols-2">
      <Card><EmptyState icon={UserSearch} title="Pasien Tidak Ditemukan" text="Tidak ada data pasien yang cocok dengan kata kunci atau filter saat ini." action={<button className="text-sm font-semibold text-primary">Kembalikan ke semua pasien</button>} /></Card>
      <Card><LoadingBlock /><Pagination page={2} limit={20} total={58} onPage={() => {}} /></Card>
    </div>
  ),
};
