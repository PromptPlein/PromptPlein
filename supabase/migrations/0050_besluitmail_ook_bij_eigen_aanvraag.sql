-- 0050_besluitmail_ook_bij_eigen_aanvraag.sql
--
-- De indiener krijgt altijd een besluitmail, ook als die zijn eigen aanvraag
-- beoordeelt. Dat gebeurt bij beheerders en moderatoren, en zonder deze mail zag
-- het eruit alsof er niets gebeurde.

create or replace function private.approval_decided(
  p_status text, p_soort text, p_titel text, p_bereik text, p_toelichting text,
  p_requester uuid, p_reviewer uuid, p_link text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_requester is null then
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

revoke execute on function private.approval_decided(text, text, text, text, text, uuid, uuid, text) from public, anon, authenticated;
