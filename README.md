# PontoNorte

Plataforma multiempresa de controle de ponto e gestão de jornada da CP Ocis.

## Produtos separados

- **Painel web:** administração da CP Ocis, empresas, RH e líderes.
- **Aplicativo Android:** instalado pelos funcionários para registrar o ponto.

O aplicativo não é uma página do painel. O código Android está em `mobile/` e o APK é gerado pelo workflow `.github/workflows/build-android.yml`.

## Acesso

- **Site:** https://delta-1.github.io/PontoNorte/
- **Manual completo:** [docs/MANUAL_COMPLETO.md](docs/MANUAL_COMPLETO.md)
- **APK Android:** https://github.com/Delta-1/PontoNorte/releases/download/android-latest/PontoNorte.apk

Na tela de login, o botão **Explorar demonstração** abre uma empresa fictícia em modo somente leitura, com tutorial em todas as abas.


Todos os usuários entram com:

1. código da empresa;
2. nome de usuário;
3. senha.

O RH cria uma senha provisória no cadastro do funcionário. A troca é obrigatória no primeiro acesso.

## Recursos de produção

- isolamento multiempresa por Row Level Security;
- perfis CP Ocis, proprietário, RH, líder e funcionário;
- funcionários, setores, líderes, jornadas e dispositivos;
- chamada diária por setor;
- confirmação de registros pelo líder sem alterar o ponto original;
- ponto pelo aplicativo ou QR Code temporário;
- localização, idempotência e trilha de auditoria;
- justificativas e documentos;
- relatórios exportáveis para Excel;
- aplicativo Android com histórico e perfil;
- modo demonstração público, isolado do banco e com visita guiada.

O método facial permanece bloqueado até a contratação e configuração de um fornecedor de prova de vida. Ele não é simulado.

## Desenvolvimento

Painel:

```bash
npm ci
npm run build:pages
```

Aplicativo:

```bash
cd mobile
npm ci
npm run android:sync
cd android
./gradlew assembleDebug
```

## Infraestrutura

- Supabase: projeto independente `PontoNorte`, região `sa-east-1`;
- GitHub Pages: painel web;
- GitHub Actions: publicação do painel e geração do APK;
- pacote Android: `br.com.cpusis.pontonorte`.

Chaves administrativas do Supabase nunca são incluídas no painel ou no aplicativo. Os clientes utilizam somente a chave publicável e as operações privilegiadas ficam em Edge Functions autenticadas.
