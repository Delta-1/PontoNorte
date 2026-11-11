# Aplicativo do funcionário e atualizações

A versão 1.2.0 abre diretamente em **Meu ponto**, mesmo quando a última visita foi ao perfil ou histórico. O botão principal identifica entrada, intervalo, retorno ou saída. O QR fica como alternativa quando habilitado pela empresa. Pedidos simultâneos são bloqueados no app e uma tentativa que falha na rede conserva o identificador para nova tentativa. As regras de dispositivo, licença, localização e bloqueio do aparelho continuam válidas.

O Actions compila e publica sempre que `mobile/**` ou o workflow Android mudar na `main`. A compilação executa testes do fluxo, gera os arquivos web e testa/compila o código Android. O número de compilação cresce automaticamente.

## Atualização no aparelho

O app consulta o canal de produção automaticamente ao abrir e voltar ao primeiro plano, com intervalo de seis horas para evitar consultas excessivas. Há também **Perfil → Verificar atualização**. A consulta não impede bater ponto e não transmite o login ao GitHub.

Quando uma versão compatível estiver disponível, aparece **Atualizar**. O app baixa o APK, confere tamanho e SHA-256, verifica o identificador do pacote, a versão e a assinatura contra o app instalado. Somente então abre o instalador do Android. O usuário autoriza a instalação, podendo ser necessário permitir atualizações desse app nas configurações do Android. A atualização normal conserva o acesso e os dados locais.

O download é restrito ao repositório oficial, usa um endereço de versão específico e aceita redirecionamentos somente para os hosts HTTPS de distribuição do GitHub. O manifesto não pode direcionar o instalador a outro site. Arquivos com assinatura diferente nunca são oferecidos como atualização compatível.

## Ativação única da assinatura permanente

A versão antiga era compilada com uma chave de depuração criada no runner. Ela não garante a mesma assinatura entre compilações. A instalação inicial da nova linha de produção pode exigir remover o APK de teste antigo e entrar novamente; os registros no banco não são apagados por isso.

Cadastre os quatro **Actions secrets** do repositório `Delta-1/PontoNorte`:

| Secret | Conteúdo |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Keystore de produção codificado em Base64, sem quebras de linha |
| `ANDROID_KEYSTORE_PASSWORD` | Senha do keystore |
| `ANDROID_KEY_ALIAS` | Alias da chave de assinatura |
| `ANDROID_KEY_PASSWORD` | Senha dessa chave |

Use a mesma chave em todas as versões e guarde uma cópia privada. Nunca publique o keystore no código, em releases ou nos artefatos de compilação. Esses secrets não podem ser configurados pela integração GitHub disponível nesta sessão; a configuração deve ser concluída pelo administrador do repositório.

Com os secrets presentes, execute **Gerar aplicativo Android → Run workflow**. O fluxo cria uma release específica `android-v<versionCode>` e atualiza `android-latest`, com `PontoNorte.apk` e `update.json`. A chave é removida do runner antes de armazenar artefatos.

Sem os secrets, o workflow publica somente **PontoNorte-Teste.apk** no canal `android-preview`, com aviso de teste. Esse APK não sobrescreve o canal de produção e nunca é promovido a atualização automática. Isso permite revisar o layout sem comprometer a continuidade da assinatura.

## Validação necessária em Android físico

A compilação e os testes unitários não substituem a instalação física. Depois de configurar a chave, instale uma versão assinada em um Android de teste, entre, gere a compilação seguinte com a mesma chave, confirme o aviso, autorize a instalação e verifique se o acesso e os registros foram preservados. Verifique também cancelamento da permissão, download interrompido, pacote com assinatura incompatível e registro do ponto antes/depois da atualização. O Supabase do PontoNorte continua precisando de reconexão para os testes reais do cadastro por link e do totem.
