import { ClipboardList, ShieldCheck, FileSignature, Scale, Grid3x3, TableProperties, Activity, Stamp } from 'lucide-react';
import { Card, StatusPill, CodeTag, cx } from '../../components/ui.jsx';
import { t } from '../../lib/i18n.jsx';
import { DocHeader, DocSection, DocH3, DocP, DocList, Callout, DocTable } from './parts.jsx';

// Risk Management File (ISO 14971:2019) for the detakita Holter ECG system.
// Convention in this file: every translatable literal is a double-quoted JS string; markup attributes use single quotes.

// Rich text: plain strings go through t(); {b: "..."} is bold, {i: "..."} is italic. Edge whitespace and leading/trailing
// punctuation ( , . : ; ) at the start, ( at the end ) are kept outside the key; punctuation-only pieces are not translated.
function rich(...parts) {
  return parts.map((p, k) => {
    const raw = typeof p === 'string' ? p : (p.b ?? p.i);
    const lead = raw.match(/^[\s,.:;)]*/)[0];
    const trail = raw.match(/[\s(]*$/)[0];
    const core = raw.slice(lead.length, raw.length - trail.length);
    const txt = core ? t(core) : '';
    let node = txt;
    if (typeof p !== 'string') node = p.b !== undefined ? <strong className='font-semibold text-on-surface'>{txt}</strong> : <em>{txt}</em>;
    return <span key={k}>{lead}{node}{trail}</span>;
  });
}

const CHIP = {
  low: 'bg-[#e3f8f1] text-tertiary',
  mid: 'bg-[#fff1df] text-[#9a5a12]',
  high: 'bg-error-container text-on-error-container',
};
function Chip({ tone, children, className }) {
  return <span className={cx('inline-block rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-bold leading-snug', CHIP[tone], className)}>{children}</span>;
}
const Score = ({ tone, s, p, r }) => <Chip tone={tone}>S{s} × P{p}<br />= R{r}</Chip>;

// Risk-matrix cell colouring: acc = broadly acceptable, alarp, unacc = unacceptable.
const CELL = {
  acc: 'bg-[#e3f8f1] text-tertiary',
  alarp: 'bg-[#fff1df] text-[#9a5a12]',
  unacc: 'bg-error-container text-on-error-container',
};

