# PontoNorte

Plataforma de controle de ponto e gestão de jornada da CPUSIS.

O projeto reúne duas experiências:

- painel administrativo para RH, gestores e líderes de setor;
- aplicativo móvel para o colaborador registrar o ponto.

## Acessos

- Painel: `/PontoNorte/`
- Aplicativo: `/PontoNorte/app-ponto`

## Recursos demonstrados

- visão diária da jornada;
- cadastro e acompanhamento de funcionários;
- setores com líderes responsáveis;
- chamada por setor;
- registro por QR Code, reconhecimento facial ou botão no aplicativo;
- ocorrências, justificativas e relatórios.

## Desenvolvimento

Requer Node.js 22 ou superior.

```bash
npm install
npm run dev
```

Para gerar a versão estática usada pelo GitHub Pages:

```bash
NEXT_PUBLIC_BASE_PATH=/PontoNorte npm run build:pages
```

## Publicação

O workflow `.github/workflows/deploy-pages.yml` gera e publica o diretório `out` automaticamente no GitHub Pages a cada atualização da branch `main`.

> A versão atual é um protótipo navegável. Autenticação real, banco de dados, biometria e registros oficiais ainda dependem da integração com o backend.
