/**
 * Storage Manager for Dijital Hafızlık Çizelgesi
 * Handles LocalStorage saving, loading, JSON backup, CSV export, and teacher management.
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
    createdDate: new Date().toISOString().split('T')[0],
    juzs: juzs
  };
}

class StorageManager {
  constructor() {
    this.teachers = this.loadTeachers();
    this.data = this.loadData();
  }

  // Load teachers from localStorage or default
  loadTeachers() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TEACHERS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Error loading teachers:", e);
    }
    this.saveTeachers(DEFAULT_TEACHERS);
    return [...DEFAULT_TEACHERS];
  }

  saveTeachers(teachers) {
    this.teachers = teachers;
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(teachers));
  }

  addTeacher(name) {
    if (!name || this.teachers.includes(name.trim())) return false;
    this.teachers.push(name.trim());
    this.saveTeachers(this.teachers);
    return true;
  }

  removeTeacher(name) {
    this.teachers = this.teachers.filter(t => t !== name);
    this.saveTeachers(this.teachers);
  }

  // Load app data (Rounds and Juzs)
  loadData() {
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
    // Default initial data with 1 round
    const initialData = {
      activeRoundId: null,
      rounds: [createEmptyRound(1)]
    };
    initialData.activeRoundId = initialData.rounds[0].id;
    this.saveData(initialData);
    return initialData;
  }

  saveData(data) {
    this.data = data;
    localStorage.setItem(STORAGE_KEYS.APP_DATA, JSON.stringify(data));
  }

  // Helper to add a new Dönüş
  addNewRound() {
    const nextNum = this.data.rounds.length + 1;
    const newRound = createEmptyRound(nextNum);
    this.data.rounds.push(newRound);
    this.data.activeRoundId = newRound.id;
    this.saveData(this.data);
    return newRound;
  }

  // Delete a Dönüş
  deleteRound(roundId) {
    if (this.data.rounds.length <= 1) return false; // Keep at least 1 round
    this.data.rounds = this.data.rounds.filter(r => r.id !== roundId);
    if (this.data.activeRoundId === roundId) {
      this.data.activeRoundId = this.data.rounds[0].id;
    }
    this.saveData(this.data);
    return true;
  }

  // Update specific Juz inside active round
  updateJuz(roundId, juzId, fields) {
    const round = this.data.rounds.find(r => r.id === roundId);
    if (!round) return;
    const juz = round.juzs.find(j => j.id === juzId);
    if (!juz) return;

    Object.assign(juz, fields);
    
    // Auto status evaluation
    if (juz.date || juz.teacher) {
      juz.status = 'completed';
    } else {
      juz.status = 'empty';
    }

    this.saveData(this.data);
  }

  // Clear current round
  clearRound(roundId) {
    const round = this.data.rounds.find(r => r.id === roundId);
    if (!round) return;
    round.juzs.forEach(j => {
      j.date = '';
      j.teacher = '';
      j.status = 'empty';
      j.note = '';
    });
    this.saveData(this.data);
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
