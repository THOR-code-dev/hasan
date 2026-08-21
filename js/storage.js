/**
 * Storage Manager for Dijital Hafızlık Çizelgesi
 * Hybrid Layer: Connects Supabase Cloud Database with LocalStorage Fallback & Realtime Sync.
 */

const STORAGE_KEYS = {
  APP_DATA: 'hafizlik_cizelgesi_data_v1',
  TEACHERS: 'hafizlik_cizelgesi_teachers_v1',
  THEME: 'hafizlik_cizelgesi_theme'
};

// Default Teachers list extracted from photo + common additions
const DEFAULT_TEACHERS = [
  "Metin Hocam",
  "Enes Hocam",
  "Yusuf Hocam",
  "Yusuf Alagöz H.",
  "Muhammed Hoca",
  "Malik Abim",
  "Yusuf Hoca",
  "İsmail Hoca",
  "Bilal Hoca"
];

// Structure of a fresh single Dönüş (30 Cüz)
function createEmptyRound(roundNumber) {
  const juzs = [];
  for (let i = 1; i <= 30; i++) {
    juzs.push({
      id: i,
      name: `${i}. Cüz`,
      date: '',
      teacher: '',
      status: 'empty', // 'empty' | 'completed'
      note: ''
    });
  }
  return {
    id: `round_${Date.now()}_${roundNumber}`,
    name: `${roundNumber}. Dönüş`,
    round_number: roundNumber,
    createdDate: new Date().toISOString().split('T')[0],
    juzs: juzs
  };
}

class StorageManager {
  constructor() {
    this.supabase = window.supabaseService;
    this.teachers = this.loadLocalTeachers();
    this.data = this.loadLocalData();
    this.isCloudSync = false;
    this.onDataChangeCallbacks = [];
  }

  // Register listener for remote realtime changes
  onDataChange(callback) {
    this.onDataChangeCallbacks.push(callback);
  }

  notifyDataChange(source) {
    this.onDataChangeCallbacks.forEach(cb => cb(source));
  }

  // Async Initialization with Supabase
  async init() {
    if (!this.supabase) return;

    const isConnected = await this.supabase.checkConnection();
    if (isConnected) {
      this.isCloudSync = true;
      await this.syncFromCloud();

      // Listen for Realtime Events
      this.supabase.setupRealtime(async (table, payload) => {
        console.log(`[Realtime] Remote update received from ${table}`);
        await this.syncFromCloud();
        this.notifyDataChange(table);
      });
    } else {
      console.log('Supabase offline or unreachable. Using LocalStorage.');
    }
  }

  // Fetch all latest data from Supabase & update local cache
  async syncFromCloud() {
    if (!this.supabase) return;
    try {
      const [remoteTeachers, remoteRounds] = await Promise.all([
        this.supabase.getTeachers(),
        this.supabase.getRounds()
      ]);

      if (remoteTeachers && remoteTeachers.length > 0) {
        this.teachers = remoteTeachers;
        this.saveLocalTeachers(this.teachers);
      }

      if (remoteRounds && remoteRounds.length > 0) {
        // Keep active round if valid, else pick first
        let activeId = this.data.activeRoundId;
        const exists = remoteRounds.find(r => r.id === activeId);
        if (!exists) {
          activeId = remoteRounds[0].id;
        }

        this.data = {
          activeRoundId: activeId,
          rounds: remoteRounds
        };
        this.saveLocalData(this.data);
      }
    } catch (e) {
      console.error('Cloud senkronizasyon hatası:', e);
    }
  }

