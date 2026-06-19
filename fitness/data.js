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
  // TODO: trigger coach notification here (e.g. Supabase Edge Function on workout_sessions insert)
  const { data, error } = await supabase
    .from('workout_sessions')
    .insert({ user_id: userId, ...session })
    .select()
    .single();
  if (error) throw error;
  return data;
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
