# github_project_initiator

<details>
<summary>🌐 Languages · 30</summary>

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Português** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [বাংলা](README.bn.md) · [اردو](README.ur.md) · [فارسی](README.fa.md) · [Türkçe](README.tr.md) · [Tiếng Việt](README.vi.md) · [ไทย](README.th.md) · [Bahasa Indonesia](README.id.md) · [Bahasa Melayu](README.ms.md) · [Nederlands](README.nl.md) · [Polski](README.pl.md) · [Українська](README.uk.md) · [Svenska](README.sv.md) · [Čeština](README.cs.md) · [Română](README.ro.md) · [Ελληνικά](README.el.md) · [Magyar](README.hu.md) · [עברית](README.he.md)

</details>

> Um lançador local para todos os seus projetos do GitHub: status, iniciar/parar e atualização com um clique.

Serviço Node.js sem dependências com painel de página única. Monitora seus projetos, inicia e para, e baixa atualizações sem nunca modificar o código deles.

## Início rápido

```bash
node src/index.js
```

Abrir: http://127.0.0.1:8780

Requer Node.js 20+. Windows totalmente suportado; Linux/macOS usam a camada de plataforma integrada.

## Recursos

- **Status num relance** — estado, portas, PID e tempo ativo, atualizados a cada 3 s.
- **Iniciar / parar / reiniciar** — reutiliza o script de inicialização de cada projeto.
- **Atualização com um clique** — guarda temporariamente as alterações não confirmadas, atualiza e restaura; em caso de falha, reverte.
- **Qualquer stack** — Next.js, FastAPI, binários Go, Godot, pygame e serviços pip numa só tabela.
- **Adicionar projetos pelo painel** — escolha uma pasta e o comando de início e a porta são detectados automaticamente, sem editar JSON.
- **Interface bilíngue e tema claro/escuro** — alternância no cabeçalho, memorizada localmente.
- **Apenas lançador** — nunca executa git init nem escreve nos projetos gerenciados.

## Projetos gerenciados

| Projeto | Stack | Porta | Atualização |
|---|---|---|
| LibreTV | Next.js 15 | 8090 | sincronização de fork |
| githubPopularProjects | Next.js 15 | 3000 | git pull |
| AutoTestHub | FastAPI + Vue | 8686 / 5173 | git pull |
| qoder2api-hub | Python | 8790 | manual |
| wb2api-panel | Go | 7863 | manual |
| REA | TypeScript / CLI | — | manual |
| 2048 | pygame | — | git pull |
| Grimoire-Echoes | Godot 4 | — | git pull |
| OpenViking | Python | 1933 | manual |

## Segurança e isolamento

- Escuta apenas em 127.0.0.1, sem autenticação (ferramenta local de usuário único).
- Configuração e logs locais ficam fora do git; apenas um exemplo portátil é publicado.
- Nunca escreve nos projetos gerenciados; a única escrita é a atualização que você aciona.

## Documentação

- [Design e arquitetura (chinês)](../design.md)
- [README detalhado (chinês)](../README.full.zh-CN.md)
- `npm test` — 190 testes: análise, validação de configuração, fluxos git e renderização do painel
