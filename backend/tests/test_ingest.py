import sys

sys.dont_write_bytecode = True

from backend.routers.ingest import _parse_csv


def test_parse_csv_prefers_resume_str_over_resume_html() -> None:
    content = (
        "ID,Resume_str,Resume_html,Category\n"
        '42,"Plain resume text","<html><body>Longer HTML resume text</body></html>",Engineering\n'
    ).encode("utf-8")

    assert _parse_csv(content) == [("42", "Plain resume text")]


def test_parse_csv_ignores_html_column_when_guessing_content() -> None:
    content = (
        "ID,Profile,Profile_html\n"
        'abc,"Readable profile","<html><body>Verbose profile markup with tags</body></html>"\n'
    ).encode("utf-8")

    assert _parse_csv(content) == [("abc", "Readable profile")]
