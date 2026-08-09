begin;
create extension if not exists pgtap;
select plan(6);

select is(fa_normalize('علي'), 'علی', 'Arabic yeh maps to Persian yeh');
select is(fa_normalize('كتاب'), 'کتاب', 'Arabic kaf maps to Persian kaf');
select is(fa_normalize('مدرسة'), 'مدرسه', 'teh marbuta maps to heh');
select is(fa_normalize('کتابِ خوب'), 'کتاب خوب', 'kasre/diacritics stripped');
select is(fa_normalize('می‌روم'), 'می روم', 'ZWNJ becomes a single space');
select is(fa_normalize('  سلام   دنیا '), 'سلام دنیا', 'whitespace collapsed and trimmed');

select * from finish();
rollback;
