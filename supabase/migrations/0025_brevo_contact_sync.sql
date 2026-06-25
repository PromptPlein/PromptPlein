-- 0025_brevo_contact_sync.sql
--
-- Synchroniseer elke nieuw aangemaakte gebruiker naar Brevo (contactlijst 14).
-- Een AFTER INSERT-trigger op public.profiles roept de Edge Function
-- `register-brevo-contact` asynchroon aan via pg_net. De functie-URL en het
-- gedeelde geheim worden uit Supabase Vault gelezen, zodat hier geen geheimen
-- in de migratie staan.
--
-- Benodigde Vault-secrets (los ingesteld, niet in git):
--   - brevo_function_url     → https://<ref>.supabase.co/functions/v1/register-brevo-contact
--   - brevo_webhook_secret   → hetzelfde geheim als de Edge Function-secret BREVO_WEBHOOK_SECRET
--   - project_anon_key       → de anon key (de functions-gateway eist een apikey/Authorization)

-- pg_net voor asynchrone HTTP vanuit Postgres.
create extension if not exists pg_net with schema extensions;

create or replace function public.sync_profile_to_brevo()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  fn_url    text;
  hook_secret text;
  anon_key  text;
begin
  -- Lees de configuratie uit Vault. Ontbreekt er iets, dan slaan we de
  -- synchronisatie stil over: een registratie mag nooit falen omdat Brevo
  -- (nog) niet is ingesteld.
  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'brevo_function_url';
  select decrypted_secret into hook_secret
    from vault.decrypted_secrets where name = 'brevo_webhook_secret';
  select decrypted_secret into anon_key
    from vault.decrypted_secrets where name = 'project_anon_key';

  if fn_url is null or hook_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', hook_secret,
      'Authorization', 'Bearer ' || coalesce(anon_key, ''),
      'apikey', coalesce(anon_key, '')
    ),
    body    := jsonb_build_object(
      'email', new.email,
      'fullName', new.full_name,
      'userId', new.id
    )
  );

  return new;
end;
$$;

-- Alleen als trigger gebruiken; niet via PostgREST blootstellen.
revoke execute on function public.sync_profile_to_brevo() from public, anon, authenticated;

drop trigger if exists trg_sync_profile_to_brevo on public.profiles;
create trigger trg_sync_profile_to_brevo
  after insert on public.profiles
  for each row execute function public.sync_profile_to_brevo();
