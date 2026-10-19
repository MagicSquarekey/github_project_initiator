# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Un lanzador local para todos tus proyectos de GitHub: estado, inicio/parada y actualización con un clic.

Servicio Node.js sin dependencias con un panel de una sola página. Supervisa tus proyectos, los inicia y detiene, y descarga actualizaciones sin modificar nunca su código.

## Inicio rápido

```bash
node src/index.js
```

Abrir: http://127.0.0.1:8780

Requiere Node.js 20+. Windows totalmente compatible; Linux/macOS usan la capa de plataforma integrada.

## Funciones

- **Estado de un vistazo** — estado, puertos, PID y tiempo activo, actualizado cada 3 s.
- **Iniciar / detener / reiniciar** — reutiliza el script de inicio propio de cada proyecto.
- **Actualización con un clic** — guarda temporalmente los cambios sin confirmar, actualiza y los restaura; si falla, revierte.
- **Cualquier stack** — Next.js, FastAPI, binarios Go, Godot, pygame y servicios pip en una sola tabla.
- **Interfaz bilingüe y tema claro/oscuro** — cambio desde la cabecera, recordado localmente.
- **Solo lanzador** — nunca ejecuta git init ni escribe en los proyectos gestionados.

## Proyectos gestionados

| Proyecto | Stack | Puerto | Actualización |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | sincronización de fork |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manual |
| wb2api-panel | Go | 7863 | manual |
| REA | TypeScript / CLI | — | manual |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manual |

## Seguridad y aislamiento

- Escucha solo en 127.0.0.1, sin autenticación (herramienta local de un solo usuario).
- La configuración y los registros locales están excluidos de git; solo se publica un ejemplo portátil.
- Nunca escribe en los proyectos gestionados; la única escritura es la actualización que tú activas.

## Documentación

- [Diseño y arquitectura (chino)](../design.md)
- [README detallado (chino)](../README.full.zh-CN.md)
- `npm test` — 111 pruebas: análisis, validación de configuración, flujos git y renderizado del panel
