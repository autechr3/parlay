-- Optional fully-vocalized (diacritics/harakat) rendering of a vocab item. The
-- plain `farsi` column stays the identity key for upserts and SRS history — the
-- vocalized form is display-only, shown when profiles.show_diacritics is on.
alter table vocab_items add column farsi_vocalized text;
alter table profiles add column show_diacritics boolean not null default true;
