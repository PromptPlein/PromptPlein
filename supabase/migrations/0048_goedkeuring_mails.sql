-- 0048_goedkeuring_mails.sql
--
-- Mails rond goedkeuring. Wie iets indient krijgt een bevestiging, wie mag
-- beoordelen krijgt bericht dat er iets wacht, en de indiener hoort het besluit.
-- Geldt voor prompts op ministerie- of Rijksoverheid-niveau (prompt_visibility)
-- en voor aanvragen van categorieën en functies.
--
-- De triggers sturen een gebeurtenis naar de edge function `brevo-event`; in
-- Brevo verstuurt per gebeurtenis een automation de mail. Een storing bij Brevo
-- mag een aanvraag of besluit nooit tegenhouden, vandaar de exception-tak.
--
-- Gebruikt de bestaande Vault-secrets uit 0025: brevo_function_url,
-- brevo_webhook_secret en project_anon_key.

-- 1. Gebeurtenis versturen.
create or replace function private.brevo_event(p_event text, p_recipients jsonb, p_properties jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  fn_url      text;
  hook_secret text;
  anon_key    text;
begin
  if p_recipients is null or jsonb_array_length(p_recipients) = 0 then
    return;
  end if;

  select decrypted_secret into fn_url
    from vault.decrypted_secrets where name = 'brevo_function_url';
  select decrypted_secret into hook_secret
    from vault.decrypted_secrets where name = 'brevo_webhook_secret';
  select decrypted_secret into anon_key
    from vault.decrypted_secrets where name = 'project_anon_key';

  if fn_url is null or hook_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := replace(fn_url, 'register-brevo-contact', 'brevo-event'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', hook_secret,
      'Authorization', 'Bearer ' || coalesce(anon_key, ''),
      'apikey', coalesce(anon_key, '')
    ),
    body    := jsonb_build_object(
      'event', p_event,
      'recipients', p_recipients,
      'properties', p_properties
    )
  );
exception when others then
  raise warning 'brevo_event mislukt: %', sqlerrm;
end;
$$;

-- 2. Ontvangers. De testaccounts op @promptplein.app hebben geen postvak.
create or replace function private.mail_recipient(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', p.email,
           'voornaam', split_part(coalesce(p.full_name, ''), ' ', 1)
         )), '[]'::jsonb)
  from profiles p
  where p.id = p_user
    and p.email is not null
    and p.email not ilike '%@promptplein.app'
$$;

-- Beoordelaars: de moderatoren van het ministerie. Is er geen (ander) dan de
-- beheerders, net als voor Rijksoverheid, categorieën en functies. De indiener
-- krijgt geen bericht over zijn eigen aanvraag.
create or replace function private.approval_reviewers(p_org uuid, p_requester uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  result jsonb := '[]'::jsonb;
begin
  if p_org is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'email', p.email,
             'voornaam', split_part(coalesce(p.full_name, ''), ' ', 1)
           )), '[]'::jsonb)
      into result
      from profiles p
      where p.email is not null
        and p.email not ilike '%@promptplein.app'
        and p.id is distinct from p_requester
        and p.id in (
          select m.user_id from organization_moderators m
          where m.organization_id in (p_org, private.ministry_root_id(p_org))
        );
  end if;

  if jsonb_array_length(result) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'email', p.email,
             'voornaam', split_part(coalesce(p.full_name, ''), ' ', 1)
           )), '[]'::jsonb)
      into result
      from profiles p
      where p.role in ('admin', 'super_admin')
        and p.email is not null
        and p.id is distinct from p_requester;
  end if;

  return result;
end;
$$;

