# Acesso simples do PontoNorte

A visão geral concentra links da equipe, indicadores e acompanhamento do ponto. Funcionários e relatórios ficam no topo; as outras ferramentas estão em **Mais**.

## Responsável

Entre na empresa, escolha **Ativar links da empresa** e depois **Copiar link de cadastro**. Envie o link somente à equipe: quem o recebe pode criar uma conta de funcionário, nunca de administrador. O aparelho do primeiro cadastro é autorizado. Outros aparelhos continuam seguindo as configurações atuais da empresa.

O convite pede nome completo, telefone, usuário e senha definitiva. A empresa já está vinculada pelo link. A pessoa não precisa trocar senha provisória nem preencher outra ficha para começar. O RH pode completar os dados depois.

**Gerenciar link de cadastro** permite desativar o convite ou gerar outro, invalidando o anterior.

## Funcionário

Abra o link, preencha os quatro campos, toque em **Criar minha conta** e depois **Entrar e usar o ponto**. Nas próximas visitas, use o usuário e a senha escolhidos no acesso da empresa.

## Totem

Escolha **Abrir totem** ou copie o link para o computador/tablet da empresa. Cada funcionário usa seu usuário e senha e toca em **Registrar ponto**. O sistema identifica entrada, início/fim de intervalo e saída automaticamente. Os campos são apagados após o sucesso; a confirmação desaparece em cinco segundos. Em aparelhos compartilhados, mantenha o preenchimento automático do navegador desativado.

O totem fica vinculado ao primeiro aparelho que registrar. Para trocar, vá a **Mais → Terminais → Liberar outro aparelho**. Para bloquear o link do totem, desative o terminal. Esse acesso não abre o painel administrativo. Terminais com exigência de localização continuam usando o aplicativo configurado.

## Ativação técnica pendente

O banco do PontoNorte é `eqjgumevweiswqhogvgk`. A conexão Supabase disponível nesta sessão só tem os projetos do Observatório; não substitua o banco do PontoNorte por um deles. Sem o serviço publicado, a interface sinaliza a pendência e mantém os links indisponíveis. O cadastro manual continua disponível.

Com acesso ao projeto correto, publique somente `team-access`, incluindo `index.ts`, `domain.ts` e `../_shared/cors.ts`. O `verify_jwt = false` aplica-se somente à função nova: ações administrativas verificam JWT e vínculo no servidor; ações públicas validam links assinados com HMAC e escopo restrito. Não há migração de schema ou variável nova.

Antes de liberar o uso real, valide em uma empresa de teste: emissão dos links pelo dono/RH, cadastro curto, login, registro pelo celular, ponto no totem, bloqueio em outro aparelho e revogação do convite. Limpe as contas de teste depois. Os testes locais com simulações não substituem essa validação no banco.
