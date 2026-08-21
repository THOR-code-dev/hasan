/**
 * Main Application Logic for Dijital Hafızlık Çizelgesi
 * Realtime Supabase Backend Integration
 */

document.addEventListener('DOMContentLoaded', async () => {
  const storage = window.storageManager;
  const supabaseService = window.supabaseService;
  let currentView = 'cards'; // 'cards' | 'table' | 'split'
  let searchQuery = '';

  // DOM Elements
  const mainContentView = document.getElementById('mainContentView');
  const roundTabsContainer = document.getElementById('roundTabsContainer');
  const quickTeacherSelect = document.getElementById('quickTeacherSelect');
  const searchInput = document.getElementById('searchInput');

  // Cloud Status Elements
  const cloudStatusBadge = document.getElementById('cloudStatusBadge');
  const cloudStatusText = document.getElementById('cloudStatusText');

  // Stats Elements
  const statActiveProgress = document.getElementById('statActiveProgress');
  const statPercentBadge = document.getElementById('statPercentBadge');
  const statProgressBar = document.getElementById('statProgressBar');
  const statTotalRounds = document.getElementById('statTotalRounds');
  const statActiveRoundName = document.getElementById('statActiveRoundName');
  const statLastTeacher = document.getElementById('statLastTeacher');
  const statLastDate = document.getElementById('statLastDate');

  // Modal Elements
  const teacherModal = document.getElementById('teacherModal');
  const teacherListContainer = document.getElementById('teacherListContainer');
  const newTeacherInput = document.getElementById('newTeacherInput');

  // Cloud Status Handler
  if (supabaseService) {
    supabaseService.onStatusChange((isOnline, message) => {
      if (cloudStatusBadge && cloudStatusText) {
        cloudStatusBadge.className = `cloud-status-badge ${isOnline ? 'connected' : 'error'}`;
        cloudStatusText.textContent = isOnline ? 'Bulut: Bağlı' : 'Bulut: Çevrimdışı';
        cloudStatusBadge.title = message || (isOnline ? 'Supabase Bağlantısı Aktif' : 'Supabase Çevrimdışı');
      }
    });
  }

  // Realtime Remote Data Change Listener
  storage.onDataChange((table) => {
    renderAll();
    showToast(`Buluttan canlı veri güncellendi (${table})`, 'info');
  });

  // Init App
  async function init() {
    setupEventListeners();
    applyTheme(localStorage.getItem('hafizlik_cizelgesi_theme') || 'dark');
    renderAll();

    // Initialize Supabase Data Fetch
    await storage.init();
    renderAll();
  }

  // Master Render Function
  function renderAll() {
    renderStats();
    renderTabs();
    renderQuickTeacherSelect();
    renderView();
  }

  // --- STATS RENDER ---
  function renderStats() {
    if (!storage.data || !storage.data.rounds || storage.data.rounds.length === 0) return;

    const activeRound = storage.data.rounds.find(r => r.id === storage.data.activeRoundId) || storage.data.rounds[0];
    if (!activeRound) return;

    const completedCount = (activeRound.juzs || []).filter(j => j.status === 'completed' || j.date || j.teacher).length;
    const percent = Math.round((completedCount / 30) * 100);

    statActiveProgress.textContent = `${completedCount} / 30`;
    statPercentBadge.textContent = `%${percent}`;
    statProgressBar.style.width = `${percent}%`;

    statTotalRounds.textContent = storage.data.rounds.length;
    statActiveRoundName.textContent = `Seçili: ${activeRound.name}`;

    // Find last recorded Juz
    const filledJuzs = (activeRound.juzs || []).filter(j => j.date || j.teacher);
    if (filledJuzs.length > 0) {
      const lastJuz = filledJuzs[filledJuzs.length - 1];
      statLastTeacher.textContent = lastJuz.teacher || 'Belirtilmedi';
      statLastDate.textContent = `Son: ${formatDateDisplay(lastJuz.date)}`;
    } else {
      statLastTeacher.textContent = '-';
      statLastDate.textContent = 'Henüz giriş yapılmadı';
    }
  }

  // --- TABS RENDER ---
  function renderTabs() {
    roundTabsContainer.innerHTML = '';
    if (!storage.data || !storage.data.rounds) return;

    storage.data.rounds.forEach((round) => {
      const btn = document.createElement('button');
      btn.className = `tab-btn ${round.id === storage.data.activeRoundId ? 'active' : ''}`;
      
      const titleSpan = document.createElement('span');
      titleSpan.textContent = round.name;
      btn.appendChild(titleSpan);

      // Add delete icon if more than 1 round
      if (storage.data.rounds.length > 1) {
        const deleteBtn = document.createElement('i');
        deleteBtn.className = 'fa-solid fa-xmark tab-delete-btn';
        deleteBtn.title = 'Dönüşü Sil';
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`${round.name} silinecektir. Emin misiniz?`)) {
            await storage.deleteRound(round.id);
            showToast(`${round.name} silindi.`);
            renderAll();
          }
        });
        btn.appendChild(deleteBtn);
      }

      btn.addEventListener('click', () => {
        storage.data.activeRoundId = round.id;
        storage.saveLocalData(storage.data);
        renderAll();
      });

      roundTabsContainer.appendChild(btn);
    });
  }

  // --- QUICK TEACHER SELECT RENDER ---
  function renderQuickTeacherSelect() {
    quickTeacherSelect.innerHTML = '';
    (storage.teachers || []).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      quickTeacherSelect.appendChild(opt);
    });
  }

  // --- MAIN VIEW RENDER (CARDS / TABLE / SPLIT) ---
  function renderView() {
    mainContentView.innerHTML = '';
    if (!storage.data || !storage.data.rounds || storage.data.rounds.length === 0) {
      mainContentView.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-muted);">Kayıtlı dönüş bulunamadı.</div>`;
      return;
    }

    const activeRound = storage.data.rounds.find(r => r.id === storage.data.activeRoundId) || storage.data.rounds[0];
    if (!activeRound) return;

    if (currentView === 'cards') {
      renderCardsView(activeRound);
    } else if (currentView === 'table') {
      renderTableView(activeRound);
    } else if (currentView === 'split') {
      renderSplitView();
    }
  }

  // 1. CARDS VIEW (30 Juz Cards)
  function renderCardsView(round) {
    const grid = document.createElement('div');
    grid.className = 'cards-grid';

    const juzList = round.juzs || [];
    const filteredJuzs = juzList.filter(juz => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (juz.name && juz.name.toLowerCase().includes(query)) ||
             (juz.teacher && juz.teacher.toLowerCase().includes(query)) ||
             (juz.date && juz.date.includes(query));
    });

    if (filteredJuzs.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
        Arama kriterinize uygun Cüz bulunamadı.
      </div>`;
      mainContentView.appendChild(grid);
      return;
    }

    filteredJuzs.forEach(juz => {
      const isCompleted = juz.status === 'completed' || juz.date || juz.teacher;
      const card = document.createElement('div');
      card.className = `cuz-card ${isCompleted ? 'completed' : ''}`;

      card.innerHTML = `
        <div class="cuz-card-header">
          <div class="cuz-number-badge">${juz.id}</div>
          <div class="cuz-title">${juz.name}</div>
          <button class="status-pill ${isCompleted ? 'status-tamam' : 'status-bos'}">
            ${isCompleted ? '<i class="fa-solid fa-check"></i> Dinlendi' : 'Boş'}
          </button>
        </div>
        <div class="cuz-card-body">
          <div class="field-group">
            <label>
              Tarih
              <span class="btn-today-inline" data-id="${juz.id}">Bugün</span>
            </label>
            <input type="date" class="cuz-input date-input" data-id="${juz.id}" value="${juz.date || ''}">
          </div>
          <div class="field-group">
            <label>Dinleyen Hoca</label>
            <select class="cuz-input teacher-select" data-id="${juz.id}">
              <option value="">-- Seçiniz --</option>
              ${storage.teachers.map(t => `<option value="${t}" ${juz.teacher === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
      `;

      // Event Listeners for Card Inputs
      const dateInput = card.querySelector('.date-input');
      const teacherSelect = card.querySelector('.teacher-select');
      const btnToday = card.querySelector('.btn-today-inline');

      dateInput.addEventListener('change', async (e) => {
        await storage.updateJuz(round.id, juz.id, { date: e.target.value });
        renderStats();
        card.classList.toggle('completed', !!(e.target.value || teacherSelect.value));
      });

      teacherSelect.addEventListener('change', async (e) => {
        await storage.updateJuz(round.id, juz.id, { teacher: e.target.value });
        renderStats();
        card.classList.toggle('completed', !!(dateInput.value || e.target.value));
      });

      btnToday.addEventListener('click', async () => {
        const todayStr = new Date().toISOString().split('T')[0];
        dateInput.value = todayStr;
        if (!teacherSelect.value && quickTeacherSelect.value) {
          teacherSelect.value = quickTeacherSelect.value;
        }
        await storage.updateJuz(round.id, juz.id, { date: todayStr, teacher: teacherSelect.value });
        renderStats();
        card.classList.add('completed');
        showToast(`${juz.name} kaydedildi.`);
      });

      grid.appendChild(card);
    });

    mainContentView.appendChild(grid);
  }

  // 2. TABLE VIEW (Paper Chart replica)
  function renderTableView(round) {
    const wrap = document.createElement('div');
    wrap.className = 'table-responsive';

    let html = `
      <table class="cuz-table">
        <thead>
          <tr>
            <th>Cüz</th>
            <th>Dinleme Tarihi</th>
            <th>Dinleyen Hoca</th>
            <th>Durum</th>
            <th>Hızlı İşlem</th>
          </tr>
        </thead>
        <tbody>
    `;

    (round.juzs || []).forEach(juz => {
      const isDone = juz.status === 'completed' || juz.date || juz.teacher;
      html += `
        <tr data-id="${juz.id}">
          <td class="cuz-col">${juz.name}</td>
          <td>
            <input type="date" class="tbl-date" value="${juz.date || ''}">
          </td>
          <td>
            <select class="tbl-teacher">
              <option value="">-- Seçiniz --</option>
              ${storage.teachers.map(t => `<option value="${t}" ${juz.teacher === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </td>
          <td>
            <span class="badge ${isDone ? 'badge-emerald' : ''}">${isDone ? 'Tamamlandı' : 'Boş'}</span>
          </td>
          <td>
            <button class="btn-sm btn-ghost tbl-today-btn"><i class="fa-solid fa-calendar-check"></i> Bugün</button>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    wrap.innerHTML = html;

    // Attach listeners
    wrap.querySelectorAll('tr[data-id]').forEach(tr => {
      const juzId = parseInt(tr.dataset.id);
      const dateInp = tr.querySelector('.tbl-date');
      const teacherSel = tr.querySelector('.tbl-teacher');
      const todayBtn = tr.querySelector('.tbl-today-btn');

      dateInp.addEventListener('change', async (e) => {
        await storage.updateJuz(round.id, juzId, { date: e.target.value });
        renderStats();
      });

      teacherSel.addEventListener('change', async (e) => {
        await storage.updateJuz(round.id, juzId, { teacher: e.target.value });
        renderStats();
      });

      todayBtn.addEventListener('click', async () => {
        const todayStr = new Date().toISOString().split('T')[0];
        dateInp.value = todayStr;
        if (!teacherSel.value && quickTeacherSelect.value) {
          teacherSel.value = quickTeacherSelect.value;
        }
        await storage.updateJuz(round.id, juzId, { date: todayStr, teacher: teacherSel.value });
        renderAll();
        showToast(`Cüz ${juzId} güncellendi.`);
      });
    });

    mainContentView.appendChild(wrap);
  }

  // 3. SPLIT VIEW (All Rounds side-by-side)
  function renderSplitView() {
    const container = document.createElement('div');
    container.className = 'split-view-container';

    (storage.data.rounds || []).forEach(round => {
      const col = document.createElement('div');
      col.className = 'split-column';
      
      let html = `
        <div class="split-header">
          <h3>${round.name}</h3>
          <span class="badge badge-emerald">${(round.juzs || []).filter(j => j.date || j.teacher).length} / 30</span>
        </div>
        <div class="table-responsive">
          <table class="cuz-table">
            <thead>
              <tr>
                <th>Cüz</th>
                <th>Tarih</th>
                <th>Hoca</th>
              </tr>
            </thead>
            <tbody>
      `;

      (round.juzs || []).forEach(juz => {
        html += `
          <tr>
            <td class="cuz-col">${juz.id}. Cüz</td>
            <td>${formatDateDisplay(juz.date)}</td>
            <td>${juz.teacher || '-'}</td>
          </tr>
        `;
      });

      html += `</tbody></table></div>`;
      col.innerHTML = html;
      container.appendChild(col);
    });

    mainContentView.appendChild(container);
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Add Round Button
    document.getElementById('btnAddRound').addEventListener('click', async () => {
      const newRound = await storage.addNewRound();
      showToast(`${newRound.name} başarıyla oluşturuldu!`);
      renderAll();
    });

    // Theme Toggle
    document.getElementById('btnThemeToggle').addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
    });

    // View Switcher Buttons
    document.querySelectorAll('.view-toggle .toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        renderView();
      });
    });

    // Search Input
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderView();
    });

    // Load Photo Sample Data Button
    document.getElementById('btnLoadPhotoData').addEventListener('click', async () => {
      if (confirm('Fotoğraflardaki hazır veriler (1., 2. ve 3. Dönüş) Supabase bulut veritabanınıza yüklenecektir. Onaylıyor musunuz?')) {
        showToast('Veriler Supabase bulutuna aktarılıyor...', 'info');
        
        // Add sample teachers
        for (const t of ["Metin Hocam", "Enes Hocam", "Yusuf Hocam", "Yusuf Alagöz H.", "Muhammed Hoca", "Malik Abim", "Yusuf Hoca"]) {
          await storage.addTeacher(t);
        }

        await storage.loadPhotoSampleData(PHOTO_SAMPLE_DATA);
        showToast('Fotoğraflardaki 3 dönüşün tüm verileri Supabase buluta başarıyla yüklendi!');
        renderAll();
      }
    });

    // Quick Fill Today Button
    document.getElementById('btnQuickToday').addEventListener('click', async () => {
      const activeRound = storage.data.rounds.find(r => r.id === storage.data.activeRoundId);
      if (!activeRound) return;

      const emptyJuz = (activeRound.juzs || []).find(j => !j.date && !j.teacher);
      if (!emptyJuz) {
        showToast('Bu dönüşteki tüm cüzler doldurulmuş!', 'warning');
        return;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const selectedTeacher = quickTeacherSelect.value;
      await storage.updateJuz(activeRound.id, emptyJuz.id, { date: todayStr, teacher: selectedTeacher });
      showToast(`${emptyJuz.name} için ${todayStr} ve ${selectedTeacher || 'Hoca'} atandı.`);
      renderAll();
    });

    // Clear Current Round Button
    document.getElementById('btnClearCurrentRound').addEventListener('click', async () => {
      const activeRound = storage.data.rounds.find(r => r.id === storage.data.activeRoundId);
      if (!activeRound) return;

      if (confirm(`${activeRound.name} içerisindeki tüm kayıtlar temizlenecektir. Emin misiniz?`)) {
        await storage.clearRound(activeRound.id);
        showToast(`${activeRound.name} temizlendi.`);
        renderAll();
      }
    });

    // Backup Export & Import
    document.getElementById('btnExportJSON').addEventListener('click', () => storage.exportJSON());
    document.getElementById('btnExportCSV').addEventListener('click', () => storage.exportCSV());

    const fileInputJSON = document.getElementById('fileInputJSON');
    document.getElementById('btnImportJSON').addEventListener('click', () => fileInputJSON.click());
    
    fileInputJSON.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (imported && imported.rounds) {
            await storage.loadPhotoSampleData(imported);
            showToast('Yedek başarıyla yüklendi!');
            renderAll();
          } else {
            showToast('Geçersiz dosya formatı!', 'error');
          }
        } catch (err) {
          showToast('Dosya okunurken hata oluştu!', 'error');
        }
      };
      reader.readAsText(file);
    });

    // Print Button
    document.getElementById('btnPrint').addEventListener('click', () => window.print());

    // Teacher Modal Controls
    const btnManageTeachers = document.getElementById('btnManageTeachers');
    const btnCloseTeacherModal = document.getElementById('btnCloseTeacherModal');

    btnManageTeachers.addEventListener('click', () => {
      renderTeacherModalList();
      teacherModal.classList.add('active');
    });

    btnCloseTeacherModal.addEventListener('click', () => {
      teacherModal.classList.remove('active');
    });

    document.getElementById('btnAddTeacher').addEventListener('click', async () => {
      const val = newTeacherInput.value;
      if (val && await storage.addTeacher(val)) {
        newTeacherInput.value = '';
        renderTeacherModalList();
        renderQuickTeacherSelect();
        renderView();
        showToast(`${val} hocalar listesine eklendi.`);
      }
    });
  }

  // Render Teacher List inside Modal
  function renderTeacherModalList() {
    teacherListContainer.innerHTML = '';
    (storage.teachers || []).forEach(t => {
      const li = document.createElement('li');
      li.className = 'teacher-item';
      li.innerHTML = `
        <span><i class="fa-solid fa-user-graduate"></i> ${t}</span>
        <button data-name="${t}"><i class="fa-solid fa-trash"></i></button>
      `;
      li.querySelector('button').addEventListener('click', async () => {
        await storage.removeTeacher(t);
        renderTeacherModalList();
        renderQuickTeacherSelect();
        renderView();
        showToast(`${t} silindi.`);
      });
      teacherListContainer.appendChild(li);
    });
  }

  // --- THEME UTILITY ---
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hafizlik_cizelgesi_theme', theme);
    const themeBtn = document.getElementById('btnThemeToggle');
    if (theme === 'dark') {
      themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
      themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
  }

  // --- HELPER UTILITIES ---
  function formatDateDisplay(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return dateStr;
  }

  function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let icon = 'fa-circle-check';
    let iconColor = 'var(--accent-emerald)';
    if (type === 'warning') {
      icon = 'fa-triangle-exclamation';
      iconColor = 'var(--accent-amber)';
    } else if (type === 'error') {
      icon = 'fa-circle-exclamation';
      iconColor = 'var(--accent-rose)';
    } else if (type === 'info') {
      icon = 'fa-circle-info';
      iconColor = 'var(--accent-blue)';
    }

    toast.innerHTML = `<i class="fa-solid ${icon}" style="color: ${iconColor}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Run initialization
  await init();
});
