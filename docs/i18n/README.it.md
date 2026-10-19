# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **Italiano** · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Un launcher locale per tutti i tuoi progetti GitHub: stato, avvio/arresto e aggiornamento con un clic.

Servizio Node.js senza dipendenze con dashboard a pagina singola. Monitora i progetti, li avvia e li arresta e scarica gli aggiornamenti senza mai modificarne il codice.

## Avvio rapido

```bash
node src/index.js
```

Apri: http://127.0.0.1:8780

Richiede Node.js 20+. Windows pienamente supportato; Linux/macOS usano il livello di piattaforma integrato.

## Funzioni

- **Stato a colpo d'occhio** — stato, porte, PID e tempo di attività, aggiornati ogni 3 s.
- **Avvia / arresta / riavvia** — riutilizza lo script di avvio di ciascun progetto.
- **Aggiornamento con un clic** — salva temporaneamente le modifiche non confermate, aggiorna e le ripristina; in caso di errore esegue il rollback.
- **Qualsiasi stack** — Next.js, FastAPI, binari Go, Godot, pygame e servizi pip in un'unica tabella.
- **Interfaccia bilingue e tema chiaro/scuro** — cambio dall'intestazione, memorizzato localmente.
- **Solo launcher** — non esegue mai git init né scrive nei progetti gestiti.

## Progetti gestiti

| Progetto | Stack | Porta | Aggiornamento |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | sincronizzazione fork |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manuale |
| wb2api-panel | Go | 7863 | manuale |
| REA | TypeScript / CLI | — | manuale |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manuale |

## Sicurezza e isolamento

- Ascolta solo su 127.0.0.1, senza autenticazione (strumento locale per singolo utente).
- Configurazione e log locali sono esclusi da git; viene pubblicato solo un esempio portabile.
- Non scrive mai nei progetti gestiti; l'unica scrittura è l'aggiornamento che avvii tu.

## Documentazione

- [Design e architettura (cinese)](../design.md)
- [README dettagliato (cinese)](../README.full.zh-CN.md)
- `npm test` — 111 test: parsing, validazione della configurazione, flussi git e rendering della dashboard
