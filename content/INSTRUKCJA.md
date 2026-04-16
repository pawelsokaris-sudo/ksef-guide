# Jak dodac artykul na ksef.faktura-nt.pl

> PRZECZYTAJ TO ZANIM DOTKNIESZ articles.json

## Poprawne nazwy pol (KRYTYCZNE)

```
content    — NIE blocks
date       — NIE updated
subtitle   — opcjonalne
promoted   — opcjonalne (true/false)
```

## Wymagana struktura artykulu

```json
{
  "id": "art-XXX",
  "title": "Tytul artykulu",
  "subtitle": "Opcjonalny podtytul",
  "date": "2026-04-15",
  "tags": ["tag1", "tag2"],
  "promoted": false,
  "content": [
    { "type": "alert", "severity": "warning", "value": "HTML tresc" },
    { "type": "heading", "value": "Naglowek sekcji" },
    { "type": "text", "value": "Tekst akapitu z <strong>HTML</strong>" },
    { "type": "list", "items": ["Punkt 1", "Punkt 2", "Punkt 3"] },
    { "type": "divider", "value": "" },
    { "type": "code", "value": "Sciezka: Menu > Podmenu > Opcja" }
  ]
}
```

## Typy content blokow

| type      | severity              | Opis                          |
|-----------|-----------------------|-------------------------------|
| alert     | error/warning/info    | Kolorowy box ostrzezenia      |
| heading   | —                     | Naglowek sekcji (h3)         |
| text      | —                     | Akapit (HTML dozwolony)      |
| list      | —                     | Lista punktowa (pole: items) |
| divider   | —                     | Linia rozdzielajaca          |
| code      | —                     | Blok kodu/sciezki            |

## Procedura dodawania

### 1. Backup
```bash
cp /var/www/ksef-guide/content/articles.json /var/www/ksef-guide/content/articles.json.bak-$(date +%Y%m%d)
```

### 2. Edytuj articles.json
Dodaj nowy obiekt na KONCU tablicy (przed `]`).
PAMIETAJ o przecinku po poprzednim artykule.

### 3. Waliduj JSON
```bash
python3 -c "import json; json.load(open('/var/www/ksef-guide/content/articles.json')); print('OK')"
```

### 4. Sprawdz sections.json
Artykul MUSI byc dodany do odpowiedniej sekcji w `sections.json`.
Jesli nie dodasz — artykul istnieje ale NIE pojawi sie na stronie.

### 5. Gotowe
Strona laduje articles.json dynamicznie. NIE trzeba restartowac.
Odswiez strone w przegladarce.

## Obrazki
- Katalog: `/var/www/ksef-guide/img/`
- Konwencja nazw: `art019-step1.png`, `art019-step2.png`
- Uzycie w tresci:
```json
{ "type": "text", "value": "<img src='img/art019-step1.png' style='max-width:100%; border-radius:8px; margin:8px 0'>" }
```

## Linki miedzy artykulami
```html
<a href="#art-003">Tekst linku</a>
```
script.js automatycznie obsluguje nawigacje `#art-XXX`.

## NAJCZESTSZE BLEDY
- `blocks` zamiast `content` → artykul pusty
- `updated` zamiast `date` → brak daty
- Brak przecinka przed nowym obiektem → JSON INVALID
- Brak wpisu w sections.json → artykul niewidoczny
- Polskie znaki bez UTF-8 → krzaczki
