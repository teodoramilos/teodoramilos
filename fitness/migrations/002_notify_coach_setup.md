# Coach email notification — one-time setup

The function code lives at `supabase/functions/notify-coach/index.ts`. It can't be
deployed from this repo automatically — you need the Supabase CLI and a Resend account.

## 1. Resend account
1. Sign up at resend.com, grab an API key (Dashboard → API Keys).
2. The sandbox sender `onboarding@resend.dev` works without setup but Resend may
   restrict it to your own account email. To send to your boyfriend's email reliably,
   verify a domain you own under Resend → Domains, then set `NOTIFY_FROM_ADDRESS`
   (step 4) to an address on that domain.

## 2. Supabase CLI
```
npm install -g supabase
supabase login
supabase link --project-ref nspjxblzoymgcaxbngft
```

## 3. Deploy the function
```
supabase functions deploy notify-coach --no-verify-jwt
```
`--no-verify-jwt` is required because the database webhook calls this function
without a user login token — verification instead uses the shared secret below.

## 4. Set secrets
```
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set WEBHOOK_SECRET=<make up a long random string>
supabase secrets set NOTIFY_FROM_ADDRESS="Fitness Tracker <you@yourdomain.com>"
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — don't set them.)

## 5. Database Webhook
In the Supabase dashboard: Database → Webhooks → Create a new webhook
- Table: `workout_sessions`
- Events: `Insert`
- Type: HTTP Request
- URL: `https://nspjxblzoymgcaxbngft.functions.supabase.co/notify-coach`
- HTTP Headers: `x-webhook-secret: <same random string from step 4>`
- Method: POST

## 6. Run the workout-note migration too
If you haven't already, run `001_add_workout_note.sql` in the SQL editor — the
email includes the note field.

Once all six steps are done, finishing a workout in the app will insert into
`workout_sessions`, the webhook fires, and the coach gets an email.
