import { Fragment } from 'react';
import { Bell, ClipboardList, FlaskConical, Globe, HeartPulse, ShieldCheck, Smartphone, Stethoscope, TriangleAlert } from 'lucide-react';
import { Card, CodeTag, StatusPill } from '../../components/ui.jsx';
import { t } from '../../lib/i18n.jsx';
import DEMO_LOGINS from '../../demo-logins.json';
import { Callout, DocHeader, DocList, DocP, DocSection, DocStep, DocTable } from './parts.jsx';

const WEB_URL = 'https://ecg.situs.id';

// Translated sentence with inline nodes: the key holds {placeholders}; `v` maps each name to a JSX node.
function Rich({ k, v }) {
  return t(k).split(/\{(\w+)\}/).map((p, i) => (i % 2 ? <Fragment key={i}>{v[p]}</Fragment> : p));
}
const B = ({ children }) => <strong className="font-semibold text-on-surface">{children}</strong>;
const I = ({ children }) => <em>{children}</em>;
const K = ({ children }) => <CodeTag>{children}</CodeTag>;

function LoginCard({ icon: Icon, title, text, login }) {
  return (
    <Card className="p-4 print:break-inside-avoid">
      <div className="mb-2 flex items-center gap-2 font-headline font-semibold text-on-surface"><Icon className="size-4 text-primary" />{title}</div>
      <p className="text-sm">{text}</p>
      {login && (
        <dl className="mt-3 space-y-1.5 text-xs">
          <div><dt className="mb-0.5 font-semibold text-on-surface">{t('Email:')}</dt><dd><K>{login.email}</K></dd></div>
          <div><dt className="mb-0.5 font-semibold text-on-surface">{t('Kata sandi:')}</dt><dd><K>{login.password}</K></dd></div>
        </dl>
      )}
    </Card>
  );
}

function Scenario({ title, setup, response }) {
  return (
    <Card className="p-4 sm:p-5 print:break-inside-avoid">
      <h3 className="mb-3 flex items-center gap-2 font-headline text-base font-semibold text-on-surface"><FlaskConical className="size-4 shrink-0 text-primary" />{title}</h3>
      <DocList>
        <li><B>{t('Pengaturan Simulator:')}</B> {setup}</li>
        <li><B>{t('Respon Sistem:')}</B> {response}</li>
      </DocList>
    </Card>
  );
}

function RhythmStrip() {
  return (
    <div className="mt-5 rounded-lg border border-outline-variant/30 bg-surface-container-low p-4 print:hidden">
      <svg viewBox="0 0 500 100" preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label={t('Visualisasi Ritme: Sinus Rhythm Normal (Hijau Toska) vs Fibrilasi Atrium Acak (Kuning)')}>
        <path d="M0,50 L50,50 L65,20 L80,80 L95,50 L150,50 L165,10 L180,90 L195,50 L230,50 L245,30 L260,70 L275,50 L320,50 L335,20 L350,80 L365,50 L400,50 L420,10 L440,90 L460,50 L500,50" fill="none" stroke="#14b8a6" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d="M0,70 L50,70 L60,65 L70,70 L80,70 L100,60 L120,80 L140,70 L160,70 L180,65 L200,70 L220,70 L240,60 L260,80 L280,70 L300,70 L320,65 L340,70 L360,70 L380,60 L400,80 L420,70 L440,70 L460,65 L480,70 L500,70" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="8,5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-2 text-xs italic text-outline">{t('Visualisasi Ritme: Sinus Rhythm Normal (Hijau Toska) vs Fibrilasi Atrium Acak (Kuning)')}</p>
    </div>
  );
}

