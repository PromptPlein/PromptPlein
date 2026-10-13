-- 0038_rollen_digitaal.sql
-- Twee functies voor wie aan digitale systemen werkt: de informatieadviseur
-- (informatievoorziening, architectuur, standaarden) en de ontwikkelaar
-- (software en API's). Daarmee kan een prompt over een API, open source of de
-- toegankelijkheid van een website bij de juiste functie worden opgeslagen en
-- gevonden. De categorie "Applicatie ontwikkeling" bestaat al.
--
-- Idempotent: een functie die al bestaat (zelfde naam) wordt overgeslagen.

insert into public.roles (name, description)
select v.name, v.description
from (
  values
    ('Informatieadviseur', 'Advies over informatievoorziening, architectuur en standaarden.'),
    ('Ontwikkelaar', 'Bouwt en onderhoudt software en API''s.')
) as v(name, description)
where not exists (select 1 from public.roles r where r.name = v.name);