// Hazard rows: [id, mode, cause, harm, [S,P,R,tone], mitigation items (arrays of rich parts), [S,P,R], status text]
function categories() {
  return [
    {
      title: "KATEGORI 1: KESELAMATAN LISTRIK, BIOKOMPATIBILITAS & PASIEN (IEC 60601-1 & IEC 60601-2-47)",
      rows: [
        ['HZ-EL-01', "Arus Bocor Pasien (Patient Leakage Current)", "Koneksi kabel charger saat alat dipakai di dada, atau kerusakan isolasi front-end AD8232.", "Sengatan listrik (Microshock) ke miokardium, memicu fibrilasi ventrikel fatal.", [5, 2, 10, 'high'], [
          [{ b: "Interlock Desain:" }, " Alat menggunakan baterai Li-Po mandiri 3.7V tanpa kontak port logam ke tubuh."],
          [{ b: "Larangan Charger:" }, " Port pengisian daya didesain tertutup rapat di balik casing silikon khusus; alat otomatis mati jika kabel charger dicolok."],
          ["Pengujian arus bocor pasien < 10 μA sesuai standar IEC 60601-1 Tipe BF terverifikasi di BPFK."],
        ], [5, 1, 5], "DITERIMA (ALARP)"],
        ['HZ-EL-02', "Thermal Overheating / Korsleting Baterai Li-Po", "Transmisi radio BLE kontinu daya tinggi, beban panas internal, atau baterai cacat manufaktur.", "Luka bakar termal derajat 1-2 pada kulit dada pasien; risiko kebakaran kecil.", [4, 3, 12, 'high'], [
          ["Baterai Li-Po dilengkapi sirkuit proteksi ganda (PCM) terhadap over-current, over-charge, dan over-discharge."],
          ["Penggunaan ESP32-H2 berdaya sangat rendah (BLE 5.0 Low Energy, Tx Power 0 dBm, suhu casing operasional stabil < 37.5°C)."],
          ["Casing berbahan plastik medis biocompatible ABS grade medis dengan rongga isolator termal."],
        ], [4, 1, 4], "DITERIMA"],
        ['HZ-EL-03', "Reaksi Alergi / Dermatitis Kontak Elektroda", "Zat kimia gel perekat elektroda tidak kompatibel atau dipakai melampaui batas waktu 24 jam.", "Eritema, gatal parah, lecet, atau infeksi sekunder pada kulit pasien.", [2, 4, 8, 'mid'], [
          ["Rekomendasi wajib penggunaan elektroda standar berizin edar Kemenkes RI berbahan Ag/AgCl bersertifikasi biokompatibilitas ISO 10993-5 (sitotoksisitas) & ISO 10993-10 (iritasi)."],
          ["Edukasi di Buku Panduan Pengguna: membersihkan kulit dengan alkohol swab dan rotasi posisi elektroda tiap 24 jam."],
        ], [2, 2, 4], "DITERIMA"],
        ['HZ-EL-04', "Elektroda Lepas (Leads-Off Artifact)", "Pasien berkeringat banyak, gesekan pakaian, atau pergerakan saat tidur.", "Sinyal EKG menjadi flatline (garis lurus), berisiko salah didiagnosis sebagai asistol / henti jantung.", [4, 4, 16, 'high'], [
          [{ b: "Hardware Leads-Off Detection:" }, " AD8232 pin LO+ dan LO- dipantau secara real-time oleh interrupt ESP32."],
          ["Jika elektroda lepas, sinyal seketika ditandai status khusus (NAN), buzzer berbunyi chirp halus, dan aplikasi menampilkan panduan visual ", { i: "\"Elektroda Lepas - Pasang Kembali\"" }, "."],
          ["AI Cloud menolak menganalisis segmen flatline agar tidak terjadi misdiagnosis asistol palsu."],
        ], [4, 1, 4], "DITERIMA"],
      ],
    },
    {
      title: "KATEGORI 2: PERANGKAT KERAS, SENSOR ADC & KETAHANAN MEKANIS (IEC 60601-1-11)",
      rows: [
        ['HZ-HW-01', "Saturasi Sinyal Akibat Motion Artifact", "Pasien berjalan cepat, melompat, atau batuk keras yang memicu pergeseran tegangan antarmuka elektroda.", "Kompleks QRS tenggelam dalam derau gerakan, kehilangan data diagnostik sementara.", [3, 4, 12, 'mid'], [
          [{ b: "ADS1115 Dynamic Headroom:" }, " ADC 16-bit beresolusi 0.125 mV/LSB memberikan rentang dinamis ±2.048V, mencegah clipping sinyal."],
          ["Filter DSP digital Two-Stage Median Detrending mengupas motion baseline wander secara adaptif tanpa memotong puncak QRS."],
        ], [3, 2, 6], "DITERIMA (ALARP)"],
        ['HZ-HW-02', "Masuknya Keringat / Cairan (Liquid Ingress)", "Keringat berlebih pasien saat beraktivitas fisik atau cipratan air saat mencuci tangan.", "Kerusakan korosi pada PCB, korsleting komponen analog front-end.", [3, 3, 9, 'mid'], [
          ["Desain enclosure casing tertutup dengan rating proteksi ingress ", { b: "IP22" }, " (tahan tetesan air vertikal hingga kemiringan 15 derajat)."],
          ["Pelapisan ", { i: "Conformal Coating" }, " pada papan sirkuit elektronik PCB untuk menolak kelembapan tinggi."],
          ["Peringatan tegas pada stiker alat: ", { i: "\"Dilarang dibawa mandi atau berenang\"" }, "."],
        ], [3, 1, 3], "DITERIMA"],
        ['HZ-HW-03', "Kerusakan Fisik Akibat Alat Terjatuh (Drop Test)", "Pasien tidak sengaja menjatuhkan modul Holter ke lantai dari ketinggian 1 meter.", "Casing retak, baterai lepas, atau konektor snap kabel putus.", [3, 3, 9, 'mid'], [
          ["Uji ketahanan jatuh mekanis (Mechanical Drop Test) 1 meter ke permukaan kayu keras sesuai standar IEC 60601-1-11 lulus tanpa retakan."],
          ["Dilengkapi pouch kantong gantung elastis dengan klip sabuk dada yang kokoh agar alat tidak mudah tergelincir."],
        ], [3, 1, 3], "DITERIMA"],
      ],
    },
    {
      title: "KATEGORI 3: TELEMETRI NIRKABEL, JARINGAN & KOMUNIKASI DATA IOMT",
      rows: [
        ['HZ-NET-01', "Koneksi Bluetooth (BLE) Terputus", "Pasien meninggalkan smartphone di ruangan lain (> 10 meter) atau gangguan interferensi radio.", "Data EKG tidak terkirim real-time ke aplikasi ponsel pasien.", [3, 4, 12, 'mid'], [
          [{ b: "Auto-Reconnection Algorithm:" }, " Aplikasi Android terus menjalankan background Bluetooth scanning dan otomatis menyambung kembali dalam < 3 detik begitu pasien mendekat."],
          ["Indikator suara buzzer beep 2x memberi tahu jika sambungan terhubung kembali."],
          ["Riwayat waktu putus tercatat rapi di log sesi rumah sakit."],
        ], [3, 2, 6], "DITERIMA (ALARP)"],
        ['HZ-NET-02', "Kehilangan Paket Data (Packet Loss)", "Kepadatan spektrum frekuensi 2.4 GHz di rumah pasien (router WiFi, microwave).", "Grafik EKG tampak terputus-putus atau kehilangan pulsa gelombang mikro.", [3, 3, 9, 'mid'], [
          ["Firmware mengelompokkan sampel EKG ke dalam paket transmisi batch (BLE Batching) dengan nomor urut sekuensial."],
          ["Perekaman lokal di ponsel Android menggunakan database SQLite lokal (Offline-First Storage) sebelum diunggah ke cloud, menjamin rekaman 24 jam utuh."],
        ], [3, 1, 3], "DITERIMA"],
        ['HZ-NET-03', "Kehabisan Memori Buffer (FreeRTOS Queue Overflow)", "Proses transmisi BLE tertahan sedangkan sampel ADC terus masuk pada 250 Hz (interval 4 ms).", "Mikrokontroler ESP32 mengalami panic reset atau kehilangan frame data terkini.", [4, 3, 12, 'high'], [
          ["Alokasi antrean FreeRTOS berukuran 400 slot SensorFrame (~1.6 detik buffer cadangan)."],
          ["Pemisahan arsitektur Dual-Task: Task Sensor DSP memiliki prioritas tinggi (Priority 3) yang terpisah dari Task BLE (Priority 2)."],
          ["Mekanisme drop frame terkontrol dengan peringatan status jika koneksi BLE macet lebih dari 2 detik."],
        ], [4, 1, 4], "DITERIMA"],
      ],
    },
    {
      title: "KATEGORI 4: SOFTWARE MEDIS, DSP FILTER & KECERDASAN BUATAN (AI SaMD - IEC 62304)",
      rows: [
        ['HZ-SW-01', "False Negative Deteksi Atrial Fibrilasi (AFib Lolos)", "Episode AFib paroksismal berdurasi sangat singkat (< 15 detik) atau amplitudo fibrilasi sangat halus.", "Pasien tidak terdiagnosis menderita AFib; risiko stroke kardioemboli tidak tertangani.", [5, 3, 15, 'high'], [
          ["Arsitektur Hybrid Deep Learning (CNN-LSTM) dilatih menggunakan dataset PhysioNet/MIT-BIH dengan sensitivitas ≥ 98.7%."],
          [{ b: "Prinsip Diagnostik Klinis:" }, " Laporan AI bersifat ", { i: "Clinical Decision Support" }, " (pendukung keputusan dokter). Seluruh rekaman 24 jam tetap dapat dilihat langsung oleh dokter spesialis (DPJP wajib meninjau gelombang raw)."],
          ["Labeling pada laporan cetak PDF: ", { i: "\"Laporan AI ini adalah alat bantu skrining, verifikasi akhir wajib dilakukan oleh DPJP\"" }, "."],
        ], [5, 1, 5], "DITERIMA (ALARP)"],
        ['HZ-SW-02', "False Positive Deteksi AFib (Alarm Palsu)", "Sinus aritmia pernapasan normal, takikardia sinus, atau tremor otot (EMG noise) yang meniru fibrilasi.", "Kepanikan psikologis pada pasien dan keluarga; pemberian obat antikoagulan yang tidak diperlukan.", [3, 4, 12, 'mid'], [
          ["Penerapan ", { i: "Clinical Regularity Guard" }, ": menghitung koefisien variasi interval RR (CV < 8% diklasifikasikan sebagai Sinus Tachycardia normal, bukan AFib)."],
          ["Ambang batas keyakinan (confidence threshold) AI diatur ketat pada 85% untuk konfirmasi alarm klinis."],
          ["Riwayat episode AFib dapat di-klik langsung pada Web Dashboard untuk verifikasi visual bentuk gelombang oleh dokter."],
        ], [3, 1, 3], "DITERIMA"],
        ['HZ-SW-03', "Distorsi Amplitudo & Elevasi Segmen ST", "Filter baseline detrending memotong elevasi segmen ST (+0.2 s.d. +0.6 mV) atau meredam puncak R.", "Kesalahan diagnosis STEMI / infark miokard akut; pembacaan amplitudo kalibrasi gagal memenuhi standar IEC 60601-2-25.", [4, 4, 16, 'high'], [
          [{ b: "Wide-Window Baseline Filter (W ≥ 301 sampel, ~1.3 detik):" }, " Jendela mencakup > 1 siklus RR penuh sehingga elevasi ST dan gelombang T tidak terpotong."],
          ["Penjajaran garis isoelektrik segmen PR memastikan titik nol horizontal terkunci presisi di 0.000 mV."],
          ["Terverifikasi 100% pada uji simulator Kemenkes: pulsa kalibrasi 1.0 mV lolos dengan akurasi 99.6% (batas toleransi IEC ≤ 5%)."],
        ], [4, 1, 4], "DITERIMA"],
        ['HZ-SW-04', "Aplikasi Mobile Android Crash / Freeze di Ponsel Pasien", "Kebijakan Battery Saver agresif pada sistem operasi Android mematikan proses background service.", "Perekaman Holter terhenti di tengah jalan tanpa disadari oleh pasien.", [3, 4, 12, 'mid'], [
          ["Implementasi ", { b: "Foreground Service Android" }, " dengan icon notifikasi persisten di status bar yang tidak dapat dimatikan oleh sistem OS."],
          ["Panduan instalasi aplikasi: meminta izin ", { i: "\"Ignore Battery Optimization\"" }, " pada saat onboarding pertama kali."],
          ["Jika proses terhenti, watchdog service otomatis merestart perekaman dan menyambung file sesi sebelumnya."],
        ], [3, 1, 3], "DITERIMA"],
      ],
    },
    {
      title: "KATEGORI 5: KEAMANAN SIBER, PRIVASI PASIEN & INTEGRITAS DATA (UU PDP & ISO 27001)",
      rows: [
        ['HZ-CY-01', "Penyadapan Data Transmisi EKG (Eavesdropping)", "Transmisi radio nirkabel BLE atau komunikasi internet di tempat umum disadap pihak ketiga.", "Pelanggaran privasi rekam medis sensitif pasien (pelanggaran UU No. 27/2022 tentang Perlindungan Data Pribadi).", [3, 3, 9, 'mid'], [
          [{ b: "Enkripsi Transport HTTPS / TLS 1.3:" }, " Seluruh pertukaran data dari ponsel pasien ke Web Server Rumah Sakit terenkripsi end-to-end."],
          ["Protokol otentikasi sesi menggunakan token ", { i: "JSON Web Token (JWT)" }, " dengan masa kedaluwarsa ketat."],
          ["Data BLE tidak memancarkan identitas nama atau NIK pasien (hanya ID perangkat unik)."],
        ], [3, 1, 3], "DITERIMA"],
        ['HZ-CY-02', "Akses Tidak Sah ke Dashboard Rekam Medis Pasien", "Pencurian password staf medis atau penggunaan akun bersama tanpa pembatasan hak akses.", "Data rekam medis bocor, data pasien diubah atau disalahgunakan oleh pihak tidak berwenang.", [4, 3, 12, 'high'], [
          [{ b: "Role-Based Access Control (RBAC):" }, " Pembagian peran ketat antara Perawat (registrasi pasien & pemasangan), Dokter DPJP (analisis & catatan medis), dan Pasien."],
          ["Password disimpan menggunakan algoritma hashing satu arah ", { b: "bcrypt" }, " dengan salt dinamis."],
          ["Setiap sesi perekaman memiliki QR Code unik berenkripsi waktu (QR validitas maksimal 1-24 jam)."],
        ], [4, 1, 4], "DITERIMA"],
        ['HZ-CY-03', "Kehilangan Riwayat Database Pasien (Data Loss)", "Kerusakan fisik harddisk server atau kegagalan daya pada fasilitas cloud rumah sakit.", "Hilangnya rekaman EKG 24 jam pasien sebelum dokter sempat mengevaluasi laporan.", [3, 3, 9, 'mid'], [
          ["Dual Storage Redundancy: data mentah tersimpan di memori lokal ponsel pasien (SQLite) dan di server rumah sakit."],
          ["Fitur pencadangan otomatis (Automated Daily Database Backup) ke media penyimpanan sekunder terisolasi."],
          ["Fitur unduh file sesi laporan PDF mandiri yang dapat langsung disimpan di rekam medis elektronik (RME) RS."],
        ], [3, 1, 3], "DITERIMA"],
      ],
    },
    {
      title: "KATEGORI 6: FAKTOR MANUSIA, PENGGUNAAN & USABILITAS (IEC 62366-1)",
      rows: [
        ['HZ-US-01', "Salah Posisi Penempelan Elektroda (Lead Placement Error)", "Pasien memasang elektroda sendiri secara mandiri tanpa pemahaman anatomi segitiga Einthoven.", "Morfologi gelombang terbalik (vektor aksis negatif), menyebabkan kebingungan interpretasi klinis.", [3, 4, 12, 'mid'], [
          [{ b: "Pewarnaan Kabel Standar Internasional:" }, " Kabel elektroda diberi kode warna fisik jelas: Merah (RA / Kanan Atas), Kuning (LA / Kiri Atas), Hijau (LL / Kiri Bawah)."],
          ["Ilustrasi diagram penempelan bergambar langsung di layar aplikasi Android pasien dan Buku Panduan Pengujian."],
          ["Pemeriksaan awal wajib dilakukan oleh perawat melalui fitur Live Monitoring Web sebelum pasien dipulangkan ke rumah."],
        ], [3, 1, 3], "DITERIMA"],
        ['HZ-US-02', "Pasien Lupa Menyalakan / Mengecas Alat", "Pasien mengabaikan pengisian daya baterai sebelum tidur atau memulai sesi pemantauan 24 jam.", "Perekaman mati dini setelah 4 jam, kehilangan peluang merekam episode aritmia malam hari.", [2, 4, 8, 'mid'], [
          ["Indikator LED baterai pada perangkat keras dan status persentase baterai real-time di aplikasi HP."],
          ["Peringatan suara (chirp) dan notifikasi push di ponsel jika daya baterai < 20%."],
          ["Prosedur standar operasional (SOP): perawat wajib memastikan baterai terisi penuh 100% sebelum menyerahkan perangkat ke pasien."],
        ], [2, 1, 2], "DITERIMA"],
        ['HZ-US-03', "Pasien Panik Akibat Alarm Notifikasi Bunyi Alat", "Buzzer alat berbunyi saat mendeteksi denyut ireguler, membuat pasien cemas dan memicu takikardia reaktif.", "Kecemasan akut pada pasien, peningkatan tekanan darah mendadak.", [2, 3, 6, 'mid'], [
          ["Modul wearable pada dada pasien tidak membunyikan alarm keras saat AFib terdeteksi (alarm disuarakan secara senyap/discreet via notifikasi ponsel dan dashboard dokter)."],
          ["Buzzer perangkat keras hanya digunakan untuk konfirmasi status pairing koneksi BLE awal (< 0.1 detik)."],
          ["Edukasi tertulis di Buku Saku Pasien bahwa alat bekerja otomatis dan tenang."],
        ], [2, 1, 2], "DITERIMA"],
      ],
    },
  ];
}

