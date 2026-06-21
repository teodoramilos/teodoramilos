import { supabase } from './supabase.js';

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

// ── Challenge ─────────────────────────────────────────────────────────────────
export async function getChallenge(userId) {
  const { data } = await supabase
    .from('challenge')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function upsertChallenge(userId, fields) {
  const existing = await getChallenge(userId);
  if (existing) {
    const { error } = await supabase.from('challenge').update(fields).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('challenge').insert({ user_id: userId, ...fields });
    if (error) throw error;
  }
}

// ── Daily log ─────────────────────────────────────────────────────────────────
export async function getDailyLog(userId, date) {
  const { data } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', date)
    .maybeSingle();
  return data;
}

export async function upsertDailyLog(userId, date, fields) {
  const { error } = await supabase.from('daily_logs').upsert(
    { user_id: userId, log_date: date, ...fields },
    { onConflict: 'user_id,log_date' }
  );
  if (error) throw error;
}

// ── Food items ────────────────────────────────────────────────────────────────
export async function getFoodItems(userId, date) {
  const { data, error } = await supabase
    .from('food_items')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', date)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function insertFoodItem(userId, date, item) {
  const { data, error } = await supabase
    .from('food_items')
    .insert({ user_id: userId, log_date: date, ...item })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFoodItem(id) {
  const { error } = await supabase.from('food_items').delete().eq('id', id);
  if (error) throw error;
}

export async function updateFoodItem(id, fields) {
  const { error } = await supabase.from('food_items').update(fields).eq('id', id);
  if (error) throw error;
}

// ── Workout sessions ──────────────────────────────────────────────────────────
export async function getWeekSessions(userId, sinceDate) {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('session_date', sinceDate)
    .order('session_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function insertWorkoutSession(userId, session) {
  const { data, error } = await supabase
    .from('workout_sessions')
    .insert({ user_id: userId, ...session })
    .select()
    .single();
  if (error) throw error;

  // Auto-post a summary into the shared chat thread instead of emailing the coach.
  try {
    await sendMessage(userId, formatWorkoutSummary(data), 'workout_summary');
  } catch (e) {
    console.error('Failed to post workout summary to chat', e);
  }

  return data;
}

function formatWorkoutSummary(session) {
  const sets = Array.isArray(session.sets) ? session.sets : [];
  const byExercise = {};
  for (const s of sets) (byExercise[s.exercise] = byExercise[s.exercise] || []).push(s);
  const lines = Object.entries(byExercise).map(([name, exSets]) => {
    const loads = exSets.map(s => parseFloat(s.load) || 0).filter(n => n > 0);
    return loads.length ? `${name}: ${Math.max(...loads)}kg` : name;
  });
  const pct = Math.round((session.completion || 0) * 100);
  const parts = [`💪 ${session.workout_title || session.workout_id} — ${pct}% completed`, lines.join(' · ')];
  if (session.note) parts.push(`Note: ${session.note}`);
  return parts.filter(Boolean).join('\n');
}

export async function getLiftHistory(userId, exerciseName) {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('session_date, sets')
    .eq('user_id', userId)
    .order('session_date', { ascending: true });
  if (error) throw error;

  const history = [];
  for (const row of (data || [])) {
    const sets = Array.isArray(row.sets) ? row.sets : [];
    const exerciseSets = sets.filter(s => s.exercise === exerciseName && s.load);
    if (exerciseSets.length) {
      const maxLoad = Math.max(...exerciseSets.map(s => parseFloat(s.load) || 0));
      if (maxLoad > 0) history.push(maxLoad);
    }
  }
  return history;
}

// ── Check-ins ─────────────────────────────────────────────────────────────────
export async function getCheckins(userId) {
  const { data, error } = await supabase
    .from('checkins')
    .select('*, coach_notes(*)')
    .eq('user_id', userId)
    .order('checkin_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function insertCheckin(userId, fields) {
  const { data, error } = await supabase
    .from('checkins')
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestCheckin(userId) {
  const { data } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .order('checkin_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// ── Coach notes ───────────────────────────────────────────────────────────────
export async function upsertCoachNote(checkinId, coachId, note) {
  const existing = await getCoachNote(checkinId);
  if (existing) {
    const { error } = await supabase.from('coach_notes').update({ note, updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('coach_notes').insert({ checkin_id: checkinId, coach_id: coachId, note });
    if (error) throw error;
  }
}

export async function getCoachNote(checkinId) {
  const { data } = await supabase
    .from('coach_notes')
    .select('*')
    .eq('checkin_id', checkinId)
    .maybeSingle();
  return data;
}

// ── Export ────────────────────────────────────────────────────────────────────
export async function exportAllData(userId) {
  const [checkins, sessions, food] = await Promise.all([
    supabase.from('checkins').select('*').eq('user_id', userId).order('checkin_date'),
    supabase.from('workout_sessions').select('*').eq('user_id', userId).order('session_date'),
    supabase.from('food_items').select('*').eq('user_id', userId).order('log_date'),
  ]);
  return {
    checkins: checkins.data || [],
    sessions: sessions.data || [],
    food: food.data || [],
  };
}

// ── Full history (read policies are open to any authenticated user; RLS still
//    restricts writes to your own rows) ─────────────────────────────────────────
export async function getAllWorkoutSessions() {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*')
    .order('session_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

export async function getAllFoodItemsHistory() {
  const { data, error } = await supabase
    .from('food_items')
    .select('*')
    .order('log_date', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

export async function getAllDailyLogsHistory() {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .order('log_date', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

// ── Weekly summary (Check-in tab) — reads existing tables, no new table ────────
export async function getWeekSummary(numDays = 7) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const startDate = dates[0], endDate = dates[dates.length - 1];

  const [logsRes, foodRes, sessionsRes, checkinsRes] = await Promise.all([
    supabase.from('daily_logs').select('*').gte('log_date', startDate).lte('log_date', endDate),
    supabase.from('food_items').select('*').gte('log_date', startDate).lte('log_date', endDate),
    supabase.from('workout_sessions').select('*').gte('session_date', startDate).lte('session_date', endDate),
    supabase.from('checkins').select('*').order('checkin_date', { ascending: false }).limit(2),
  ]);

  return {
    dates,
    logs: logsRes.data || [],
    food: foodRes.data || [],
    sessions: sessionsRes.data || [],
    recentCheckins: checkinsRes.data || [],
  };
}

// ── Messages (chat) ─────────────────────────────────────────────────────────────
export async function getMessages(limit = 200) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function sendMessage(senderId, body, kind = 'chat') {
  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: senderId, body, kind })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestMessageTime() {
  const { data } = await supabase
    .from('messages')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? data.created_at : null;
}

// ── Coach: read all athlete data (no user_id filter — RLS lets coach see all rows) ──
export async function getAllAthleteData() {
  const [logs, checkins, sessions] = await Promise.all([
    supabase.from('daily_logs').select('*').order('log_date', { ascending: false }).limit(30),
    supabase.from('checkins').select('*, coach_notes(*)').order('checkin_date', { ascending: false }).limit(10),
    supabase.from('workout_sessions').select('*').order('session_date', { ascending: false }).limit(20),
  ]);
  return {
    logs: logs.data || [],
    checkins: checkins.data || [],
    sessions: sessions.data || [],
  };
}