export default function TestingGuide() {
  const rows = [
    [t('Akurasi Diagnostik'), <StatusPill tone="active">99.32%</StatusPill>, t('17.205 dari 17.323 segmen uji independen tepat')],
    [t('Sensitivitas (Recall AFib)'), <StatusPill tone="active">98.11%</StatusPill>, t('Kemampuan mendeteksi serangan fibrilasi sejati')],
    [t('Spesifisitas (Normal Sinus)'), <StatusPill tone="active">99.61%</StatusPill>, t('Kemampuan membedakan irama normal tanpa salah tuduh')],
    [t('Ambang Batas Alarm (Threshold)'), <StatusPill tone="active">≥ 85% (0.85)</StatusPill>, t('Menyaring motion artifacts & bising kontraksi otot')],
    [t('Clinical Regularity Guard'), <StatusPill tone="active">CV_RR &lt; 8%</StatusPill>, t('Mencegah false alarm saat takikardia normal (90–120+ BPM)')],
    [t('Sampling Rate Pemrosesan'), <K>{t('128 Hz (1280 pts / 10s)')}</K>, t('Resample otomatis dari 250 Hz hardware ESP32')],
  ];
  const trouble = [
    [t('Bluetooth tidak terdeteksi di HP'), t('Izin Lokasi/Bluetooth belum aktif'), t('Buka Pengaturan HP > Aplikasi EKG > Berikan izin penuh untuk Bluetooth & Lokasi (GPS).')],
    [t('Grafik di Web tidak bergerak'), t('Sesi belum dimulai di HP'), t('Pastikan pasien telah menekan tombol "Start Recording" di aplikasi Android.')],
    [t('Laporan AI belum muncul'), t('Analisis masih berlangsung'), t('Buka halaman Laporan AI, sistem background job memproses jutaan titik data dalam hitungan detik.')],
  ];

  return (
    <div>
      <DocHeader
        eyebrow="Bioengineering & Applied Physics Center (BAPC)"
        title={t('Buku Panduan Pengujian & Validasi')}
        subtitle={t('Sistem Telemedicine Holter EKG Cerdas')}
        badge="TRL 7 Validated"
      >
        <p className="mt-0.5 font-mono text-[11px] text-outline">Medical Instrumentation & AI Research Laboratory</p>
        <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
          <Rich k="Integrasi {iomt} & {dl} Berbasis {split} untuk Deteksi Real-Time {afib}" v={{
            iomt: <I>Internet of Medical Things (IoMT)</I>,
            dl: <I>Deep Learning CNN-LSTM</I>,
            split: <I>Subject-Level Split</I>,
            afib: <B>Atrial Fibrillation (AFib)</B>,
          }} />
        </p>
        <RhythmStrip />
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-outline-variant/30 pt-4 text-sm text-on-surface-variant">
          <span className="font-semibold text-on-surface">{t('Dokumen Standar Pengujian & Kalibrasi Alat Telemedicine')}</span>
          <span className="text-xs text-outline">{t('Disiapkan untuk Penguji Klinis, Dokter Spesialis Jantung, & Tim Penguji Kemenkes RI')}</span>
        </div>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-outline-variant/40 bg-surface-container-low px-4 py-1.5 text-sm font-semibold">
          <Globe className="size-4 text-primary" />{t('Web Dashboard:')}
          <a href={WEB_URL} target="_blank" rel="noreferrer" className="text-primary hover:text-primary-container">{WEB_URL}</a>
        </div>
      </DocHeader>

      <div className="mb-4">
        <Callout tone="info" title={t('Ringkasan Sistem:')}>
          <Rich k="Ekosistem Telemedicine ini terdiri dari 3 pilar: (1) Hardware Holter EKG IoT (ESP32-S3 BLE), (2) Aplikasi Android Pasien (BLE Gateway), dan (3) Web Dashboard Terpusat dengan Mesin AI CNN-LSTM yang memiliki akurasi pengujian klinis {acc} dan ambang batas sensitivitas {thr}." v={{ acc: <B>99.32%</B>, thr: <B>≥ 85%</B> }} />
        </Callout>
      </div>

      <DocSection title={t('1. Akses Portal & Kredensial Uji Coba (Demo)')}>
        <DocP>{t('Sistem telah di-deploy penuh di server cloud terenkripsi SSL HTTPS. Penguji dapat mengakses seluruh fitur tanpa perlu menginstal backend lokal.')}</DocP>
        <DocList>
          <li><B>{t('URL Web Dashboard:')}</B> <a href={WEB_URL} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:text-primary-container">{WEB_URL}</a></li>
        </DocList>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LoginCard icon={ShieldCheck} title={t('Akun Admin')} text={t('Akses Web Browser untuk mengelola master data, pengguna, dan seluruh sesi pemeriksaan.')} login={DEMO_LOGINS.admin} />
          <LoginCard icon={Stethoscope} title={t('Akun Dokter')} text={t('Akses Web Browser untuk live monitor EKG, review episode AFib, input catatan medis, & cetak PDF.')} login={DEMO_LOGINS.doctor} />
          <LoginCard icon={ClipboardList} title={t('Akun Perawat')} text={t('Akses Web / HP untuk daftarkan pasien, buat sesi Holter baru, & terbitkan QR Code pairing.')} login={DEMO_LOGINS.nurse} />
          <LoginCard icon={Smartphone} title={t('Akun Pasien')} text={t('Pasien hanya memakai aplikasi Android (scan QR, rekam jantung dari rumah, & transmisi BLE ke cloud) dan tidak memiliki login web.')} />
        </div>
      </DocSection>

      <DocSection title={t('2. Spesifikasi Teknis & Kinerja AI (CNN-LSTM)')}>
        <DocP>
          <Rich k="Model AI telah divalidasi dengan protokol ketat {split} pada dataset klinis multi-jam PhysioNet (LTAFDB & SHDB-AF):" v={{ split: <B>Subject-Level Split (Zero Data Leakage)</B> }} />
        </DocP>
        <DocTable head={[t('Metrik Klinis'), t('Hasil Pengujian'), t('Spesifikasi & Standar')]} rows={rows} />
      </DocSection>

      <DocSection title={t('3. Alur Pengoperasian Sistem (End-to-End Workflow)')}>
        <ol className="space-y-5">
          <DocStep n={1} title={t('Inisiasi Sesi oleh Perawat (Web Dashboard):')}>
            <Rich k="Perawat login ke web dashboard, memilih pasien, menentukan durasi rekaman (contoh: 5 menit / 24 jam) serta interval sinkronisasi, lalu menekan tombol {btn}." v={{ btn: <I>"Buat Sesi & Terbitkan QR"</I> }} />
          </DocStep>
          <DocStep n={2} title={t('Scan QR Code & Koneksi Bluetooth (Aplikasi Android Pasien):')}>
            <Rich k="Pasien membuka aplikasi Android, login, lalu mengarahkan kamera HP untuk memindai QR Code. Aplikasi akan otomatis mengonfigurasi ID sesi dan mencari perangkat BLE {dev} (atau perangkat dengan nama yang mengandung {name})." v={{ dev: <K>CardioGuardian-S3</K>, name: <K>holterekg</K> }} />
          </DocStep>
          <DocStep n={3} title={t('Transmisi Data Real-Time & Latar Belakang (Foreground Service):')}>
            {t('Data sinyal EKG dan BPM dikirim dari HP Android ke Cloud Server secara periodik. Aplikasi Android dilengkapi Android Foreground Service sehingga transmisi data tetap berjalan lancar meski layar HP dimatikan atau pasien membuka aplikasi lain.')}
          </DocStep>
          <DocStep n={4} title={t('Monitoring & Alarm Real-Time Dokter (Web Dashboard):')}>
            <Rich k="Dokter membuka menu {menu}. Grafik gelombang EKG bergerak live dengan visualisasi interaktif. Jika AI mendeteksi AFib (≥ 85%), bel lonceng {bell} akan berbunyi dan memunculkan badge peringatan darurat seketika dalam 10 detik." v={{ menu: <I>"Lihat EKG / Monitor"</I>, bell: <Bell className="inline size-4 align-text-bottom text-error" aria-label={t('lonceng')} /> }} />
          </DocStep>
          <DocStep n={5} title={t('Pemeriksaan Anotasi Grafik (Soft AFib Highlighting) & Catatan Dokter:')}>
            <Rich k="Pada viewer grafik EKG, setiap window 10 detik yang terdeteksi AFib akan otomatis {shade} lengkap dengan label keyakinan (contoh: {label}). Dokter dapat mengetikkan catatan diagnosis pada kolom {notes} dan menyimpannya ke database." v={{
              shade: <B>{t('diarsir dengan warna merah transparan lembut')} (<K>rgba(239, 68, 68, 0.12)</K>)</B>,
              label: <K><TriangleAlert className="size-3.5" />AFib 99.8%</K>,
              notes: <I>"Catatan Dokter"</I>,
            }} />
          </DocStep>
          <DocStep n={6} title={t('Laporan AI Lengkap & Ekspor PDF:')}>
            <Rich k="Setelah sesi selesai, klik tombol {btn} untuk membuka resume komprehensif (durasi total, persentase AFib, min/avg/max HR, dan tabel episode rincian waktu). Laporan dapat langsung dicetak atau diunduh sebagai PDF resmi." v={{ btn: <I>"Laporan AI"</I> }} />
          </DocStep>
        </ol>
      </DocSection>

      <DocSection title={t('4. Prosedur Pengujian Simulator EKG (Kalibrator / Evaluator)')}>
        <DocP>
          <Rich k="Bagi tim penguji, validasi fungsional dapat dilakukan secara cepat dan presisi menggunakan {hw} atau {sw} dengan 4 skenario standar:" v={{ hw: <B>Hardware Simulator EKG</B>, sw: <B>ESP32 Software Generator</B> }} />
        </DocP>
        <div className="space-y-3">
          <Scenario
            title={t('Skenario 1: Normal Sinus Rhythm (60–80 BPM)')}
            setup={<Rich k="Pilih mode {mode} pada 70–80 BPM." v={{ mode: <K>Normal Sinus Rhythm (NSR)</K> }} />}
            response={<Rich k="Grafik EKG bersih, angka BPM stabil, status berwarna {green}, lonceng notifikasi tenang tanpa alarm palsu." v={{ green: <B>{t('Hijau (Normal)')}</B> }} />}
          />
          <Scenario
            title={t('Skenario 2: Sinus Tachycardia / Detak Cepat Normal (90–120+ BPM)')}
            setup={<Rich k="Naikkan BPM ke {bpm} dalam mode Normal Sinus." v={{ bpm: <K>100 - 120 BPM</K> }} />}
            response={<Rich k="Meskipun gelombang P tampak menyatu dengan gelombang T akibat kecepatan tinggi, fitur {guard} memastikan sistem mengenali keteraturan interval R-R ({cv}), sehingga {nofalse}." v={{ guard: <I>Clinical Regularity Guard</I>, cv: <K>CV &lt; 8%</K>, nofalse: <B>{t('tidak terjadi alarm AFib palsu')}</B> }} />}
          />
          <Scenario
            title={t('Skenario 3: Pola Atrial Fibrillation (AFib)')}
            setup={<Rich k="Ubah mode simulator ke {mode}." v={{ mode: <K>Atrial Fibrillation (AFib / AF)</K> }} />}
            response={<Rich k="Dalam waktu {max}, alarm lonceng {bell} menyala merah, event tercatat di daftar notifikasi dengan keyakinan ≥ 85%, dan segmen grafik otomatis terarsir merah transparan." v={{ max: <B>{t('maksimal 10 detik')}</B>, bell: <Bell className="inline size-4 align-text-bottom text-error" aria-label={t('lonceng')} /> }} />}
          />
          <Scenario
            title={t('Skenario 4: Elektroda Terlepas (Lead-Off / Flatline)')}
            setup={t('Lepaskan salah satu kabel elektroda atau matikan sinyal input.')}
            response={<Rich k="Nilai amplitudo menjadi datar. Sistem SQA ({sqa}) membatalkan analisis AI dan menampilkan status {status} untuk mencegah kesalahan diagnosis." v={{ sqa: <I>Signal Quality Assessment</I>, status: <I>"Sinyal Terlalu Datar / Elektroda Lepas"</I> }} />}
          />
        </div>
      </DocSection>

      <DocSection title={t('5. Panduan Pemecahan Masalah (Troubleshooting)')}>
        <DocTable head={[t('Gejala Masalah'), t('Penyebab Umum'), t('Solusi Tindakan')]} rows={trouble} />
        <p className="flex items-center gap-2 text-xs text-outline print:hidden"><HeartPulse className="size-4" />{t('Gunakan tombol Cetak Dokumen di bagian atas untuk menyimpan buku panduan ini sebagai PDF.')}</p>
      </DocSection>
    </div>
  );
}