// Risk matrix, rows P5..P1; each cell [level key, R value, class].
const MATRIX = [
  ['P5', "Sangat Sering", [['Sedang', 5, 'alarp'], ['Tinggi', 10, 'unacc'], ['Kritis', 15, 'unacc'], ['Kritis', 20, 'unacc'], ['Kritis', 25, 'unacc']]],
  ['P4', "Sering", [['Rendah', 4, 'acc'], ['Sedang', 8, 'alarp'], ['Tinggi', 12, 'unacc'], ['Kritis', 16, 'unacc'], ['Kritis', 20, 'unacc']]],
  ['P3', "Kadang-kadang", [['Rendah', 3, 'acc'], ['Sedang', 6, 'alarp'], ['Sedang', 9, 'alarp'], ['Tinggi', 12, 'unacc'], ['Kritis', 15, 'unacc']]],
  ['P2', "Jarang", [['Rendah', 2, 'acc'], ['Rendah', 4, 'acc'], ['Sedang', 6, 'alarp'], ['Sedang', 8, 'alarp'], ['Tinggi', 10, 'unacc']]],
  ['P1', "Sangat Jarang", [['Rendah', 1, 'acc'], ['Rendah', 2, 'acc'], ['Rendah', 3, 'acc'], ['Sedang', 4, 'alarp'], ['Sedang', 5, 'alarp']]],
];

