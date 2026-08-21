/**
 * Supabase Service Layer
 * Handles all database operations and Realtime synchronization.
 */

class SupabaseService {
  constructor() {
    this.client = window.supabaseClient;
    this.isOnline = false;
    this.statusListeners = [];
  }

  onStatusChange(callback) {
    this.statusListeners.push(callback);
  }

  notifyStatus(status, message = '') {
    this.isOnline = status;
    this.statusListeners.forEach(cb => cb(status, message));
  }

  async checkConnection() {
    if (!this.client) {
      this.notifyStatus(false, 'Supabase istemcisi başlatılamadı.');
      return false;
    }
    try {
      const { data, error } = await this.client.from('teachers').select('count', { count: 'exact', head: true });
      if (error) {
        console.warn('Supabase test sorgusu hatası:', error);
        this.notifyStatus(false, error.message);
        return false;
      }
      this.notifyStatus(true, 'Supabase Bulut Bağlantısı Aktif');
      return true;
    } catch (err) {
      console.error('Supabase bağlantı hatası:', err);
      this.notifyStatus(false, err.message);
      return false;
    }
  }

  // --- TEACHERS CRUD ---
  async getTeachers() {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client
        .from('teachers')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        // Tablo boşsa varsayılan hocaları ekle
        await this.seedDefaultTeachers();
        return DEFAULT_TEACHERS;
      }
      return data.map(t => t.name);
    } catch (err) {
      console.error('Hocalar yüklenirken hata:', err);
      return null;
    }
  }

  async seedDefaultTeachers() {
    if (!this.client) return;
    try {
      const rows = DEFAULT_TEACHERS.map(name => ({ name }));
      await this.client.from('teachers').upsert(rows, { onConflict: 'name' });
    } catch (err) {
      console.error('Varsayılan hocalar eklenirken hata:', err);
    }
  }

  async addTeacher(name) {
    if (!this.client || !name) return false;
    try {
      const { error } = await this.client.from('teachers').insert([{ name: name.trim() }]);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Hoca eklenirken hata:', err);
      return false;
    }
  }

  async removeTeacher(name) {
    if (!this.client || !name) return false;
    try {
      const { error } = await this.client.from('teachers').delete().eq('name', name.trim());
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Hoca silinirken hata:', err);
      return false;
    }
  }

  // --- ROUNDS & JUZS CRUD ---
  async getRounds() {
    if (!this.client) return null;
    try {
      const { data: rounds, error: rErr } = await this.client
        .from('rounds')
        .select('*')
        .order('round_number', { ascending: true });

      if (rErr) throw rErr;

      if (!rounds || rounds.length === 0) {
        // Hiç dönüş yoksa 1. Dönüşü oluştur
        const initialRound = await this.createRound(1, '1. Dönüş');
        return [initialRound];
      }

      // Her dönüş için cüzleri çek
      const roundIds = rounds.map(r => r.id);
      const { data: juzs, error: jErr } = await this.client
        .from('juz_records')
        .select('*')
        .in('round_id', roundIds)
        .order('juz_number', { ascending: true });

      if (jErr) throw jErr;

      // Cüzleri ait oldukları dönüşlere yerleştir
      const formattedRounds = rounds.map(r => {
        const roundJuzs = (juzs || []).filter(j => j.round_id === r.id);
        
        // 1'den 30'a eksik cüz varsa doldur
        const completeJuzs = [];
        for (let i = 1; i <= 30; i++) {
          const found = roundJuzs.find(j => j.juz_number === i);
          if (found) {
            completeJuzs.push({
              id: found.juz_number,
              record_id: found.id,
              name: `${found.juz_number}. Cüz`,
              date: found.date || '',
              teacher: found.teacher || '',
              status: found.status || 'empty',
              note: found.note || ''
            });
          } else {
            completeJuzs.push({
              id: i,
              name: `${i}. Cüz`,
              date: '',
              teacher: '',
              status: 'empty',
              note: ''
            });
          }
        }

        return {
          id: r.id,
          name: r.name,
          round_number: r.round_number,
          createdDate: r.created_date || r.created_at?.split('T')[0] || '',
          juzs: completeJuzs
        };
      });

      return formattedRounds;
    } catch (err) {
      console.error('Dönüşler yüklenirken hata:', err);
      return null;
    }
  }

  async createRound(roundNumber, name) {
    if (!this.client) return null;
    try {
      const roundName = name || `${roundNumber}. Dönüş`;
      const { data: round, error: rErr } = await this.client
        .from('rounds')
        .insert([{
          round_number: roundNumber,
          name: roundName,
          created_date: new Date().toISOString().split('T')[0]
        }])
        .select()
        .single();

      if (rErr) throw rErr;

      // 30 adet boş cüz kaydı oluştur
      const juzRecords = [];
      for (let i = 1; i <= 30; i++) {
        juzRecords.push({
          round_id: round.id,
          juz_number: i,
          date: null,
          teacher: null,
          status: 'empty',
          note: ''
        });
      }

      const { data: createdJuzs, error: jErr } = await this.client
        .from('juz_records')
        .insert(juzRecords)
        .select();

      if (jErr) throw jErr;

      const formattedJuzs = (createdJuzs || juzRecords).map(j => ({
        id: j.juz_number,
        record_id: j.id,
        name: `${j.juz_number}. Cüz`,
        date: j.date || '',
        teacher: j.teacher || '',
        status: j.status || 'empty',
        note: j.note || ''
      }));

      return {
        id: round.id,
        name: round.name,
        round_number: round.round_number,
        createdDate: round.created_date,
        juzs: formattedJuzs
      };
    } catch (err) {
      console.error('Yeni dönüş oluşturulurken hata:', err);
      return null;
    }
  }

  async deleteRound(roundId) {
    if (!this.client || !roundId) return false;
    try {
      const { error } = await this.client.from('rounds').delete().eq('id', roundId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Dönüş silinirken hata:', err);
      return false;
    }
  }

  async updateJuzRecord(roundId, juzNumber, fields) {
    if (!this.client) return false;
    try {
      const status = (fields.date || fields.teacher) ? 'completed' : 'empty';
      const payload = {
        round_id: roundId,
        juz_number: juzNumber,
        date: fields.date || null,
        teacher: fields.teacher || null,
        status: status,
        note: fields.note || '',
        updated_at: new Date().toISOString()
      };

      const { error } = await this.client
        .from('juz_records')
        .upsert(payload, { onConflict: 'round_id,juz_number' });

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Cüz güncellenirken hata:', err);
      return false;
    }
  }

  async clearRoundJuzs(roundId) {
    if (!this.client || !roundId) return false;
    try {
      const { error } = await this.client
        .from('juz_records')
        .update({
          date: null,
          teacher: null,
          status: 'empty',
          note: '',
          updated_at: new Date().toISOString()
        })
        .eq('round_id', roundId);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Dönüş temizlenirken hata:', err);
      return false;
    }
  }

  // --- BULK SAMPLE DATA IMPORT ---
  async importAllData(sampleData) {
    if (!this.client || !sampleData || !sampleData.rounds) return false;
    try {
      // 1. Mevcut tüm rounds ve juz_records kayıtlarını temizle
      await this.client.from('rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 2. Her bir dönüşü ve cüzlerini ekle
      for (let i = 0; i < sampleData.rounds.length; i++) {
        const r = sampleData.rounds[i];
        const roundNumber = i + 1;

        const { data: newRound, error: rErr } = await this.client
          .from('rounds')
          .insert([{
            round_number: roundNumber,
            name: r.name,
            created_date: r.createdDate || new Date().toISOString().split('T')[0]
          }])
          .select()
          .single();

        if (rErr) throw rErr;

        // Cüz kayıtlarını hazırla
        const juzRows = r.juzs.map(j => ({
          round_id: newRound.id,
          juz_number: j.id,
          date: j.date || null,
          teacher: j.teacher || null,
          status: (j.date || j.teacher || j.status === 'completed') ? 'completed' : 'empty',
          note: j.note || ''
        }));

        const { error: jErr } = await this.client.from('juz_records').insert(juzRows);
        if (jErr) throw jErr;
      }

      return true;
    } catch (err) {
      console.error('Toplu veri aktarılırken hata:', err);
      return false;
    }
  }

  // --- REALTIME SUBSCRIPTIONS ---
  setupRealtime(onUpdateCallback) {
    if (!this.client) return;

    try {
      const channel = this.client
        .channel('db-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'juz_records' },
          (payload) => {
            console.log('Realtime Cüz Güncellemesi:', payload);
            if (onUpdateCallback) onUpdateCallback('juz_records', payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rounds' },
          (payload) => {
            console.log('Realtime Dönüş Güncellemesi:', payload);
            if (onUpdateCallback) onUpdateCallback('rounds', payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'teachers' },
          (payload) => {
            console.log('Realtime Hoca Güncellemesi:', payload);
            if (onUpdateCallback) onUpdateCallback('teachers', payload);
          }
        )
        .subscribe((status) => {
          console.log('Supabase Realtime Abonelik Durumu:', status);
        });

      return channel;
    } catch (err) {
      console.error('Realtime abonelik hatası:', err);
    }
  }
}

window.supabaseService = new SupabaseService();