  // --- TEACHERS ---
  loadLocalTeachers() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TEACHERS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Error loading teachers:", e);
    }
    return [...DEFAULT_TEACHERS];
  }

  saveLocalTeachers(teachers) {
    this.teachers = teachers;
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(teachers));
  }

  async addTeacher(name) {
    if (!name || this.teachers.includes(name.trim())) return false;
    const cleanName = name.trim();
    this.teachers.push(cleanName);
    this.saveLocalTeachers(this.teachers);

    if (this.isCloudSync) {
      await this.supabase.addTeacher(cleanName);
    }
    return true;
  }

  async removeTeacher(name) {
    this.teachers = this.teachers.filter(t => t !== name);
    this.saveLocalTeachers(this.teachers);

    if (this.isCloudSync) {
      await this.supabase.removeTeacher(name);
    }
  }

  // --- DATA (ROUNDS & JUZS) ---
  loadLocalData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.APP_DATA);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.rounds && parsed.rounds.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Error loading app data:", e);
    }
    const initialData = {
      activeRoundId: null,
      rounds: [createEmptyRound(1)]
    };
    initialData.activeRoundId = initialData.rounds[0].id;
    this.saveLocalData(initialData);
    return initialData;
  }

  saveLocalData(data) {
    this.data = data;
    localStorage.setItem(STORAGE_KEYS.APP_DATA, JSON.stringify(data));
  }

  async addNewRound() {
    const nextNum = this.data.rounds.length + 1;

    if (this.isCloudSync) {
      const created = await this.supabase.createRound(nextNum, `${nextNum}. Dönüş`);
      if (created) {
        this.data.rounds.push(created);
        this.data.activeRoundId = created.id;
        this.saveLocalData(this.data);
        return created;
      }
    }

    // Local fallback
    const newRound = createEmptyRound(nextNum);
    this.data.rounds.push(newRound);
    this.data.activeRoundId = newRound.id;
    this.saveLocalData(this.data);
    return newRound;
  }

  async deleteRound(roundId) {
    if (this.data.rounds.length <= 1) return false;

    this.data.rounds = this.data.rounds.filter(r => r.id !== roundId);
    if (this.data.activeRoundId === roundId) {
      this.data.activeRoundId = this.data.rounds[0].id;
    }
    this.saveLocalData(this.data);

    if (this.isCloudSync) {
      await this.supabase.deleteRound(roundId);
    }
    return true;
  }

  async updateJuz(roundId, juzId, fields) {
    const round = this.data.rounds.find(r => r.id === roundId);
    if (!round) return;
    const juz = round.juzs.find(j => j.id === juzId);
    if (!juz) return;

    Object.assign(juz, fields);
    
    // Status update
    if (juz.date || juz.teacher) {
      juz.status = 'completed';
    } else {
      juz.status = 'empty';
    }

    this.saveLocalData(this.data);

    if (this.isCloudSync) {
      await this.supabase.updateJuzRecord(roundId, juzId, juz);
    }
  }

  async clearRound(roundId) {
    const round = this.data.rounds.find(r => r.id === roundId);
    if (!round) return;
    round.juzs.forEach(j => {
      j.date = '';
      j.teacher = '';
      j.status = 'empty';
      j.note = '';
    });
    this.saveLocalData(this.data);

    if (this.isCloudSync) {
      await this.supabase.clearRoundJuzs(roundId);
    }
  }

  async loadPhotoSampleData(sampleData) {
    if (this.isCloudSync) {
      // Supabase'e aktar
      await this.supabase.importAllData(sampleData);
      await this.syncFromCloud();
    } else {
      this.saveLocalData(JSON.parse(JSON.stringify(sampleData)));
    }
  }

  // Export data to JSON file
  exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `hafizlik_cizelgesi_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  // Export to CSV for Excel
  exportCSV() {
    let csv = "Donus;Cuz;Tarih;Hoca;Durum\n";
    this.data.rounds.forEach(round => {
      round.juzs.forEach(juz => {
        csv += `"${round.name}";"${juz.name}";"${juz.date}";"${juz.teacher}";"${juz.status === 'completed' ? 'Tamamlandı' : 'Boş'}"\n`;
      });
    });

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `hafizlik_cizelgesi_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
}

window.storageManager = new StorageManager();