const SecTitle = ({ n, children }) => <>{n}. {children}</>;

export default function RiskManagement() {
  const th = 'px-3 py-2.5 font-headline text-xs font-semibold uppercase tracking-wide text-on-surface';
  const levelName = { Rendah: "Rendah", Sedang: "Sedang", Tinggi: "Tinggi", Kritis: "Kritis" };

  return (
    <div>
      <DocHeader
        eyebrow={<>PT. Rifasha Multi Pratama • {t("Divisi Riset & Pengembangan Perangkat Medis IoMT")}</>}
        title={<>{t("BERKAS MANAJEMEN RISIKO PERANGKAT MEDIS")}<br />(RISK MANAGEMENT FILE - ISO 14971:2019)</>}
        subtitle={t("Sistem Holter EKG Cerdas Berbasis Wearable IoMT, Telemetri Real-Time 250 Hz, dan Deep Learning AI (detakita)")}
        badge="DOC-NO: RMF-DETAKITA-2026-V1.4"
      >
        <dl className='mt-5 grid gap-3 rounded-lg border border-outline-variant/30 bg-surface-container-low p-4 sm:grid-cols-2'>
          <div>
            <dt className='font-mono text-[11px] font-bold uppercase tracking-wider text-outline'>{t("Klasifikasi Perangkat")}</dt>
            <dd className='mt-0.5 text-sm font-medium text-on-surface'>{t("Kelas B (Risiko Sedang - Permenkes RI)")}</dd>
          </div>
          <div>
            <dt className='font-mono text-[11px] font-bold uppercase tracking-wider text-outline'>{t("Standar Rujukan Utama")}</dt>
            <dd className='mt-0.5 text-sm font-medium text-on-surface'>ISO 14971, IEC 60601-1, IEC 60601-2-47, IEC 62304</dd>
          </div>
          <div>
            <dt className='font-mono text-[11px] font-bold uppercase tracking-wider text-outline'>{t("Status Kelayakan")}</dt>
            <dd className='mt-1'><StatusPill tone='active' className='whitespace-normal'><ShieldCheck className='size-3.5' />RESIDUAL RISK ACCEPTABLE ({t("LAYAK UJI KLINIS")})</StatusPill></dd>
          </div>
          <div>
            <dt className='font-mono text-[11px] font-bold uppercase tracking-wider text-outline'>{t("Tanggal Terbit")}</dt>
            <dd className='mt-0.5 text-sm font-medium text-on-surface'>{t("2 November 2026")} • Rev. 1.4</dd>
          </div>
        </dl>
      </DocHeader>

      <Card className='mb-4 p-5 sm:p-8 print:break-inside-avoid-page print:border-0 print:p-0'>
        <h2 className='mb-5 flex items-center gap-2 border-b border-outline-variant/30 pb-4 font-headline text-lg font-semibold'><FileSignature className='size-5 text-primary' />{t("Lembar Pengesahan Dokumen")}</h2>
        <DocTable
          head={[t("Peran Tanggung Jawab"), t("Nama & Gelar"), t("Jabatan Organisasi"), t("Tanda Tangan & Tanggal")]}
          rows={[
            [<><strong className='font-semibold'>{t("Disusun Oleh:")}</strong><br /><small className='font-normal text-on-surface-variant'>Lead Biomedical & IoMT Systems Engineer</small></>, <strong className='font-semibold text-on-surface'>Novi Azman, S.T., M.T., Ph.D.</strong>, t("Penyusun Berkas Manajemen Risiko & Ketua Tim Riset"), <><em>[{t("Telah Ditandatangani Digital")}]</em><br /><small>02/11/2026</small></>],
            [<><strong className='font-semibold'>{t("Diverifikasi Oleh:")}</strong><br /><small className='font-normal text-on-surface-variant'>Quality Assurance & Regulatory Affairs</small></>, <strong className='font-semibold text-on-surface'>Rian Hidayat, S.Kom.</strong>, t("Manajer Penjamin Mutu Alkes"), <><em>[{t("Telah Ditandatangani Digital")}]</em><br /><small>02/11/2026</small></>],
            [<><strong className='font-semibold'>{t("Divalidasi Klinis:")}</strong><br /><small className='font-normal text-on-surface-variant'>Clinical Cardiology Advisor</small></>, <strong className='font-semibold text-on-surface'>dr. Andi Setiawan, Sp.JP(K), FIHA</strong>, t("Dokter Spesialis Jantung & Pembuluh Darah"), <><em>[{t("Telah Ditandatangani Digital")}]</em><br /><small>02/11/2026</small></>],
            [<><strong className='font-semibold'>{t("Disetujui Oleh:")}</strong><br /><small className='font-normal text-on-surface-variant'>{t("Penanggung Jawab Teknis (PJT)")}</small></>, <strong className='font-semibold text-on-surface'>{t("Direktur Utama PT Rifasha Multi Pratama")}</strong>, t("Pimpinan Fasilitas Produksi Perangkat Medis"), <><em>[{t("Telah Ditandatangani Digital")}]</em><br /><small>02/11/2026</small></>],
          ]}
        />
      </Card>

      <DocSection title={<SecTitle n={1}>{t("Ruang Lingkup dan Karakteristik Keselamatan Produk")}</SecTitle>}>
        <DocP>{rich("Dokumen ini menyajikan Berkas Manajemen Risiko (", { i: "Risk Management File" }, ") komprehensif untuk perangkat ", { b: "Sistem Holter EKG Cerdas detakita" }, ", sesuai dengan siklus hidup manajemen risiko perangkat medis yang diatur dalam standar internasional ", { b: "ISO 14971:2019" }, ", standar keselamatan elektromedik ", { b: "IEC 60601-1:2005+AMD1:2012" }, ", standar khusus Holter ambulatori ", { b: "IEC 60601-2-47:2012" }, ", siklus perangkat lunak medis ", { b: "IEC 62304:2006+AMD1:2015" }, ", serta ketentuan perizinan alat kesehatan ", { b: "Permenkes RI No. 62 Tahun 2017" }, ".")}</DocP>
        <Callout tone='info' title={<span className='inline-flex items-center gap-2'><ClipboardList className='size-4 text-primary' />{t("Identitas & Spesifikasi Intended Use Perangkat:")}</span>}>
          <DocList>
            <li>{rich({ b: "Nama Dagang / Produk:" }, " detakita IoMT Smart Holter ECG Monitor.")}</li>
            <li>{rich({ b: "Penggunaan yang Dimaksudkan (Intended Use):" }, " Perekaman, pemantauan waktu-nyata (", { i: "real-time monitoring" }, "), dan analisis ritme elektrokardiogram (EKG) kontinual selama 1 hingga 24 jam untuk membantu dokter spesialis mendeteksi aritmia paroksismal, fibrilasi atrium (Atrial Fibrillation / AFib), takikardia, bradikardia, dan evaluasi segmen ST pada pasien rawat jalan maupun rawat inap.")}</li>
            <li>{rich({ b: "Populasi Pasien:" }, " Pasien dewasa (usia ≥ 18 tahun) dengan keluhan palpitasi, pusing berulang, riwayat sinkop tanpa sebab jelas, atau pasien pasca-stroke iskemik yang dicurigai memiliki AFib tersembunyi.")}</li>
            <li>{rich({ b: "Kontraindikasi:" }, " Tidak ditujukan untuk pemantauan langsung di ruang resusitasi gawat darurat yang membutuhkan alarm defibrilasi invasif seketika (bukan alat pemantau ICU intra-operatif mandiri), dan tidak boleh dipasang pada kulit pasien yang mengalami luka bakar terbuka atau infeksi dermatologis parah di area prekordial dada.")}</li>
            <li>{rich({ b: "Lingkungan Penggunaan:" }, " Lingkungan ambulatori (rumah pasien, aktivitas kerja harian) dan lingkungan fasilitas pelayanan kesehatan (Puskesmas, Klinik Kardiologi, Rumah Sakit).")}</li>
          </DocList>
        </Callout>
      </DocSection>

      <DocSection title={<SecTitle n={2}>{t("Kebijakan Kriteria Keberterimaan Risiko (Risk Acceptability Policy)")}</SecTitle>}>
        <DocP>{rich("Tingkat risiko dihitung sebagai kombinasi dari tingkat keparahan dampak (", { i: "Severity of Harm" }, ") dan kemungkinan terjadinya dampak tersebut (", { i: "Probability of Occurrence" }, "). Skala matriks 5x5 digunakan untuk menilai risiko awal sebelum mitigasi dan risiko sisa setelah tindakan mitigasi rekayasa diterapkan.")}</DocP>

        <DocH3>2.1. {t("Definisi Skala Tingkat Keparahan (Severity Scale)")}</DocH3>
        <DocTable
          head={[t("Tingkat"), t("Klasifikasi"), t("Definisi Dampak Klinis Terhadap Pasien / Pengguna")]}
          rows={[
            ['S5', <Chip tone='high'>{t("Katastropik (Catastrophic)")}</Chip>, t("Kematian pasien, henti jantung mendadak, atau cedera permanen fatal akibat kegagalan fungsi alat atau sengatan listrik.")],
            ['S4', <Chip tone='high'>{t("Kritis (Critical)")}</Chip>, t("Cedera parah, keterlambatan diagnosis pada aritmia yang mengancam nyawa (VT/VF), atau kebutuhan intervensi medis invasif darurat.")],
            ['S3', <Chip tone='mid'>{t("Serius (Serious)")}</Chip>, t("Cedera sedang yang membutuhkan perawatan medis reversibel, diagnosis tertunda pada aritmia non-fatal (AFib asimtomatik), atau iritasi kulit parah.")],
            ['S2', <Chip tone='low'>{t("Minor (Minor)")}</Chip>, t("Ketidaknyamanan sementara pada pasien (kulit gatal ringan bekas elektroda), kehilangan sebagian data EKG tanpa bahaya fisik langsung, atau alarm palsu sementara.")],
            ['S1', <Chip tone='low'>{t("Diabaikan (Negligible)")}</Chip>, t("Gangguan kenyamanan tanpa cedera, perlunya restart koneksi Bluetooth, atau baterai habis dengan notifikasi awal yang jelas.")],
          ]}
        />

        <DocH3>2.2. {t("Definisi Skala Probabilitas Kemunculan (Probability Scale)")}</DocH3>
        <DocTable
          head={[t("Tingkat"), t("Klasifikasi Frekuensi"), t("Perkiraan Frekuensi Kejadian Operasional")]}
          rows={[
            ['P5', t("Sangat Sering (Frequent)"), t("Terjadi lebih dari 1 kali dalam 10 penggunaan (> 10%).")],
            ['P4', t("Sering (Probable)"), t("Terjadi antara 1 dari 10 hingga 1 dari 100 penggunaan (1% - 10%).")],
            ['P3', t("Kadang-kadang (Occasional)"), t("Terjadi antara 1 dari 100 hingga 1 dari 1.000 penggunaan (0.1% - 1%).")],
            ['P2', t("Jarang (Remote)"), t("Terjadi antara 1 dari 1.000 hingga 1 dari 10.000 penggunaan (0.01% - 0.1%).")],
            ['P1', t("Sangat Jarang (Improbable)"), t("Terjadi kurang dari 1 kali dalam 10.000 penggunaan (< 0.01%).")],
          ]}
        />

        <DocH3>2.3. {t("Matriks Evaluasi Risiko 5 × 5 (Risk Evaluation Matrix)")}</DocH3>
        <div className='rounded-lg border border-outline-variant/30'>
          <table className='w-full border-collapse text-center text-xs'>
            <thead className='bg-surface-container-low'>
              <tr>
                <th colSpan={2} rowSpan={2} className={cx(th, 'border-b border-r border-outline-variant/30 text-center')}><Grid3x3 className='mx-auto mb-1 size-4 text-primary' />{t("Matriks Risiko (S × P)")}</th>
                <th colSpan={5} className={cx(th, 'border-b border-outline-variant/30 text-center')}>{t("Tingkat Keparahan Dampak (Severity)")}</th>
              </tr>
              <tr>
                {[['S1', "Diabaikan"], ['S2', "Minor"], ['S3', "Serius"], ['S4', "Kritis"], ['S5', "Katastropik"]].map(([c, n]) => (
                  <th key={c} className={cx(th, 'border-b border-outline-variant/30 text-center normal-case tracking-normal')}>{c} ({t(n)})</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map(([p, name, cells], ri) => (
                <tr key={p} className='border-t border-outline-variant/20'>
                  {ri === 0 && <th rowSpan={5} className={cx(th, 'border-r border-outline-variant/30 bg-surface-container-low text-center normal-case tracking-normal')}>{t("Kemungkinan")}<br />(Probability)</th>}
                  <th className='whitespace-nowrap border-r border-outline-variant/30 bg-surface-container-low px-3 py-2 text-left font-headline text-xs font-semibold text-on-surface'>{p} ({t(name)})</th>
                  {cells.map(([lvl, r, cls], ci) => (
                    <td key={ci} className={cx('border-l border-white px-2 py-2.5 font-semibold', CELL[cls])}>{t(levelName[lvl])} (R{r})</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className='grid gap-3 text-sm sm:grid-cols-1'>
          {[
            ['acc', "Diterima (Broadly Acceptable):", " Risiko dapat diterima langsung tanpa mitigasi tambahan wajib."],
            ['alarp', "ALARP (As Low As Reasonably Practicable):", " Wajib dimitigasi hingga biaya/kompleksitas rekayasa seimbang."],
            ['unacc', "Tidak Dapat Diterima (Unacceptable):", " Perangkat DILARANG diedarkan sebelum risiko direduksi ke zona aman."],
          ].map(([cls, b, txt]) => (
            <li key={cls} className='flex items-start gap-2.5'>
              <span className={cx('mt-0.5 size-4 shrink-0 rounded border border-outline-variant/40', CELL[cls])} />
              <span>{rich({ b }, txt)}</span>
            </li>
          ))}
        </ul>
      </DocSection>

      <Card className='mb-4 p-5 sm:p-8 print:border-0 print:p-0'>
        <h2 className='mb-5 border-b border-outline-variant/30 pb-4 font-headline text-lg font-semibold'><SecTitle n={3}>{t("Tabel Analisis Bahaya & FMEA Lengkap (Hazard Analysis & Risk Mitigation)")}</SecTitle></h2>
        <div className='space-y-4 text-sm leading-relaxed text-on-surface-variant'>
          <DocP>{rich("Berdasarkan hierarki kendali ISO 14971 klausul 7.1, seluruh risiko ditangani melalui 3 lapis proteksi: ", { b: "(1) Rekayasa desain yang inheren aman" }, ", ", { b: "(2) Tindakan protektif otomatis pada firmware/software" }, ", dan ", { b: "(3) Informasi keselamatan, petunjuk penggunaan (IFU), serta pelabelan" }, ".")}</DocP>
          <div className='rounded-lg border border-outline-variant/30'>
            <table className='w-full table-fixed text-left text-sm'>
              <colgroup>
                <col className='w-[7%]' /><col className='w-[14%]' /><col className='w-[15%]' /><col className='w-[14%]' />
                <col className='w-[7%]' /><col className='w-[28%]' /><col className='w-[7%]' /><col className='w-[8%]' />
              </colgroup>
              <thead className='bg-surface-container-low'>
                <tr>
                  {[t("ID Bahaya"), t("Potensi Bahaya & Modus Kegagalan"), t("Penyebab Akar (Root Cause)"), t("Dampak Klinis (Harm)"), t("Awal S×P"), t("Tindakan Mitigasi & Pengendalian Risiko"), t("Sisa S×P"), t("Status Kelayakan")].map((h, i) => <th key={i} className={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {categories().map((cat, ci) => [
                  <tr key={'c' + ci} className='border-t border-outline-variant/30 bg-surface-container'>
                    <td colSpan={8} className='px-3 py-2.5 font-headline text-xs font-bold uppercase tracking-wide text-primary'>{t(cat.title)}</td>
                  </tr>,
                  ...cat.rows.map(([id, mode, cause, harm, init, mit, res, status]) => (
                    <tr key={id} className='border-t border-outline-variant/20 align-top print:break-inside-avoid'>
                      <td className='px-3 py-2.5'><CodeTag>{id}</CodeTag></td>
                      <td className='px-3 py-2.5 font-medium text-on-surface'>{t(mode)}</td>
                      <td className='px-3 py-2.5 text-on-surface-variant'>{t(cause)}</td>
                      <td className='px-3 py-2.5 text-on-surface-variant'>{t(harm)}</td>
                      <td className='px-3 py-2.5'><Score tone={init[3]} s={init[0]} p={init[1]} r={init[2]} /></td>
                      <td className='px-3 py-2.5 text-on-surface-variant'>
                        <ol className='list-decimal space-y-1.5 pl-4'>{mit.map((m, mi) => <li key={mi}>{rich(...m)}</li>)}</ol>
                      </td>
                      <td className='px-3 py-2.5'><Score tone='low' s={res[0]} p={res[1]} r={res[2]} /></td>
                      <td className='px-3 py-2.5'><Chip tone='low'>{t(status)}</Chip></td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <DocSection title={<SecTitle n={4}>{t("Evaluasi Risiko Sisa Keseluruhan (Overall Residual Risk Evaluation)")}</SecTitle>}>
        <DocP>{t("Berdasarkan seluruh tindakan mitigasi yang telah diimplementasikan baik pada tingkat rekayasa perangkat keras (hardware interlock, isolasi daya Li-Po, chip front-end AD8232), perangkat lunak tertanam (FreeRTOS dual-task, circular buffer), algoritma pemrosesan sinyal digital (Wide-window physiological detrending, PR-segment isoelectric anchoring), kecerdasan buatan (Regularity Guard, ambang keyakinan 85%), hingga keamanan siber (JWT, enkripsi TLS 1.3, RBAC):")}</DocP>
        <Callout tone='ok' title={<span className='inline-flex items-center gap-2'><Scale className='size-4 text-tertiary' />{t("Ringkasan Evaluasi Matriks Risiko ISO 14971:")}</span>}>
          <DocList>
            <li>{rich({ b: "Total Bahaya Teridentifikasi:" }, " 18 Bahaya Utama (Electrical, Mechanical, Connectivity, Software/AI, Cybersecurity, Usability).")}</li>
            <li>{rich({ b: "Risiko Sebelum Mitigasi (Initial Risk):" }, " 6 Kategori Kritis (Unacceptable), 12 Kategori Sedang (ALARP).")}</li>
            <li>{rich({ b: "Risiko Setelah Mitigasi Rekayasa (Residual Risk):" }, " ", { b: "0 Kategori Kritis (0%)" }, ", ", { b: "4 Kategori ALARP Terkendali (22%)" }, ", dan ", { b: "14 Kategori Rendah / Diterima Penuh (78%)" }, ".")}</li>
            <li>{rich({ b: "Analisis Manfaat Medis vs Risiko (Risk-Benefit Analysis):" }, " Manfaat klinis deteksi dini aritmia dan pencegahan stroke iskemik akibat Fibrilasi Atrium jauh melampaui risiko sisa yang telah diminimalisir secara komprehensif.")}</li>
          </DocList>
        </Callout>
      </DocSection>

      <DocSection title={<SecTitle n={5}>{t("Rencana Pengawasan Pasca-Pemasaran (Post-Market Surveillance Plan)")}</SecTitle>}>
        <DocP>{t("Sesuai ketentuan ISO 14971 klausul 9 dan standar mutu ISO 13485:2016, pemantauan terhadap kinerja keselamatan alat di lapangan dilaksanakan secara berkelanjutan melalui:")}</DocP>
        <DocList ordered>
          <li>{rich({ b: "Sistem Pelaporan Insiden & Keluhan Pelanggan (Complaint Handling):" }, " Seluruh umpan balik teknis dari dokter rumah sakit dan pasien dicatat dalam sistem tiket kendali mutu PT Rifasha Multi Pratama dalam waktu 1×24 jam.")}</li>
          <li>{rich({ b: "Mekanisme Pelaporan Kejadian Tidak Diinginkan (KTD / Adverse Event Reporting):" }, " Jika terjadi kegagalan fatal pada perangkat yang membahayakan keselamatan pasien, laporan wajib disampaikan ke Direktorat Jenderal Farmasi dan Alat Kesehatan (Kemenkes RI) dalam tempo maksimal 2×24 jam.")}</li>
          <li>{rich({ b: "Tindakan Korektif dan Preventif (CAPA):" }, " Analisis akar penyebab kegagalan perangkat lunak atau perangkat keras diselesaikan melalui pembaruan firmware Over-The-Air (OTA) atau penarikan batch komponen yang cacat.")}</li>
        </DocList>
      </DocSection>

      <DocSection title={<SecTitle n={6}>{t("Kesimpulan dan Pernyataan Kelayakan Regulasi")}</SecTitle>}>
        <div className='rounded-lg border border-outline-variant/50 bg-surface-container-low p-5'>
          <p className='mb-2 flex items-center gap-2 font-headline text-sm font-bold text-on-surface'><Stamp className='size-4 text-primary' />{t("PERNYATAAN RESMI KELAYAKAN KESELAMATAN PERANGKAT MEDIS:")}</p>
          <p className='mb-2'>{t("Berdasarkan tinjauan teknis dan klinis yang mendalam terhadap seluruh mitigasi bahaya yang diterapkan pada perangkat keras, firmware, antarmuka IoT, dan modul perangkat lunak kecerdasan buatan, Tim Manajemen Risiko menyatakan bahwa:")}</p>
          <p className='flex items-start gap-2 font-headline text-[15px] font-bold text-tertiary'><Activity className='mt-0.5 size-4 shrink-0' /><span>{t("\"Sistem Holter EKG Cerdas detakita DINYATAKAN AMAN, MEMENUHI PERSYARATAN KINERJA ESENSIAL DAN KESELAMATAN DASAR SESUAI ISO 14971:2019, IEC 60601-1, SERTA LAYAK UNTUK DILANJUTKAN KE TAHAP PENGUJIAN KLINIS DAN PERMOHONAN IZIN EDAR KEMENTERIAN KESEHATAN REPUBLIK INDONESIA.\"")}</span></p>
        </div>
        <p className='flex items-center gap-2 text-xs text-outline print:hidden'><TableProperties className='size-3.5' />{t("Tip: Gunakan opsi \"Save as PDF\" dengan orientasi Portrait dan skala 100% untuk hasil cetak dokumen regulasi resmi.")}</p>
      </DocSection>
    </div>
  );
}
