create or replace function fa_normalize(input text)
returns text
language sql
immutable
strict
as $$
  select trim(
    regexp_replace(          -- collapse runs of whitespace
      regexp_replace(        -- ZWNJ -> space
        regexp_replace(      -- strip harakat U+064B..U+0652
          translate(input, 'يكةأإآؤئ', 'یکهاااوی'),
          '[ً-ْ]', '', 'g'
        ),
        '‌', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;
