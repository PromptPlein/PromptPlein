-- 0018_prompt_versions_insert_policy.sql
--
-- Sta toe dat wie een prompt mag bewerken (admin of eigenaar) een versie vastlegt.
-- prompt_versions had alleen een SELECT-policy (versions_read); zonder INSERT-policy
-- blokkeert RLS het opslaan van versiegeschiedenis vanaf de client. Dit is nodig
-- voor de inline "Bewerken → Opslaan"-flow op de prompt-detailpagina, die bij elke
-- opslag een versie met een samenvatting van de wijzigingen wegschrijft.

create policy versions_insert_editor
  on public.prompt_versions
  for insert
  to authenticated
  with check (
    private.can_edit_prompt(prompt_id)
    and created_by = auth.uid()
  );
