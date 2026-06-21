// Triggered by a Database Webhook on INSERT to public.workout_sessions.
// Emails the coach a summary of the workout (exercises, sets, reps, load, note).
//
// Deploy + configure: see fitness/migrations/002_notify_coach_setup.md
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');
const FROM_ADDRESS = Deno.env.get('NOTIFY_FROM_ADDRESS') || 'Fitness Tracker <onboarding@resend.dev>';

Deno.serve(async (req) => {
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await req.json();
  if (payload.type !== 'INSERT' || payload.table !== 'workout_sessions') {
    return new Response('ignored', { status: 200 });
  }

  const session = payload.record;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: coachProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'coach')
    .limit(1)
    .maybeSingle();

  if (!coachProfile) return new Response('no coach found', { status: 200 });

  const { data: coachUser } = await admin.auth.admin.getUserById(coachProfile.id);
  const coachEmail = coachUser?.user?.email;
  if (!coachEmail) return new Response('coach has no email on file', { status: 200 });

  const sets: Array<{ exercise: string; load: string; reps: string; done: boolean }> =
    Array.isArray(session.sets) ? session.sets : [];
  const byExercise: Record<string, typeof sets> = {};
  for (const s of sets) (byExercise[s.exercise] ||= []).push(s);

  const exerciseLines = Object.entries(byExercise)
    .map(([name, exSets]) => {
      const lines = exSets
        .map((s, i) => `  Set ${i + 1}: ${s.load || '–'}kg × ${s.reps || '–'} reps${s.done ? '' : ' (not completed)'}`)
        .join('\n');
      return `${name}\n${lines}`;
    })
    .join('\n\n');

  const completionPct = Math.round((session.completion || 0) * 100);
  const text = [
    `${session.workout_title || session.workout_id} — ${session.session_date}`,
    `Completion: ${completionPct}%`,
    '',
    exerciseLines,
    session.note ? `\nNote: ${session.note}` : '',
  ].join('\n');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: coachEmail,
      subject: `Workout logged: ${session.workout_title || session.workout_id}`,
      text,
    }),
  });

  return new Response('ok', { status: 200 });
});