-- 3. De twee momenten, gedeeld door alle soorten aanvragen.
create or replace function private.approval_submitted(
  p_soort text, p_titel text, p_bereik text, p_toelichting text,
  p_requester uuid, p_org uuid, p_link_indiener text, p_link_beoordelaar text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  naam text;
begin
  perform private.brevo_event(
    'promptplein_aanvraag_ingediend',
    private.mail_recipient(p_requester),
    jsonb_build_object('soort', p_soort, 'titel', p_titel, 'bereik', p_bereik,
                       'link', p_link_indiener)
  );

  select coalesce(nullif(trim(full_name), ''), email) into naam
    from profiles where id = p_requester;

  perform private.brevo_event(
    'promptplein_goedkeuring_wacht',
    private.approval_reviewers(p_org, p_requester),
    jsonb_build_object('soort', p_soort, 'titel', p_titel, 'bereik', p_bereik,
                       'aanvrager', naam, 'toelichting', p_toelichting,
                       'link', p_link_beoordelaar)
  );
end;
$$;

create or replace function private.approval_decided(
  p_status text, p_soort text, p_titel text, p_bereik text, p_toelichting text,
  p_requester uuid, p_reviewer uuid, p_link text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Wie zijn eigen aanvraag afhandelt, hoeft daar geen mail over.
  if p_requester is null or p_requester is not distinct from p_reviewer then
    return;
  end if;

  perform private.brevo_event(
    case when p_status = 'approved'
      then 'promptplein_aanvraag_goedgekeurd'
      else 'promptplein_aanvraag_afgewezen' end,
    private.mail_recipient(p_requester),
    jsonb_build_object('soort', p_soort, 'titel', p_titel, 'bereik', p_bereik,
                       'toelichting', p_toelichting, 'link', p_link)
  );
end;
$$;

-- 4. Trigger voor prompts. De afdeling is direct goedgekeurd en doet niet mee.
create or replace function private.visibility_mail()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  titel    text;
  indiener uuid;
  bereik   text;
  link     text;
begin
  if NEW.level not in ('ministry', 'public') then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  select p.title, p.created_by_user into titel, indiener
    from prompts p where p.id = NEW.prompt_id;

  if NEW.level = 'public' then
    bereik := 'Rijksoverheid';
  else
    select case when o.name ilike 'ministerie%' then o.name
                else 'Ministerie van ' || o.name end
      into bereik
      from organizations o where o.id = NEW.org_id;
  end if;

  link := 'https://www.promptplein.app/prompt/' || NEW.prompt_id;

  if NEW.status = 'pending' then
    perform private.approval_submitted(
      'Prompt', titel, bereik, null, indiener,
      case when NEW.level = 'ministry' then NEW.org_id end,
      link, 'https://www.promptplein.app/goedkeuringen'
    );
  elsif TG_OP = 'UPDATE' and NEW.status in ('approved', 'rejected') then
    perform private.approval_decided(
      NEW.status, 'Prompt', titel, bereik, NEW.note, indiener, NEW.reviewed_by, link
    );
  end if;

  return NEW;
exception when others then
  raise warning 'visibility_mail mislukt: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_visibility_mail on public.prompt_visibility;
create trigger trg_visibility_mail
  after insert or update of status on public.prompt_visibility
  for each row execute function private.visibility_mail();

-- 5. Trigger voor aanvragen van categorieën en functies.
create or replace function private.request_mail()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  soort text := case when TG_TABLE_NAME = 'category_requests' then 'Categorie' else 'Functie' end;
  queue text := case when TG_TABLE_NAME = 'category_requests'
                     then 'categorie-aanvragen' else 'functie-aanvragen' end;
begin
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  if NEW.status = 'pending' then
    perform private.approval_submitted(
      soort, NEW.name, null, NEW.motivation, NEW.requested_by, null,
      'https://www.promptplein.app', 'https://www.promptplein.app/admin/' || queue
    );
  elsif TG_OP = 'UPDATE' and NEW.status in ('approved', 'rejected') then
    perform private.approval_decided(
      NEW.status, soort, NEW.name, null, NEW.review_note,
      NEW.requested_by, NEW.reviewed_by, 'https://www.promptplein.app'
    );
  end if;

  return NEW;
exception when others then
  raise warning 'request_mail mislukt: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_category_request_mail on public.category_requests;
create trigger trg_category_request_mail
  after insert or update of status on public.category_requests
  for each row execute function private.request_mail();

drop trigger if exists trg_function_request_mail on public.function_requests;
create trigger trg_function_request_mail
  after insert or update of status on public.function_requests
  for each row execute function private.request_mail();

-- Alleen als trigger gebruiken; niet via PostgREST blootstellen.
revoke execute on function private.brevo_event(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function private.mail_recipient(uuid) from public, anon, authenticated;
revoke execute on function private.approval_reviewers(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.approval_submitted(text, text, text, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function private.approval_decided(text, text, text, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.visibility_mail() from public, anon, authenticated;
revoke execute on function private.request_mail() from public, anon, authenticated;
